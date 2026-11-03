import sharp from "sharp";
import { db, siteAssets, usageRecords } from "../db";
import { env } from "../env";
import { llmProvider, monthSpendUsd } from "./llm";

/** Image model on OpenRouter. Override with LLM_IMAGE_MODEL (e.g. black-forest-labs/flux.2-pro for more photorealism). */
export function imageModel() {
  return env().LLM_IMAGE_MODEL || "google/gemini-2.5-flash-image";
}

export function imagesAvailable() {
  return llmProvider() === "openrouter" && env().SITE_IMAGES > 0;
}

const ASPECTS = new Set(["1:1", "4:5", "3:4", "4:3", "3:2", "2:3", "16:9", "9:16", "21:9"]);

/**
 * Generates one photo through OpenRouter's image endpoint, converts it to WebP (max 1920 px)
 * and stores it. Returns the public path, or null on failure (the site still works without it).
 */
export async function generateSiteImage(
  orgId: string,
  prompt: string,
  aspect: string,
  fetchImpl: typeof fetch = fetch,
  onError?: (m: string) => void,
): Promise<{ url: string; costMicros: number } | null> {
  const e = env();
  if (!imagesAvailable()) return null;
  if ((await monthSpendUsd(orgId)) >= e.LLM_MONTHLY_BUDGET_USD) {
    onError?.("limite mensal de gasto com IA atingido");
    return null;
  }
  const model = imageModel();
  try {
    const res = await fetchImpl("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${e.OPENROUTER_API_KEY}`, "X-Title": "Vendlia" },
      body: JSON.stringify({ model, prompt, aspect_ratio: ASPECTS.has(aspect) ? aspect : "4:3", n: 1 }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`OpenRouter imagens ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { data?: { b64_json?: string; media_type?: string }[]; usage?: { cost?: number } };
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("o modelo de imagem não devolveu imagem");
    const webp = await sharp(Buffer.from(b64, "base64")).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const costMicros = typeof j.usage?.cost === "number" ? Math.round(j.usage.cost * 1_000_000) : 40_000;
    await db.insert(usageRecords).values({ orgId, kind: "site_image", model, costMicros });
    const [a] = await db.insert(siteAssets).values({ orgId, kind: "image", mime: "image/webp", data: webp, prompt: prompt.slice(0, 1000) }).returning({ id: siteAssets.id });
    return { url: `/api/assets/${a!.id}`, costMicros };
  } catch (err) {
    const m = err instanceof Error ? (err.name === "TimeoutError" ? "o modelo de imagem demorou demais" : err.message) : String(err);
    console.error("[images] falha", m);
    onError?.(m);
    return null;
  }
}
