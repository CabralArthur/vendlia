import type { ScoreFactor, WebsiteStatus, LeadStage } from "./db/schema";
import { isBrMobile } from "@/lib/phone";
import { segmentById } from "./discovery/segments";
import { STAGE_LABEL } from "@/lib/labels";

export type ScoreInput = {
  websiteStatus: WebsiteStatus;
  segment: string;
  active: boolean;
  phoneE164: string | null;
  waExists?: boolean | null;
  address?: string | null;
  city?: string | null;
  openingHours?: string | null;
  instagram?: string | null;
  cnpj?: string | null;
  services?: string[];
  stage?: LeadStage;
  rating?: number | null;
  ratingCount?: number | null;
};

/** Explainable 0–100 commercial opportunity score. Separate from contact eligibility. */
export function scoreLead(i: ScoreInput): { score: number; factors: ScoreFactor[]; nextAction: string } {
  const f: ScoreFactor[] = [];
  const add = (label: string, points: number, kind: ScoreFactor["kind"] = points >= 0 ? "positive" : "negative") =>
    f.push({ label, points, kind });

  switch (i.websiteStatus) {
    case "confirmed_absent":
      add("Ausência de site confirmada", 30);
      break;
    case "social_only":
      add("Presença apenas em redes sociais", 25);
      break;
    case "none_in_source":
      add("Fonte não registra site (verificar)", 20);
      break;
    case "has_website":
      add("Já possui site próprio", -45);
      break;
    default:
      add("Presença digital desconhecida", 8);
  }

  const seg = segmentById(i.segment);
  if (seg.priority) add(`Segmento prioritário (${seg.label})`, 15);
  else add(`Segmento ${seg.label}`, 8);

  if (i.phoneE164 && isBrMobile(i.phoneE164)) {
    if (i.waExists === false) add("Celular sem WhatsApp", 2);
    else add(i.waExists ? "WhatsApp confirmado" : "Celular comercial (WhatsApp provável)", i.waExists ? 22 : 18);
  } else if (i.phoneE164) add("Apenas telefone fixo", 6);
  else f.push({ label: "Telefone de contato", points: 0, kind: "missing" });

  if (i.address && i.city) add("Endereço completo", 5);
  else f.push({ label: "Endereço", points: 0, kind: "missing" });
  if (i.openingHours) add("Horário de funcionamento", 4);
  else f.push({ label: "Horário de funcionamento", points: 0, kind: "missing" });
  if (i.instagram) add("Instagram ativo (demanda visual)", 5);
  if (i.cnpj) add("CNPJ identificado", 4);
  // Well-reviewed businesses already have customers and a reputation to show: best buyers of a site.
  if (i.rating && i.ratingCount) {
    const stars = i.rating.toFixed(1).replace(".", ",");
    if (i.rating >= 4.5 && i.ratingCount >= 30) add(`Bem avaliada no Google (${stars} ★, ${i.ratingCount} avaliações)`, i.ratingCount >= 100 ? 14 : 10);
    else if (i.rating >= 4 && i.ratingCount >= 10) add(`Boa avaliação no Google (${stars} ★, ${i.ratingCount})`, 6);
    else if (i.rating < 3.5 && i.ratingCount >= 10) add(`Avaliação baixa no Google (${stars} ★)`, -6);
  }
  if (i.services && i.services.length > 0) add("Serviços conhecidos", 4);
  else f.push({ label: "Serviços oferecidos", points: 0, kind: "missing" });

  if (!i.active) add("Empresa possivelmente inativa", -60);

  if (i.stage === "replied") add("Respondeu à abordagem", 8);
  if (i.stage === "interested" || i.stage === "negotiation" || i.stage === "proposal_sent") add("Interesse declarado", 15);

  const score = Math.max(0, Math.min(100, f.reduce((s, x) => s + x.points, 0)));

  let nextAction = "Gerar demonstração do site";
  if (i.websiteStatus === "has_website") nextAction = "Descartar ou oferecer redesign";
  else if (!i.phoneE164) nextAction = "Encontrar contato comercial";
  else if (i.websiteStatus === "none_in_source") nextAction = "Confirmar ausência de site e gerar demonstração";
  if (!i.active) nextAction = "Verificar se a empresa está ativa";
  return { score, factors: f, nextAction };
}

export type EligibilityInput = {
  phoneE164: string | null;
  permission: "unknown" | "public_business" | "opt_in" | "opted_out";
  waExists?: boolean | null;
  suppressed: boolean;
  alreadyContacted: boolean;
  stage: LeadStage;
  allowColdOutreach: boolean;
  hasPreview: boolean;
};

/** Whether we may send the FIRST outbound message to this lead. */
export function outreachEligibility(i: EligibilityInput): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!i.phoneE164) reasons.push("Sem telefone cadastrado");
  else if (!isBrMobile(i.phoneE164)) reasons.push("O número é fixo (sem WhatsApp)");
  if (i.waExists === false) reasons.push("Número não possui WhatsApp");
  if (i.suppressed || i.permission === "opted_out") reasons.push("Contato pediu para não ser contatado");
  if (i.stage === "do_not_contact" || i.stage === "lost" || i.stage === "won") reasons.push(`O lead está como “${STAGE_LABEL[i.stage]}”`);
  if (i.alreadyContacted) reasons.push("Já recebeu o primeiro contato");
  if (!i.hasPreview) reasons.push("O site de demonstração ainda não foi gerado");
  if (i.permission !== "opt_in" && !i.allowColdOutreach) reasons.push("Primeiro contato sem autorização está desligado em Configurações");
  if (i.permission === "unknown" && i.allowColdOutreach) reasons.push("Confirme que o número é comercial (em Contato, escolha a permissão e salve)");
  return { eligible: reasons.length === 0, reasons };
}
