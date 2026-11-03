import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  doublePrecision,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());
const orgId = () => text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" });

export type OrgSettings = {
  allowColdOutreach: boolean;
  autoReplyInformational: boolean;
  classifierConfidenceThreshold: number;
  businessHoursStart: number; // 0-23, America/Recife
  businessHoursEnd: number;
  outreachTemplate: string;
  followUpEnabled: boolean;
  followUpAfterHours: number;
  operatorWhatsapp?: string;
  sitesBaseDomain?: string;
};

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: jsonb("settings").$type<OrgSettings>().notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    orgId: orgId(),
    role: text("role", { enum: ["owner", "admin", "operator"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: orgId(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const WEBSITE_STATUSES = [
  "unknown",
  "none_in_source",
  "social_only",
  "has_website",
  "confirmed_absent",
] as const;
export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

export const businesses = pgTable(
  "businesses",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    cnpj: text("cnpj"),
    segment: text("segment").notNull().default("servicos"),
    category: text("category"),
    address: text("address"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    state: text("state"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    phone: text("phone"),
    phoneE164: text("phone_e164"),
    email: text("email"),
    website: text("website"),
    websiteStatus: text("website_status", { enum: WEBSITE_STATUSES }).notNull().default("unknown"),
    instagram: text("instagram"),
    openingHours: text("opening_hours"),
    description: text("description"),
    services: jsonb("services").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("businesses_org_cnpj").on(t.orgId, t.cnpj),
    index("businesses_org_phone").on(t.orgId, t.phoneE164),
    index("businesses_org_name").on(t.orgId, t.normalizedName),
  ],
);

export const businessSources = pgTable(
  "business_sources",
  {
    id: id(),
    orgId: orgId(),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["osm", "google_places", "csv", "manual", "brasilapi"] }).notNull(),
    externalId: text("external_id").notNull(),
    license: text("license").notNull(),
    restrictions: text("restrictions"),
    payload: jsonb("payload"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("business_sources_ext").on(t.orgId, t.source, t.externalId)],
);

export const contactPoints = pgTable(
  "contact_points",
  {
    id: id(),
    orgId: orgId(),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["whatsapp", "phone", "email"] }).notNull(),
    value: text("value").notNull(),
    waExists: boolean("wa_exists"),
    permission: text("permission", { enum: ["unknown", "public_business", "opt_in", "opted_out"] })
      .notNull()
      .default("unknown"),
    consentSource: text("consent_source"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("contact_points_value").on(t.orgId, t.channel, t.value)],
);

export const LEAD_STAGES = [
  "discovered",
  "qualified",
  "preview_ready",
  "ready_to_contact",
  "contacted",
  "replied",
  "interested",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
  "do_not_contact",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export type ScoreFactor = { label: string; points: number; kind: "positive" | "negative" | "missing" };

export const leads = pgTable(
  "leads",
  {
    id: id(),
    orgId: orgId(),
    businessId: text("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: LEAD_STAGES }).notNull().default("discovered"),
    score: integer("score").notNull().default(0),
    scoreFactors: jsonb("score_factors").$type<ScoreFactor[]>().notNull().default([]),
    nextAction: text("next_action"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    lostReason: text("lost_reason"),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("leads_business").on(t.businessId), index("leads_org_stage").on(t.orgId, t.stage)],
);

export const leadEvents = pgTable(
  "lead_events",
  {
    id: id(),
    orgId: orgId(),
    leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    data: jsonb("data"),
    actorId: text("actor_id"),
    createdAt: createdAt(),
  },
  (t) => [index("lead_events_lead").on(t.leadId, t.createdAt)],
);

export type RunLog = { t: string; msg: string; level: "info" | "ok" | "warn" | "error" };

export const discoveryRuns = pgTable("discovery_runs", {
  id: id(),
  orgId: orgId(),
  source: text("source").notNull(),
  params: jsonb("params").notNull(),
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  found: integer("found").notNull().default(0),
  created: integer("created").notNull().default(0),
  error: text("error"),
  /** Step-by-step progress shown live on the Prospecção screen (persisted, so a refresh keeps it). */
  logs: jsonb("logs").$type<RunLog[]>().notNull().default([]),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const TEMPLATES = ["barber", "aesthetics", "food", "auto", "services"] as const;
export type TemplateId = (typeof TEMPLATES)[number];

/** A whole site designed by the AI (sanitized HTML + CSS with link placeholders). */
export type SiteAi = {
  html: string;
  fonts: { family: string; weights?: number[]; italic?: boolean; source?: "google" | "fontshare"; slug?: string }[];
  businessType: string;
  concept?: string;
  palette?: string[];
  model: string;
  costMicros: number;
  generatedAt: string;
  instructions?: string;
  /** Font pairing id chosen by the AI (see src/sites/font-pairings.ts). */
  pairing?: string;
  /** AI photos by slot: {{IMG:slot}} in the html → /api/assets/<id>. */
  images?: Record<string, string>;
};

export type SiteLogo = {
  options: { svg: string; label: string }[];
  selected: number | null;
  use: boolean;
  fonts: SiteAi["fonts"];
  model?: string;
  costMicros?: number;
};

export type SiteContent = {
  businessName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  about: string;
  services: { name: string; description: string }[];
  highlights: { title: string; description: string }[];
  faq: { question: string; answer: string }[];
  ctaLabel: string;
  contact: {
    whatsapp?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    instagram?: string;
    openingHours?: string;
    lat?: number;
    lng?: number;
  };
  seo: { title: string; description: string };
  pendingReview: string[];
  generatedBy: "llm" | "rules";
  /** Optional section copy (AI or operator). Renderer falls back to niche defaults. */
  sections?: { servicesTitle?: string; servicesIntro?: string; highlightsTitle?: string; ctaTitle?: string; ctaText?: string };
  /** Optional cover photo URL supplied by the operator (must be licensed or provided by the client). */
  coverImage?: string;
  /** Optional extra photos (https URLs) supplied by the operator. */
  gallery?: string[];
  /** When present, the site is rendered from this AI design instead of the template. */
  ai?: SiteAi;
  /** Optional AI logo proposals; when use=true the chosen one replaces the name in header/footer. */
  logo?: SiteLogo;
};

export const websites = pgTable(
  "websites",
  {
    id: id(),
    orgId: orgId(),
    leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    template: text("template", { enum: TEMPLATES }).notNull(),
    accent: text("accent").notNull().default("#39D79B"),
    content: jsonb("content").$type<SiteContent>().notNull(),
    status: text("status", { enum: ["draft", "preview", "approved", "published", "unpublished"] })
      .notNull()
      .default("preview"),
    previewToken: text("preview_token").notNull(),
    version: integer("version").notNull().default(1),
    publishedVersion: integer("published_version"),
    customDomain: text("custom_domain").unique(),
    views: integer("views").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("websites_lead").on(t.leadId)],
);

export const websiteVersions = pgTable(
  "website_versions",
  {
    id: id(),
    websiteId: text("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    template: text("template").notNull(),
    accent: text("accent").notNull(),
    content: jsonb("content").$type<SiteContent>().notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("website_versions_v").on(t.websiteId, t.version)],
);

export const whatsappInstances = pgTable("whatsapp_instances", {
  id: id(),
  orgId: orgId(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  status: text("status", { enum: ["created", "connecting", "open", "close", "banned"] })
    .notNull()
    .default("created"),
  phone: text("phone"),
  webhookToken: text("webhook_token").notNull(),
  qrBase64: text("qr_base64"),
  hourlyLimit: integer("hourly_limit").notNull().default(8),
  dailyLimit: integer("daily_limit").notNull().default(30),
  warmupStartedAt: timestamp("warmup_started_at", { withTimezone: true }).notNull().defaultNow(),
  paused: boolean("paused").notNull().default(false),
  createdAt: createdAt(),
});

export const CONVERSATION_STATES = [
  "AI_ACTIVE",
  "HUMAN_REQUESTED",
  "HUMAN_ASSIGNED",
  "HUMAN_ACTIVE",
  "RESOLVED",
] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    orgId: orgId(),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    instanceId: text("instance_id").notNull().references(() => whatsappInstances.id, { onDelete: "cascade" }),
    remoteJid: text("remote_jid").notNull(),
    phoneE164: text("phone_e164").notNull(),
    contactName: text("contact_name"),
    state: text("state", { enum: CONVERSATION_STATES }).notNull().default("AI_ACTIVE"),
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    priority: integer("priority").notNull().default(0),
    unread: integer("unread").notNull().default(0),
    lastIntent: text("last_intent"),
    summary: text("summary"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    handoffAt: timestamp("handoff_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conversations_jid").on(t.instanceId, t.remoteJid),
    index("conversations_org_last").on(t.orgId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    orgId: orgId(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    author: text("author", { enum: ["lead", "ai", "human", "system"] }).notNull(),
    kind: text("kind", { enum: ["outreach", "followup", "reply", "inbound"] }).notNull().default("reply"),
    body: text("body").notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status", { enum: ["queued", "sent", "delivered", "read", "failed", "received", "canceled"] })
      .notNull()
      .default("queued"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("messages_provider_id").on(t.orgId, t.providerMessageId),
    index("messages_conv").on(t.conversationId, t.createdAt),
  ],
);

export const INTENTS = [
  "no_reply",
  "informational_question",
  "initial_interest",
  "demo_request",
  "price_request",
  "objection",
  "negotiation",
  "purchase_intent",
  "not_interested",
  "stop_request",
  "human_requested",
] as const;
export type Intent = (typeof INTENTS)[number];

export const intentClassifications = pgTable("intent_classifications", {
  id: id(),
  orgId: orgId(),
  messageId: text("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  intent: text("intent", { enum: INTENTS }).notNull(),
  confidence: doublePrecision("confidence").notNull(),
  urgency: text("urgency", { enum: ["low", "medium", "high"] }).notNull(),
  sentiment: text("sentiment", { enum: ["negative", "neutral", "positive"] }).notNull(),
  suggestedAction: text("suggested_action").notNull(),
  suggestedReply: text("suggested_reply"),
  reason: text("reason").notNull(),
  handoffRequired: boolean("handoff_required").notNull(),
  summary: text("summary").notNull(),
  model: text("model").notNull(),
  createdAt: createdAt(),
});

export const handoffs = pgTable("handoffs", {
  id: id(),
  orgId: orgId(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  fromState: text("from_state").notNull(),
  toState: text("to_state").notNull(),
  reason: text("reason").notNull(),
  actorId: text("actor_id"),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    orgId: orgId(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    priority: text("priority", { enum: ["normal", "high"] }).notNull().default("normal"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_org").on(t.orgId, t.createdAt)],
);

export const products = pgTable("products", {
  id: id(),
  orgId: orgId(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  setupPriceCents: integer("setup_price_cents").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const proposals = pgTable("proposals", {
  id: id(),
  orgId: orgId(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  websiteId: text("website_id").references(() => websites.id, { onDelete: "set null" }),
  productId: text("product_id").notNull().references(() => products.id),
  token: text("token").notNull().unique(),
  setupPriceCents: integer("setup_price_cents").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  notes: text("notes"),
  status: text("status", {
    enum: ["sent", "viewed", "accepted", "paid", "canceled", "expired"],
  })
    .notNull()
    .default("sent"),
  clientApprovedContentAt: timestamp("client_approved_content_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const customers = pgTable("customers", {
  id: id(),
  orgId: orgId(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  document: text("document").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  providerCustomerId: text("provider_customer_id"),
  createdAt: createdAt(),
});

export const payments = pgTable("payments", {
  id: id(),
  orgId: orgId(),
  proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  customerId: text("customer_id").notNull().references(() => customers.id),
  kind: text("kind", { enum: ["setup", "monthly"] }).notNull(),
  provider: text("provider").notNull(),
  providerPaymentId: text("provider_payment_id").notNull().unique(),
  providerSubscriptionId: text("provider_subscription_id"),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["pending", "confirmed", "overdue", "refunded", "canceled"] })
    .notNull()
    .default("pending"),
  invoiceUrl: text("invoice_url"),
  dueDate: text("due_date"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const subscriptions = pgTable("subscriptions", {
  id: id(),
  orgId: orgId(),
  customerId: text("customer_id").notNull().references(() => customers.id),
  proposalId: text("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  websiteId: text("website_id").references(() => websites.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  providerSubscriptionId: text("provider_subscription_id").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["active", "overdue", "canceled"] }).notNull().default("active"),
  nextDueDate: text("next_due_date"),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const providerEvents = pgTable(
  "provider_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("provider_events_uniq").on(t.provider, t.eventId)],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: id(),
    orgId: orgId(),
    kind: text("kind").notNull(),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicros: integer("cost_micros").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("usage_org").on(t.orgId, t.createdAt)],
);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  orgId: orgId(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  target: text("target"),
  data: jsonb("data"),
  createdAt: createdAt(),
});

export const suppressionList = pgTable(
  "suppression_list",
  {
    id: id(),
    orgId: orgId(),
    value: text("value").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("suppression_value").on(t.orgId, t.value)],
);

/** Binary files made for sites (AI photos, logos). Served by /api/assets/[id]. */
export const siteAssets = pgTable(
  "site_assets",
  {
    id: id(),
    orgId: orgId(),
    kind: text("kind").notNull(), // "image" | "logo"
    mime: text("mime").notNull(),
    data: bytea("data").notNull(),
    prompt: text("prompt"),
    createdAt: createdAt(),
  },
  (t) => [index("site_assets_org").on(t.orgId, t.createdAt)],
);
