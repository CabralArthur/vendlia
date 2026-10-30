import { env } from "../env";

/**
 * Minimal, typed client for a self-hosted Evolution API v2 (Baileys).
 * Endpoints verified against the upstream source (EvolutionAPI/evolution-api, src/api/routes).
 */
export class EvolutionClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv(fetchImpl?: typeof fetch) {
    const e = env();
    if (!e.EVOLUTION_API_URL || !e.EVOLUTION_API_KEY) throw new Error("EVOLUTION_API_URL / EVOLUTION_API_KEY não configuradas");
    return new EvolutionClient(e.EVOLUTION_API_URL.replace(/\/$/, ""), e.EVOLUTION_API_KEY, fetchImpl);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { apikey: this.apiKey, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw new EvolutionError(res.status, text.slice(0, 500));
    return (text ? JSON.parse(text) : {}) as T;
  }

  createInstance(name: string, webhookUrl: string, webhookToken: string) {
    return this.call<{ instance: { instanceName: string; status?: string }; qrcode?: { base64?: string } }>("POST", "/instance/create", {
      instanceName: name,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      syncFullHistory: false,
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        headers: { "x-vendlia-token": webhookToken },
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      },
    });
  }

  setWebhook(name: string, webhookUrl: string, webhookToken: string) {
    return this.call("POST", `/webhook/set/${encodeURIComponent(name)}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        headers: { "x-vendlia-token": webhookToken },
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      },
    });
  }

  connect(name: string) {
    return this.call<{ pairingCode?: string; code?: string; base64?: string; count?: number; instance?: { state?: string } }>(
      "GET",
      `/instance/connect/${encodeURIComponent(name)}`,
    );
  }

  connectionState(name: string) {
    return this.call<{ instance: { instanceName: string; state: "open" | "close" | "connecting" | string } }>(
      "GET",
      `/instance/connectionState/${encodeURIComponent(name)}`,
    );
  }

  logout(name: string) {
    return this.call("DELETE", `/instance/logout/${encodeURIComponent(name)}`);
  }

  deleteInstance(name: string) {
    return this.call("DELETE", `/instance/delete/${encodeURIComponent(name)}`);
  }

  checkNumbers(name: string, numbers: string[]) {
    return this.call<{ exists: boolean; jid: string; number: string }[]>("POST", `/chat/whatsappNumbers/${encodeURIComponent(name)}`, {
      numbers,
    });
  }

  sendText(name: string, number: string, text: string, delayMs?: number) {
    return this.call<{ key: { id: string; remoteJid: string; fromMe: boolean }; status?: string }>(
      "POST",
      `/message/sendText/${encodeURIComponent(name)}`,
      { number, text, delay: delayMs, linkPreview: true },
    );
  }
}

export class EvolutionError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Evolution API ${status}: ${body}`);
  }
}

/* --------------------------- Webhook payloads --------------------------- */

export type EvolutionWebhook = {
  event: string;
  instance: string;
  data: unknown;
  date_time?: string;
  sender?: string;
};

export type UpsertData = {
  key: { remoteJid: string; remoteJidAlt?: string; fromMe: boolean; id: string; addressingMode?: string };
  pushName?: string;
  message?: Record<string, any>;
  messageType?: string;
  messageTimestamp?: number;
};

/** Extracts readable text from a Baileys message object (as normalized by Evolution). */
export function extractText(m: UpsertData["message"]): string | null {
  if (!m) return null;
  const t =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.templateButtonReplyMessage?.selectedDisplayText;
  if (typeof t === "string" && t.trim()) return t.trim();
  if (m.audioMessage) return "[áudio]";
  if (m.imageMessage) return "[imagem]";
  if (m.videoMessage) return "[vídeo]";
  if (m.documentMessage) return "[documento]";
  if (m.stickerMessage) return "[figurinha]";
  if (m.locationMessage) return "[localização]";
  if (m.contactMessage) return "[contato]";
  return null;
}

export const STATUS_MAP: Record<string, "sent" | "delivered" | "read" | "failed" | undefined> = {
  ERROR: "failed",
  PENDING: undefined,
  SERVER_ACK: "sent",
  DELIVERY_ACK: "delivered",
  READ: "read",
  PLAYED: "read",
};

/** Resolves the phone JID for a chat (Evolution may deliver @lid addressing with the phone in remoteJidAlt). */
export function resolveJid(key: UpsertData["key"]) {
  if (key.remoteJid?.includes("@lid") && key.remoteJidAlt) return key.remoteJidAlt;
  return key.remoteJid;
}
