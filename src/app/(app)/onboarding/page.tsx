import Link from "next/link";
import { requireSession } from "@/server/auth";
import { getSetupProgress } from "@/server/onboarding";
import { Notice, PageHeader } from "@/components/ui";
import { Flash } from "@/components/flash";
import { CheckCircle2, ArrowLeft, ArrowRight, Lock, Zap } from "lucide-react";

export const metadata = { title: "Como funciona" };

type Guide = { how: string[]; auto: string; tip?: string };

/** Step-by-step instructions shown for each setup step (keyed by SetupStep.id). */
const GUIDE: Record<string, Guide> = {
  leads: {
    how: [
      "Abra Prospecção no menu.",
      "Escolha o segmento (ex.: Barbearia) e a cidade.",
      "Clique em “Iniciar busca” e aguarde o aviso de busca concluída (cerca de 1 minuto).",
      "Prefere uma lista própria? Use “Importar CSV” ou “Cadastrar manualmente” na mesma tela.",
    ],
    auto: "Busca os negócios, junta duplicados, verifica quem já tem site e dá uma nota de 0 a 100 para cada empresa, explicando o porquê.",
    tip: "Comece pequeno: uma cidade e um ou dois segmentos.",
  },
  preview: {
    how: [
      "Abra Leads. Use o filtro “Sem site próprio” e comece pelas notas mais altas.",
      "Abra um lead e confira nome, telefone e endereço. Corrija se precisar e clique em “Salvar dados”.",
      "No quadro Demonstração, clique em “Gerar”.",
      "Clique em “Abrir” para ver o site como o cliente vai ver.",
    ],
    auto: "Monta o site só com dados verdadeiros, marca o que precisa ser confirmado com o cliente e deixa a prévia fora do Google, com a faixa “Demonstração”.",
    tip: "Para gerar vários de uma vez: na lista de Leads, marque as empresas e clique em “Gerar demonstrações”.",
  },
  whatsapp: {
    how: [
      "Abra Configurações → Números de WhatsApp.",
      "Dê um apelido ao número e clique em “Conectar número”.",
      "No celular do chip comercial: WhatsApp → Aparelhos conectados → Conectar aparelho, e escaneie o QR code.",
      "Aguarde o status mudar para “open”. Se o QR expirar, clique em “Novo QR”.",
    ],
    auto: "Passa a enviar as mensagens por esse número e a trazer todas as respostas para o Inbox, em tempo real.",
    tip: "Use um chip dedicado, nunca seu número pessoal: envio frio pode levar a bloqueio.",
  },
  contact: {
    how: [
      "Em Configurações, revise a “Mensagem do primeiro contato” (ela já vem pronta).",
      "Abra Leads e filtre a etapa “Preview criado”.",
      "Marque os leads e clique em “Enviar 1º contato” — ou use o botão dentro de um lead.",
      "Acompanhe as mensagens saindo no Inbox.",
    ],
    auto: "Envia o link do site em horário comercial (seg a sáb), devagar e com intervalos para proteger o número, e faz um único lembrete após 48h sem resposta.",
    tip: "Números novos começam com 10 mensagens por dia e o limite cresce aos poucos.",
  },
  publish: {
    how: [
      "Quando alguém responder com interesse, a conversa aparece em “Precisa de você” no Inbox e um alerta surge na tela.",
      "Clique em “Assumir atendimento” e converse — preço e forma de pagamento você combina direto com o cliente.",
      "Fechou? Abra o lead → “Editar no Studio”, ajuste o que o cliente pedir e salve.",
      "Clique em “Publicar”. O site vai ao ar e o lead vira “Fechado”.",
    ],
    auto: "Pausa a automação quando o cliente mostra interesse, para você e a IA nunca responderem juntos. Quem responde “SAIR” é bloqueado na hora.",
    tip: "Se o cliente tiver domínio próprio, configure no Studio em “Domínio próprio”.",
  },
};

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const progress = await getSetupProgress(s.orgId);
  const steps = progress.steps;
  const firstPending = Math.max(0, steps.findIndex((x) => !x.done));
  const requested = Number(sp.step);
  const idx = Number.isInteger(requested) && requested >= 1 && requested <= steps.length ? requested - 1 : firstPending;
  const step = steps[idx]!;
  const guide = GUIDE[step.id]!;
  const allDone = steps.every((x) => x.done);

  return (
    <>
      <PageHeader title="Como funciona" subtitle={`Passo a passo para começar a vender · ${steps.filter((x) => x.done).length} de ${steps.length} concluídos`} />
      <Flash sp={sp} />
      {allDone && <div className="mb-5"><Notice tone="ok">Tudo configurado. Agora é repetir: achar clientes, gerar sites, entrar em contato e fechar.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <nav aria-label="Passos" className="panel h-fit p-2">
          <ol>
            {steps.map((st, i) => (
              <li key={st.id}>
                <Link
                  href={`/onboarding?step=${i + 1}`}
                  aria-current={i === idx ? "step" : undefined}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${i === idx ? "bg-[var(--surface-2)] font-semibold" : "hover:bg-[var(--surface-2)]"}`}
                >
                  {st.done ? (
                    <CheckCircle2 size={20} className="shrink-0 text-[var(--color-mint-600)]" />
                  ) : (
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${i === idx ? "bg-forest text-paper" : "muted border border-[var(--line)]"}`}>{i + 1}</span>
                  )}
                  <span className={st.done && i !== idx ? "muted" : ""}>{st.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <section className="panel p-6 sm:p-8">
          <div className="muted text-[0.8125rem] font-medium">Passo {idx + 1} de {steps.length}</div>
          <h2 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
            {step.title}
            {step.done && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--ok-bg)] px-2 py-0.5 text-[0.75rem] font-semibold text-[var(--ok)] ring-1 ring-inset ring-[#abefc6]">
                <CheckCircle2 size={13} /> feito
              </span>
            )}
          </h2>
          <p className="muted mt-2 max-w-2xl">{step.why}</p>

          {step.blockedBy && !step.done && (
            <div className="mt-4">
              <Notice tone="warn"><span className="inline-flex items-start gap-2"><Lock size={15} className="mt-0.5 shrink-0" />{step.blockedBy}</span></Notice>
            </div>
          )}

          <h3 className="mt-6 mb-3 text-sm font-semibold">Como fazer</h3>
          <ol className="space-y-3">
            {guide.how.map((h, i) => (
              <li key={h} className="flex gap-3 text-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-forest text-xs font-bold text-mint">{i + 1}</span>
                <span className="pt-0.5">{h}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-sm">
            <div className="mb-1 flex items-center gap-1.5 font-semibold"><Zap size={15} className="text-[var(--color-mint-600)]" /> A Vendlia faz sozinha</div>
            <p className="muted">{guide.auto}</p>
          </div>
          {guide.tip && <p className="muted mt-3 text-xs"><b>Dica:</b> {guide.tip}</p>}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
            {idx > 0 ? <Link href={`/onboarding?step=${idx}`} className="btn btn-secondary"><ArrowLeft size={15} /> Anterior</Link> : <span />}
            <div className="flex flex-wrap gap-2">
              <Link href={step.href} className={`btn ${step.done ? "btn-secondary" : "btn-primary"}`}>{step.cta} <ArrowRight size={15} /></Link>
              {idx < steps.length - 1 && (
                <Link href={`/onboarding?step=${idx + 2}`} className={`btn ${step.done ? "btn-primary" : "btn-secondary"}`}>Próximo passo</Link>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
