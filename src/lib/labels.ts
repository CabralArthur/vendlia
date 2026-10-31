import type { LeadStage } from "@/server/db/schema";

export const STAGE_LABEL: Record<LeadStage, string> = {
  discovered: "Descoberto",
  qualified: "Qualificado",
  preview_ready: "Site gerado",
  ready_to_contact: "Na fila de envio",
  contacted: "Contatado",
  replied: "Respondeu",
  interested: "Interessado",
  proposal_sent: "Proposta enviada",
  negotiation: "Negociando",
  won: "Fechado",
  lost: "Perdido",
  do_not_contact: "Não contatar",
};

export const INTENT_LABEL: Record<string, string> = {
  no_reply: "Sem resposta",
  informational_question: "Dúvida",
  initial_interest: "Interesse",
  demo_request: "Quer ver o site",
  price_request: "Pediu preço",
  objection: "Objeção",
  negotiation: "Negociação",
  purchase_intent: "Quer fechar",
  not_interested: "Sem interesse",
  stop_request: "Pediu para sair",
  human_requested: "Quer falar com alguém",
};

/** What the operator should do next, derived from the lead's current state (never stale). */
export function nextStep(l: { stage: LeadStage; websiteStatus: string; hasPhone: boolean; hasSite: boolean; active?: boolean }): string {
  if (l.active === false) return "Confirmar se a empresa ainda funciona";
  switch (l.stage) {
    case "won":
      return "Cliente fechado";
    case "lost":
      return "Sem ação: lead perdido";
    case "do_not_contact":
      return "Não contatar";
    case "interested":
    case "negotiation":
    case "proposal_sent":
      return "Responder no Inbox e fechar";
    case "replied":
      return "Ver a resposta no Inbox";
    case "contacted":
      return "Aguardar resposta";
    case "ready_to_contact":
      return "Mensagem na fila de envio";
  }
  if (l.websiteStatus === "has_website") return "Já tem site: descartar ou oferecer reformulação";
  if (!l.hasSite) return l.hasPhone ? "Gerar o site" : "Encontrar um telefone e gerar o site";
  return l.hasPhone ? "Enviar o primeiro contato" : "Encontrar um telefone para contato";
}
