import { and, eq, gte, sql } from "drizzle-orm";
import type { z } from "zod";
import { env } from "../env";
import { db, usageRecords } from "../db";

export type LlmResult<T> = {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

const PRICES_PER_MTOK: Record<string, [number, number]> = {
  // [input, output] USD per million tokens — conservative defaults, override with LLM_PRICE_IN / LLM_PRICE_OUT
  haiku: [1, 5],
  sonnet: [3, 15],
  "opus-5": [4, 20],
  opus: [5, 25],
  fable: [10, 50],
  "gpt-4o-mini": [0.15, 0.6],
};

function priceFor(model: string): [number, number] {
  const inP = Number(process.env.LLM_PRICE_IN);
  const outP = Number(process.env.LLM_PRICE_OUT);
  if (inP > 0 && outP > 0) return [inP, outP];
  const k = Object.keys(PRICES_PER_MTOK).find((key) => model.includes(key));
  return k ? PRICES_PER_MTOK[k]! : [3, 15];
}

export type Provider = "openrouter" | "anthropic" | "openai";

/** Resolves which LLM provider to use (explicit LLM_PROVIDER wins; otherwise the first key found). */
export function llmProvider(): Provider | null {
  const e = env();
  const has = {
    openrouter: !!e.OPENROUTER_API_KEY,
    anthropic: !!e.ANTHROPIC_API_KEY,
    openai: !!(e.OPENAI_API_KEY && e.LLM_MODEL),
  };
  // An explicit provider wins when its key exists; otherwise use whichever key is configured.
  // (A leftover LLM_PROVIDER=none from .env.example must not silently disable a key the user added.)
  if (e.LLM_PROVIDER && e.LLM_PROVIDER !== "none" && has[e.LLM_PROVIDER])
    return e.LLM_PROVIDER;
  if (has.openrouter) return "openrouter";
  if (has.anthropic) return "anthropic";
  if (has.openai) return "openai";
  return null;
}

export function llmConfigured() {
  return llmProvider() !== null;
}

export function llmModel(provider = llmProvider()) {
  const e = env();
  if (e.LLM_MODEL) return e.LLM_MODEL;
  if (provider === "openrouter") return "anthropic/claude-haiku-5.5";
  if (provider === "anthropic") return "claude-haiku-5-5";
  return "";
}

/** Model used to design whole sites (the strongest available). Override with LLM_SITE_MODEL. */
export function llmSiteModel(provider = llmProvider()) {
  const e = env();
  if (e.LLM_SITE_MODEL) return e.LLM_SITE_MODEL;
  if (provider === "openrouter") return "anthropic/claude-opus-5.5";
  if (provider === "anthropic") return "claude-opus-5-5";
  return llmModel(provider);
}

export async function monthSpendUsd(orgId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [r] = await db
    .select({
      total: sql<number>`coalesce(sum(${usageRecords.costMicros}),0)::int`,
    })
    .from(usageRecords)
    .where(
      and(eq(usageRecords.orgId, orgId), gte(usageRecords.createdAt, start)),
    );
  return (r?.total ?? 0) / 1_000_000;
}

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1)
    throw new Error("Resposta do modelo sem JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Parses a server-sent-events body into JSON payloads (ignores comments and [DONE]). */
async function* sse(res: Response): AsyncGenerator<unknown> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data);
      } catch {
        /* partial or non-JSON line */
      }
    }
  }
}

export type TextResult = {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
};

/**
 * Calls the configured LLM and returns raw text (usage is recorded).
 * Returns null when no LLM is configured, the monthly budget is exhausted, or the call fails.
 */
export async function llmText(
  orgId: string,
  kind: string,
  opts: {
    system: string;
    user: string;
    maxTokens?: number;
    model?: string;
    timeoutMs?: number;
    json?: boolean;
    stream?: boolean;
    onError?: (msg: string) => void;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TextResult | null> {
  if (!llmConfigured()) {
    opts.onError?.("nenhuma chave de IA configurada (OPENROUTER_API_KEY)");
    return null;
  }
  const e = env();
  const spent = await monthSpendUsd(orgId);
  if (spent >= e.LLM_MONTHLY_BUDGET_USD) {
    console.warn(`[llm] orçamento mensal atingido para org ${orgId}`);
    opts.onError?.(
      `limite mensal de gasto com IA atingido (US$ ${spent.toFixed(2)} de US$ ${e.LLM_MONTHLY_BUDGET_USD}); aumente LLM_MONTHLY_BUDGET_USD no Railway`,
    );
    return null;
  }
  try {
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let costMicrosFromProvider: number | null = null;
    const provider = llmProvider()!;
    const model = opts.model ?? llmModel(provider);
    const timeout = AbortSignal.timeout(opts.timeoutMs ?? 60_000);
    if (provider === "anthropic") {
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
          ...(opts.stream ? { stream: true } : {}),
        }),
        signal: timeout,
      });
      if (!res.ok)
        throw new Error(
          `Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );
      if (opts.stream) {
        for await (const ev of sse(res)) {
          const d = ev as {
            type?: string;
            delta?: { type?: string; text?: string };
            message?: { usage?: { input_tokens?: number } };
            usage?: { output_tokens?: number };
            error?: { message?: string };
          };
          if (
            d.type === "content_block_delta" &&
            d.delta?.type === "text_delta"
          )
            text += d.delta.text ?? "";
          else if (d.type === "message_start")
            inputTokens = d.message?.usage?.input_tokens ?? 0;
          else if (d.type === "message_delta")
            outputTokens = d.usage?.output_tokens ?? outputTokens;
          else if (d.type === "error")
            throw new Error(
              `Anthropic: ${d.error?.message ?? "erro no streaming"}`,
            );
        }
      } else {
        const j = (await res.json()) as {
          content: { type: string; text?: string }[];
          usage?: { input_tokens: number; output_tokens: number };
        };
        text = j.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("");
        inputTokens = j.usage?.input_tokens ?? 0;
        outputTokens = j.usage?.output_tokens ?? 0;
      }
    } else {
      // OpenAI and OpenRouter share the chat-completions format.
      const isOR = provider === "openrouter";
      const res = await fetchImpl(
        isOR
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${isOR ? e.OPENROUTER_API_KEY : e.OPENAI_API_KEY}`,
            ...(isOR ? { "X-Title": "Vendlia" } : {}),
          },
          body: JSON.stringify({
            model,
            max_tokens: opts.maxTokens ?? 1200,
            ...(isOR
              ? { usage: { include: true } }
              : opts.json !== false
                ? { response_format: { type: "json_object" } }
                : {}),
            ...(opts.stream
              ? {
                  stream: true,
                  ...(isOR ? {} : { stream_options: { include_usage: true } }),
                }
              : {}),
            messages: [
              { role: "system", content: opts.system },
              { role: "user", content: opts.user },
            ],
          }),
          signal: timeout,
        },
      );
      if (!res.ok)
        throw new Error(
          `${isOR ? "OpenRouter" : "OpenAI"} ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );
      if (opts.stream) {
        for await (const ev of sse(res)) {
          const d = ev as {
            choices?: {
              delta?: { content?: string };
              finish_reason?: string;
            }[];
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
              cost?: number;
            };
            error?: { message?: string };
          };
          if (d.error)
            throw new Error(
              `${isOR ? "OpenRouter" : "OpenAI"}: ${d.error.message ?? "erro no streaming"}`,
            );
          text += d.choices?.[0]?.delta?.content ?? "";
          if (d.usage) {
            inputTokens = d.usage.prompt_tokens ?? inputTokens;
            outputTokens = d.usage.completion_tokens ?? outputTokens;
            if (typeof d.usage.cost === "number")
              costMicrosFromProvider = Math.round(d.usage.cost * 1_000_000);
          }
        }
        if (!text) throw new Error("a IA não devolveu conteúdo");
      } else {
        const j = (await res.json()) as {
          choices?: { message: { content: string } }[];
          usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            cost?: number;
          };
          error?: { message?: string };
        };
        if (j.error)
          throw new Error(
            `${isOR ? "OpenRouter" : "OpenAI"}: ${j.error.message ?? "erro"}`,
          );
        text = j.choices?.[0]?.message.content ?? "";
        inputTokens = j.usage?.prompt_tokens ?? 0;
        outputTokens = j.usage?.completion_tokens ?? 0;
        if (typeof j.usage?.cost === "number")
          costMicrosFromProvider = Math.round(j.usage.cost * 1_000_000);
      }
    }
    const [pi, po] = priceFor(model);
    const costMicros =
      costMicrosFromProvider ??
      Math.round(inputTokens * pi + outputTokens * po);
    await db
      .insert(usageRecords)
      .values({ orgId, kind, model, inputTokens, outputTokens, costMicros });
    return { text, model, inputTokens, outputTokens, costMicros };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? "a IA demorou demais para responder"
          : err.message
        : String(err);
    console.error(`[llm] falha (${kind})`, msg);
    opts.onError?.(msg);
    return null;
  }
}

/** Calls the configured LLM and validates its JSON output with zod (null → caller uses its fallback). */
export async function llmJson<T>(
  orgId: string,
  kind: string,
  opts: {
    system: string;
    user: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<LlmResult<T> | null> {
  const r = await llmText(orgId, kind, opts, fetchImpl);
  if (!r) return null;
  try {
    const parsed = opts.schema.safeParse(extractJson(r.text));
    if (!parsed.success) {
      console.warn(
        `[llm] JSON inválido (${kind})`,
        parsed.error.issues.slice(0, 3),
      );
      return null;
    }
    return {
      data: parsed.data,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    };
  } catch (err) {
    console.warn(
      `[llm] JSON inválido (${kind})`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
