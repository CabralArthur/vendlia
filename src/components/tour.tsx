"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, ArrowLeft, ArrowRight } from "lucide-react";

const KEY = "vendlia_tour_step";
const EVT = "vendlia:tour";

type Step = { path: string; match: string; title: string; body: string; target?: string };

export type TourRefs = { leadId?: string; siteId?: string; conversationId?: string };

function buildSteps(r: TourRefs): Step[] {
  const s: Step[] = [
    {
      path: "/dashboard",
      match: "/dashboard",
      title: "Visão geral: onde está o dinheiro",
      body: "Aqui você vê leads, demonstrações, interessados, vendas e receita recorrente (MRR). O quadro “Leads aguardando você” mostra quem respondeu com interesse — é por onde você começa o dia.",
      target: "hot",
    },
    {
      path: "/discovery",
      match: "/discovery",
      title: "1. Prospecção: trazer empresas",
      body: "Escolha cidade e segmento e a Vendlia busca negócios no OpenStreetMap (ou Google, com chave). Também dá para importar uma planilha CSV ou cadastrar à mão. Duplicadas são unidas automaticamente.",
      target: "discovery-search",
    },
    {
      path: "/leads",
      match: "/leads",
      title: "2. Leads: quem vale a pena",
      body: "Cada empresa recebe uma nota de 0 a 100 (sem site, segmento bom, celular com WhatsApp…). Selecione várias e use “Gerar demonstrações” e depois “Enviar 1º contato”. Os leads de exemplo nunca enviam mensagem.",
      target: "bulk",
    },
    r.leadId
      ? {
          path: `/leads/${r.leadId}`,
          match: `/leads/${r.leadId}`,
          title: "3. Detalhe do lead",
          body: "“Por que este lead?” explica a nota. Ao lado: a demonstração do site, o contato (com a permissão registrada) e a proposta. Tudo que acontece com o lead fica no Histórico.",
          target: "lead-demo",
        }
      : {
          path: "/leads",
          match: "/leads/",
          title: "3. Detalhe do lead",
          body: "Abra qualquer lead: ali ficam a explicação da nota, a demonstração, o contato e a proposta. Dica: carregue os dados de exemplo para ver um lead completo.",
        },
    ...(r.siteId
      ? [
          {
            path: `/studio/${r.siteId}`,
            match: "/studio/",
            title: "4. Website Studio",
            body: "Edite textos, serviços, cores e template do site. Cada salvamento vira uma versão (dá para voltar). O que não foi confirmado com o cliente aparece em “Pendências de revisão”. Publicar exige pagamento + aprovação do cliente.",
            target: "studio-publish",
          },
        ]
      : []),
    {
      path: r.conversationId ? `/inbox?c=${r.conversationId}` : "/inbox",
      match: "/inbox",
      title: "5. Inbox: quando o cliente responde",
      body: "A Vendlia lê cada resposta. Interesse, preço ou vontade de comprar → a automação para e a conversa fica “Aguardando humano”, com alerta para você. Clique em “Assumir atendimento” e responda por aqui. “SAIR” bloqueia o número na hora.",
      target: "takeover",
    },
    {
      path: "/pipeline",
      match: "/pipeline",
      title: "6. Pipeline",
      body: "O funil inteiro em colunas. A maioria das mudanças de etapa é automática (contatado, respondeu, interessado, fechado); você pode arrastar os cards quando precisar.",
    },
    {
      path: "/finance",
      match: "/finance",
      title: "7. Financeiro e planos",
      body: "MRR, recebido no mês, cobranças e assinaturas. Lá embaixo ficam os planos (Essencial e Profissional) — ajuste os preços aqui e eles valem para as próximas propostas.",
      target: "plans",
    },
    {
      path: "/settings",
      match: "/settings",
      title: "8. Configurações",
      body: "Conecte o número de WhatsApp por QR code, edite a mensagem do primeiro contato e veja quais integrações estão ativas. Use um chip dedicado, nunca seu número pessoal.",
      target: "settings-whatsapp",
    },
    {
      path: "/onboarding",
      match: "/onboarding",
      title: "Pronto! Agora é com você",
      body: "Siga o checklist “Para começar a vender”. Quando quiser, remova os dados de exemplo — seus dados reais não são afetados.",
      target: "checklist",
    },
  ];
  return s;
}

function read(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
function write(v: number | null) {
  try {
    if (v === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(v));
  } catch {}
  window.dispatchEvent(new Event(EVT));
}

/** Button that starts the tour from step 0. */
export function StartTour({ className, children, firstPath = "/dashboard" }: { className?: string; children: React.ReactNode; firstPath?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        write(0);
        router.push(firstPath);
      }}
    >
      {children}
    </button>
  );
}

export function Tour({ refs }: { refs: TourRefs }) {
  const steps = useMemo(() => buildSteps(refs), [refs]);
  const router = useRouter();
  const pathname = usePathname();
  const [idx, setIdx] = useState<number | null>(null);

  useEffect(() => {
    const sync = () => setIdx(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const step = idx !== null && idx >= 0 && idx < steps.length ? steps[idx] : null;
  const onPage = !!step && (pathname === step.match || pathname.startsWith(step.match));

  // Spotlight the element for this step.
  useEffect(() => {
    if (!step?.target || !onPage) return;
    // The page may still be streaming (loading skeleton), so poll until the target appears.
    let el: Element | null = null;
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const found = document.querySelector(`[data-tour="${step.target}"]`);
      if (found) {
        el = found;
        el.classList.add("tour-spot");
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        clearInterval(t);
      } else if (tries > 40) clearInterval(t);
    }, 150);
    return () => {
      clearInterval(t);
      el?.classList.remove("tour-spot");
    };
  }, [step, onPage, pathname]);

  const go = useCallback(
    (n: number) => {
      if (n < 0) return;
      if (n >= steps.length) {
        write(null);
        return;
      }
      write(n);
      router.push(steps[n]!.path);
    },
    [steps, router],
  );

  if (!step || idx === null) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[60] w-[min(400px,calc(100vw-2rem))] rounded-2xl border border-brand-500/40 bg-brand-900 p-5 text-paper shadow-2xl lg:left-[252px]" role="dialog" aria-label="Tour guiado">
      <div className="mb-2 flex items-center justify-between text-xs text-paper/60">
        <span>
          Tour guiado · {idx + 1} de {steps.length}
        </span>
        <button onClick={() => write(null)} aria-label="Fechar tour" className="rounded p-1 hover:bg-white/10">
          <X size={15} />
        </button>
      </div>
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} />
      </div>
      <h3 className="text-base font-bold">{step.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-paper/80">{step.body}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button onClick={() => go(idx - 1)} disabled={idx === 0} className="btn !px-2 text-paper/70 hover:text-paper disabled:opacity-30">
          <ArrowLeft size={15} /> Voltar
        </button>
        {!onPage ? (
          <button onClick={() => router.push(step.path)} className="btn btn-primary">
            Ir para esta tela
          </button>
        ) : (
          <button onClick={() => go(idx + 1)} className="btn btn-primary">
            {idx === steps.length - 1 ? "Concluir" : "Próximo"} <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
