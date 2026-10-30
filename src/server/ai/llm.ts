import { and, eq, gte, sql } from "drizzle-orm";
import type { z } from "zod";
import { env } from "../env";
import { db, usageRecords } from "../db";

export type LlmResult<T> = { data: T; model: string; inputTokens: number; outputTokens: number };

const PRICES_PER_MTOK: Record<string, [number, number]> = {
  // [input, output] USD per million tokens — conservative defaults, override with LLM_PRICE_IN / LLM_PRICE_OUT
  haiku: [1, 5],
  sonnet: [3, 15],
  opus: [5, 25],
  "gpt-4o-mini": [0.15, 0.6],
};

function priceFor(model: string): [number, number] {
  const inP = Number(process.env.LLM_PRICE_IN);
  const outP = Number(process.env.LLM_PRICE_OUT);
  if (inP > 0 && outP > 0) return [inP, outP];
  const k = Object.keys(PRICES_PER_MTOK).find((key) => model.includes(key));
  return k ? PRICES_PER_MTOK[k]! : [3, 15];
}

export function llmConfigured() {
  const e = env();
  if (e.LLM_PROVIDER === "anthropic") return !!e.ANTHROPIC_API_KEY;
  if (e.LLM_PROVIDER === "openai") return !!e.OPENAI_API_KEY && !!e.LLM_MODEL;
  return false;
}

async function monthSpendUsd(orgId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [r] = await db
    .select({ total: sql<number>`coalesce(sum(${usageRecords.costMicros}),0)::int` })
    .from(usageRecords)
    .where(and(eq(usageRecords.orgId, orgId), gte(usageRecords.createdAt, start)));
  return (r?.total ?? 0) / 1_000_000;
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Resposta do modelo sem JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Calls the configured LLM and validates its JSON output with zod.
 * Returns null when no LLM is configured, the monthly budget is exhausted, or the call fails —
 * callers must then use their deterministic fallback.
 */
export async function llmJson<T>(
  orgId: string,
  kind: string,
  opts: { system: string; user: string; schema: z.ZodType<T>; maxTokens?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<LlmResult<T> | null> {
  if (!llmConfigured()) return null;
  const e = env();
  if ((await monthSpendUsd(orgId)) >= e.LLM_MONTHLY_BUDGET_USD) {
    console.warn(`[llm] orçamento mensal atingido para org ${orgId}`);
    return null;
  }
  try {
    let text = "";
    let model = "";
    let inputTokens = 0;
    let outputTokens = 0;
    if (e.LLM_PROVIDER === "anthropic") {
      model = e.LLM_MODEL ?? "claude-haiku-5-5";
      const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": e.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 1200,
          system: opts.system,
          messages: [{ role: "user", content: opts.user }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = (await res.json()) as { content: { type: string; text?: string }[]; usage?: { input_tokens: number; output_tokens: number } };
      text = j.content.filter((c) => c.type === "text").map((c) => c.text).join("");
      inputTokens = j.usage?.input_tokens ?? 0;
      outputTokens = j.usage?.output_tokens ?? 0;
    } else {
      model = e.LLM_MODEL!;
      const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${e.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const j = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
      text = j.choices[0]?.message.content ?? "";
      inputTokens = j.usage?.prompt_tokens ?? 0;
      outputTokens = j.usage?.completion_tokens ?? 0;
    }
    const [pi, po] = priceFor(model);
    const costMicros = Math.round(inputTokens * pi + outputTokens * po);
    await db.insert(usageRecords).values({ orgId, kind, model, inputTokens, outputTokens, costMicros });
    const parsed = opts.schema.safeParse(extractJson(text));
    if (!parsed.success) {
      console.warn(`[llm] JSON inválido (${kind})`, parsed.error.issues.slice(0, 3));
      return null;
    }
    return { data: parsed.data, model, inputTokens, outputTokens };
  } catch (err) {
    console.error(`[llm] falha (${kind})`, err instanceof Error ? err.message : err);
    return null;
  }
}
