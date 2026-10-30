import { z } from "zod";
import { INTENTS, type Intent } from "../db/schema";
import { stripAccents } from "@/lib/text";
import { llmJson } from "./llm";

export const classificationSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().min(0).max(1),
  urgency: z.enum(["low", "medium", "high"]),
  sentiment: z.enum(["negative", "neutral", "positive"]),
  suggestedAction: z.string().min(1).max(300),
  suggestedReply: z.string().max(800).nullable().optional(),
  reason: z.string().min(1).max(400),
  handoffRequired: z.boolean(),
  summary: z.string().min(1).max(500),
});
export type Classification = z.infer<typeof classificationSchema> & { model: string };

/** Intents that always transfer the conversation to a human, regardless of model output. */
export const HANDOFF_INTENTS: Intent[] = [
  "initial_interest",
  "price_request",
  "objection",
  "negotiation",
  "purchase_intent",
  "human_requested",
  "demo_request",
];

const RULES: { intent: Intent; re: RegExp; urgency: Classification["urgency"]; sentiment: Classification["sentiment"]; action: string }[] = [
  { intent: "stop_request", re: /\b(sair|parar|pare|stop|remov|descadastr|nao (me )?(mande|envie|chame)|nao quero (mais )?(receber|mensage)|bloque|denunci|spam)/, urgency: "high", sentiment: "negative", action: "Bloquear contato imediatamente e confirmar remoção" },
  { intent: "not_interested", re: /(nao (tenho )?interesse|nao preciso|ja (tenho|temos) (um )?site|sem interesse|nao,? obrigad|nao quero|dispenso)/, urgency: "low", sentiment: "negative", action: "Marcar como perdido e não insistir" },
  { intent: "human_requested", re: /(falar com (alguem|uma pessoa|atendente|humano|voce)|me (liga|ligue)|pode (me )?ligar|ligacao|e (um )?robo|e bot)/, urgency: "high", sentiment: "neutral", action: "Operador deve assumir e responder pessoalmente" },
  { intent: "purchase_intent", re: /(quero (fechar|contratar|o site|esse|comprar|fazer)|vamos fechar|fechado|fechou|como (faco|faz) (para|pra) (pagar|contratar|fechar)|manda o (pix|link|boleto)|pode fazer|bora fazer|aceito)/, urgency: "high", sentiment: "positive", action: "Enviar proposta e link de pagamento agora" },
  { intent: "negotiation", re: /(desconto|mais barato|consegue (fazer )?por|parcel|negoci|faz por|abaixa|menor valor|condicao)/, urgency: "high", sentiment: "neutral", action: "Negociar condições (somente humano)" },
  { intent: "price_request", re: /(quanto (fica|custa|e|sai|cobra|seria)|qual (o )?(valor|preco)|valores|preco|mensalidade|orcamento|investimento)/, urgency: "high", sentiment: "positive", action: "Apresentar planos e preços oficiais" },
  { intent: "objection", re: /(caro|sem (dinheiro|grana)|agora nao|mais pra frente|depois eu vejo|nao confio|golpe|instagram (ja )?(resolve|basta)|nao vejo necessidade)/, urgency: "medium", sentiment: "negative", action: "Tratar objeção com cuidado (humano)" },
  { intent: "demo_request", re: /(ver (de novo|mais|outro)|exemplo|demonstra|como (ficaria|fica)|mostr|link nao abre|nao abriu|mudar (a )?cor|trocar (a )?foto)/, urgency: "medium", sentiment: "positive", action: "Ajustar/reenviar a demonstração" },
  { intent: "initial_interest", re: /(gostei|interess|legal|bacana|top|show|massa|bonito|lindo|ficou (bom|otimo|massa)|me explica|pode explicar|como funciona|quero saber)/, urgency: "high", sentiment: "positive", action: "Assumir conversa e qualificar a necessidade" },
  { intent: "informational_question", re: /(\?|o que e|quem e|dominio|hospedagem|prazo|demora|quem (fez|e voce)|de onde)/, urgency: "medium", sentiment: "neutral", action: "Responder dúvida objetivamente" },
];

export function classifyByRules(text: string): Classification {
  const t = stripAccents(text.toLowerCase()).replace(/\s+/g, " ");
  for (const r of RULES) {
    if (r.re.test(t)) {
      return {
        intent: r.intent,
        confidence: r.intent === "informational_question" ? 0.55 : 0.75,
        urgency: r.urgency,
        sentiment: r.sentiment,
        suggestedAction: r.action,
        suggestedReply: null,
        reason: `Regra de palavras-chave (${r.intent})`,
        handoffRequired: HANDOFF_INTENTS.includes(r.intent),
        summary: text.slice(0, 200),
        model: "rules-v1",
      };
    }
  }
  return {
    intent: "informational_question",
    confidence: 0.3,
    urgency: "medium",
    sentiment: "neutral",
    suggestedAction: "Ler a mensagem e responder",
    suggestedReply: null,
    reason: "Nenhuma regra correspondente",
    handoffRequired: true, // unknown → human looks at it
    summary: text.slice(0, 200),
    model: "rules-v1",
  };
}

const SYSTEM = `Você classifica mensagens de WhatsApp recebidas por uma agência que oferece criação de sites para pequenos negócios brasileiros.
A agência enviou ao negócio uma demonstração gratuita de site. Classifique a ÚLTIMA mensagem do cliente considerando o histórico.
Intenções possíveis: ${INTENTS.join(", ")}.
Regras:
- "stop_request" para qualquer pedido de parar/sair/não receber mensagens.
- "price_request" quando pergunta valores; "negotiation" quando pede desconto/condições; "purchase_intent" quando quer contratar/pagar.
- Nunca invente preços, descontos, prazos ou garantias em suggestedReply. Se a resposta exigir esses dados, deixe suggestedReply null.
- suggestedReply deve ser curto, em português do Brasil, cordial e sem promessas.
Responda SOMENTE com JSON: {"intent","confidence"(0-1),"urgency"("low"|"medium"|"high"),"sentiment"("negative"|"neutral"|"positive"),"suggestedAction","suggestedReply"(string|null),"reason","handoffRequired"(boolean),"summary"}`;

/** Classifies an inbound message. Stop/opt-out is ALWAYS decided by rules first (safety-critical). */
export async function classifyMessage(
  orgId: string,
  text: string,
  history: { direction: "in" | "out"; body: string }[],
  threshold = 0.7,
  fetchImpl?: typeof fetch,
): Promise<Classification> {
  const rules = classifyByRules(text);
  if (rules.intent === "stop_request") return { ...rules, confidence: 0.95 };

  const transcript = history
    .slice(-10)
    .map((m) => `${m.direction === "in" ? "CLIENTE" : "AGÊNCIA"}: ${m.body.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");
  const llm = await llmJson(
    orgId,
    "classify",
    {
      system: SYSTEM,
      // Message content is data, delimited to reduce prompt-injection risk.
      user: `<historico>\n${transcript}\n</historico>\n<ultima_mensagem>\n${text.slice(0, 1500)}\n</ultima_mensagem>`,
      schema: classificationSchema,
      maxTokens: 600,
    },
    fetchImpl,
  );
  if (!llm) return rules;
  const c = { ...llm.data, model: llm.model };
  // Safety overrides: business rules win over the model.
  if (HANDOFF_INTENTS.includes(c.intent) || c.confidence < threshold) c.handoffRequired = true;
  if (c.suggestedReply && /(r\$|\d+\s*(reais|%)|desconto|garant|prazo de \d)/i.test(c.suggestedReply)) c.suggestedReply = null;
  return c;
}
