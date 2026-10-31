import Link from "next/link";
import { requireSession } from "@/server/auth";
import { getDemoRefs, getSetupProgress } from "@/server/onboarding";
import { Badge, Card, Notice, PageHeader, STAGE_LABEL } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { StartTour } from "@/components/tour";
import { LEAD_STAGES, type LeadStage } from "@/server/db/schema";
import { loadDemoAction, removeDemoAction } from "../_actions/onboarding";
import { CheckCircle2, Circle, PlayCircle, Database, Trash2, Hand, Zap, ShieldCheck, ArrowRight, Lock } from "lucide-react";

export const metadata = { title: "Como funciona" };

type Phase = {
  n: number;
  title: string;
  you: string;
  auto: string;
  where: { label: string; href: string };
  needs?: string;
};

const JOURNEY: Phase[] = [
  {
    n: 1,
    title: "Encontrar empresas",
    you: "Escolhe cidade e segmento (ex.: barbearias em Recife), importa uma planilha ou cadastra à mão.",
    auto: "Busca os negócios, junta duplicados, verifica se já têm site e dá uma nota de 0 a 100 explicando o porquê.",
    where: { label: "Prospecção", href: "/discovery" },
  },
  {
    n: 2,
    title: "Criar a demonstração",
    you: "Confere os dados da empresa e clica em “Gerar” (ou gera vários de uma vez na lista de leads).",
    auto: "Monta um site personalizado só com dados verdadeiros, marca o que precisa ser confirmado e deixa a prévia fora do Google, com aviso de “demonstração”.",
    where: { label: "Leads", href: "/leads" },
  },
  {
    n: 3,
    title: "Primeiro contato",
    you: "Seleciona os leads prontos e clica em “Enviar 1º contato”.",
    auto: "Envia pelo WhatsApp em horário comercial, devagar e com intervalos para proteger o número, e faz um único follow-up após 48h sem resposta.",
    where: { label: "Leads prontos", href: "/leads?stage=preview_ready" },
    needs: "WhatsApp conectado",
  },
  {
    n: 4,
    title: "O cliente responde",
    you: "Recebe o alerta e clica em “Assumir atendimento” no Inbox.",
    auto: "Lê a resposta, identifica interesse, pergunta de preço ou vontade de comprar, pausa a automação e avisa você. “SAIR” bloqueia o número na hora.",
    where: { label: "Inbox", href: "/inbox" },
    needs: "WhatsApp conectado",
  },
  {
    n: 5,
    title: "Negociar e enviar proposta",
    you: "Conversa com o cliente e cria a proposta no lead (pode ajustar o preço).",
    auto: "Envia o link da proposta com a demonstração, os itens do plano e o botão de pagamento. Cancela propostas antigas do mesmo cliente.",
    where: { label: "Detalhe do lead", href: "/leads" },
  },
  {
    n: 6,
    title: "Receber o pagamento",
    you: "Nada, se o Asaas estiver ligado. Sem Asaas: recebe o Pix e clica em “Marcar pago”.",
    auto: "O cliente paga por Pix, boleto ou cartão; a confirmação chega do Asaas, a venda vira “Fechado” e a mensalidade é criada.",
    where: { label: "Financeiro", href: "/finance" },
    needs: "Asaas (opcional)",
  },
  {
    n: 7,
    title: "Site no ar e mensalidade",
    you: "Ajusta o que o cliente pedir no Studio e, se ele tiver, liga o domínio próprio.",
    auto: "Publica assim que o cliente aprova o conteúdo, cobra todo mês e tira o site do ar após 15 dias de atraso.",
    where: { label: "Studio (no lead)", href: "/leads?stage=won" },
  },
];

const STAGE_HELP: Record<LeadStage, [string, "auto" | "you" | "both"]> = {
  discovered: ["Acabou de entrar. Nota baixa ou dados incompletos.", "auto"],
  qualified: ["Nota boa (50+): vale gerar a demonstração.", "auto"],
  preview_ready: ["Demonstração criada. Pronto para o primeiro contato.", "auto"],
  ready_to_contact: ["Mensagem na fila, aguardando o horário/limite do número.", "auto"],
  contacted: ["Primeira mensagem entregue. Aguardando resposta.", "auto"],
  replied: ["Respondeu algo neutro (uma dúvida, por exemplo).", "auto"],
  interested: ["Mostrou interesse ou perguntou preço. Sua vez.", "auto"],
  proposal_sent: ["Você criou a proposta.", "auto"],
  negotiation: ["Pediu desconto/condições ou abriu o pagamento.", "both"],
  won: ["Pagamento confirmado.", "auto"],
  lost: ["Disse que não tem interesse, ou você descartou.", "both"],
  do_not_contact: ["Pediu para parar. Nunca mais recebe mensagens.", "both"],
};

const RULES = [
  "A automação e um humano nunca respondem a mesma conversa ao mesmo tempo.",
  "Cada mensagem é enviada uma única vez, mesmo se o sistema reiniciar.",
  "Quem pede para sair é bloqueado na hora, em todos os números.",
  "A IA nunca fala preço, desconto, prazo ou garantia — isso é sempre com você.",
  "O site só vai ao ar com pagamento confirmado e conteúdo aprovado pelo cliente.",
  "Pagamento só conta como confirmado quando o Asaas avisa (não pelo navegador do cliente).",
];

const FAQ: [string, string][] = [
  ["Preciso do WhatsApp conectado para começar?", "Não. Dá para prospectar, gerar demonstrações, criar propostas e receber por Pix sem ele — você manda o link da demonstração pelo seu celular. O WhatsApp conectado automatiza o envio e traz as respostas para o Inbox."],
  ["Os dados de exemplo enviam mensagens?", "Nunca. As empresas, conversas e pagamentos de exemplo são fictícios e ficam bloqueados para envio. Remova quando quiser; seus dados reais não são afetados."],
  ["Posso mudar os preços?", "Sim, em Financeiro → Planos. Na hora de criar a proposta você ainda pode ajustar o valor só para aquele cliente."],
  ["O que o cliente vê?", "Primeiro, a demonstração do site dele com uma faixa “Demonstração”. Depois, a página da proposta com os itens do plano e o botão de pagar. Após pagar e aprovar, o site vai ao ar sem a faixa."],
  ["E se o número for banido?", "O risco existe porque a conexão não é oficial. Por isso a Vendlia envia devagar, só em horário comercial e com limite diário que cresce aos poucos. Use um chip dedicado."],
];

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const [progress, demo] = await Promise.all([getSetupProgress(s.orgId), getDemoRefs(s.orgId)]);
  const admin = s.role !== "operator";
  const next = progress.steps.find((x) => !x.done && !x.optional);

  return (
    <>
      <PageHeader title="Como a Vendlia funciona" subtitle="Da empresa sem site até a mensalidade paga — e o que é automático em cada etapa." />
      <Flash sp={sp} />

      {/* Start here */}
      <div className="mb-8 grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="overflow-hidden rounded-2xl bg-brand-900 p-6 text-paper sm:p-8">
          <div className="text-xs font-bold uppercase tracking-widest text-brand-500">Comece por aqui</div>
          <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">Veja tudo funcionando em 3 minutos</h2>
          <ol className="mt-4 space-y-2 text-sm text-paper/80">
            <li><b className="text-paper">1.</b> Carregue os dados de exemplo — empresas, uma conversa quente e uma venda fechada, todos fictícios.</li>
            <li><b className="text-paper">2.</b> Faça o tour guiado: ele passa por cada tela e mostra o que fazer.</li>
            <li><b className="text-paper">3.</b> Siga o checklist abaixo para começar a vender de verdade.</li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-2">
            {!demo.hasDemo && admin && (
              <form action={loadDemoAction}>
                <Submit className="btn btn-primary" pendingText="Carregando exemplos…"><Database size={16} /> Carregar dados de exemplo</Submit>
              </form>
            )}
            <StartTour className={`btn ${demo.hasDemo ? "btn-primary" : "border border-white/20 text-paper hover:bg-white/10"}`}>
              <PlayCircle size={16} /> Fazer o tour guiado
            </StartTour>
            {demo.hasDemo && admin && (
              <form action={removeDemoAction}>
                <Submit className="btn border border-white/20 text-paper hover:bg-white/10" confirm="Remover todos os dados de exemplo? Seus dados reais não serão afetados." pendingText="Removendo…">
                  <Trash2 size={15} /> Remover exemplos
                </Submit>
              </form>
            )}
          </div>
          {demo.hasDemo && <p className="mt-3 text-xs text-paper/55">Dados de exemplo carregados. Eles nunca enviam mensagens nem geram cobranças.</p>}
        </section>

        <Card tour="checklist" title={`Para começar a vender · ${progress.done}/${progress.required}`}>
          <ul className="space-y-3">
            {progress.steps.map((st) => (
              <li key={st.id} className="flex gap-3">
                {st.done ? <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-brand-500" /> : <Circle size={19} className="muted mt-0.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-semibold ${st.done ? "muted line-through" : ""}`}>{st.title}</span>
                    {st.optional && <Badge>opcional</Badge>}
                    {next?.id === st.id && <Badge tone="green">próximo passo</Badge>}
                  </div>
                  {!st.done && <p className="muted mt-0.5 text-xs">{st.why}</p>}
                  {!st.done && st.blockedBy && <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300"><Lock size={12} className="mt-0.5 shrink-0" />{st.blockedBy}</p>}
                  {!st.done && <Link href={st.href} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold hover:underline">{st.cta} <ArrowRight size={12} /></Link>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Journey */}
      <h2 className="mb-1 text-lg font-bold">A jornada de uma venda</h2>
      <p className="muted mb-4 text-sm">Sete etapas. Em cada uma, o que é com você e o que a Vendlia faz sozinha.</p>
      <ol className="relative mb-10 space-y-3 before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-px before:bg-[var(--line)]">
        {JOURNEY.map((p) => (
          <li key={p.n} className="relative flex gap-4">
            <span className="z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-900 text-sm font-bold text-brand-500 ring-4 ring-[var(--bg)]">{p.n}</span>
            <div className="panel flex-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{p.title}</h3>
                <div className="flex items-center gap-2">
                  {p.needs && <Badge tone="amber">precisa: {p.needs}</Badge>}
                  <Link href={p.where.href} className="muted text-xs font-semibold hover:underline">{p.where.label} →</Link>
                </div>
              </div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-[var(--panel-2)] p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"><Hand size={13} /> Você</div>
                  <p className="muted">{p.you}</p>
                </div>
                <div className="rounded-lg border border-brand-500/30 bg-brand-500/8 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-brand-400"><Zap size={13} /> A Vendlia faz sozinha</div>
                  <p className="muted">{p.auto}</p>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Etapas do funil (o que cada uma significa)">
          <ul className="divide-y divide-[var(--line)] text-sm">
            {LEAD_STAGES.map((st) => (
              <li key={st} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <span className="font-semibold">{STAGE_LABEL[st]}</span>
                  <p className="muted text-xs">{STAGE_HELP[st][0]}</p>
                </div>
                <Badge tone={STAGE_HELP[st][1] === "auto" ? "green" : "neutral"}>{STAGE_HELP[st][1] === "auto" ? "automático" : "automático ou você"}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card title={<span className="inline-flex items-center gap-2"><ShieldCheck size={16} /> Regras que a Vendlia sempre segue</span>}>
            <ul className="space-y-2 text-sm">
              {RULES.map((r) => <li key={r} className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-500" />{r}</li>)}
            </ul>
          </Card>
          <Card title="Perguntas frequentes">
            <div className="space-y-2">
              {FAQ.map(([q, a]) => (
                <details key={q} className="rounded-lg border border-[var(--line)] px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-semibold">{q}</summary>
                  <p className="muted mt-2">{a}</p>
                </details>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {!admin && <div className="mt-6"><Notice tone="info">Carregar ou remover dados de exemplo é feito por um administrador.</Notice></div>}
    </>
  );
}
