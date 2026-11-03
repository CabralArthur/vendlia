import { z } from "zod";

/** API keys pasted into Railway often carry quotes, spaces or a "Bearer " prefix: clean them. */
const apiKey = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim() || undefined : v),
  z.string().optional(),
);

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SESSION_SECRET: z.string().min(16).default("dev-insecure-session-secret-change-me"),
  // Domain used for published sites: <slug>.<SITES_BASE_DOMAIN> (wildcard DNS on Railway)
  SITES_BASE_DOMAIN: z.string().optional(),

  // WhatsApp via Evolution API (self-hosted)
  EVOLUTION_API_URL: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),

  // LLM (optional — falls back to deterministic rules)
  // Optional. When empty, the provider is picked from whichever key is set (OpenRouter > Anthropic > OpenAI).
  LLM_PROVIDER: z.enum(["openrouter", "anthropic", "openai", "none", ""]).default(""),
  OPENROUTER_API_KEY: apiKey,
  ANTHROPIC_API_KEY: apiKey,
  OPENAI_API_KEY: apiKey,
  LLM_MODEL: z.string().optional(),
  /** Model that designs whole sites. Default: the strongest Claude model on the chosen provider. */
  LLM_SITE_MODEL: z.string().optional(),
  LLM_MONTHLY_BUDGET_USD: z.coerce.number().default(30),

  // Discovery sources
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  OVERPASS_URL: z.string().default("https://overpass-api.de/api/interpreter"),
  BRASILAPI_URL: z.string().default("https://brasilapi.com.br/api"),

});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export function resetEnvCache() {
  cached = null;
}
