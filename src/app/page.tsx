import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { env } from "@/server/env";
import { LogoMark } from "@/components/ui";
import { PAID_PLANS, PLANS, SITE_PACK, TRIAL_DAYS, brl, priceFor } from "@/lib/plans";
import { Check, X, Radar, Sparkles, Send, BellRing, MapPin, PenTool, Globe, ShieldCheck, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: { absolute: "Vendlia: encontre clientes sem site e venda pelo WhatsApp" },
  description: "Para quem vende sites: o Vendlia encontra negócios sem site no seu bairro, cria um site de demonstração com IA para cada um e faz a abordagem pelo WhatsApp. Teste grátis por 7 dias.",
  openGraph: { title: "Vendlia", description: "Encontre quem não tem site, mostre o site pronto e feche pelo WhatsApp.", type: "website", locale: "pt_BR" },
};

const STEPS = [
  { icon: Radar, title: "Ache quem precisa", text: "Escolha o nicho, a cidade e o bairro. A IA ainda sugere onde vale mais a pena buscar.", img: "/landing/passo-1.webp" },
  { icon: MapPin, title: "Veja quem vale a pena", text: "Cada empresa chega com nota do Google, fotos, WhatsApp verificado e uma nota de oportunidade.", img: "/landing/passo-2.webp" },
  { icon: Sparkles, title: "A IA faz o site", text: "Um site de demonstração pronto para cada empresa, com as fotos do próprio negócio, em poucos minutos.", img: "/landing/passo-3.webp" },
  { icon: BellRing, title: "Feche pelo WhatsApp", text: "O primeiro contato sai no horário comercial. Quando alguém pede preço, você é avisado na hora.", img: "/landing/passo-4.webp" },
];

const FEATURES = [
  { icon: Radar, title: "Busca por bairro", text: "Google Maps ou OpenStreetMap, com filtros de quem não tem site e é bem avaliado." },
  { icon: Sparkles, title: "Sites com cara de agência", text: "Tipografia de designer, efeitos e fotos reais. Ajuste com um pedido em texto." },
  { icon: PenTool, title: "Logo em um minuto", text: "Três propostas de logo em vetor para cada cliente, prontas para usar no site." },
  { icon: Send, title: "Envio que protege seu número", text: "Horário comercial, intervalo de gente, aquecimento de número novo e opção de sair em toda mensagem." },
  { icon: BellRing, title: "Lead quente não esfria", text: "A IA lê as respostas, avisa você e segura o cliente com uma mensagem curta até você responder." },
  { icon: Globe, title: "Publica com domínio próprio", text: "Fechou? O site vai ao ar sem a faixa de demonstração, no domínio do cliente." },
];

const COMPARE: [string, string, string][] = [
  ["Achar empresas sem site", "Horas no Google Maps", "Uma busca por bairro"],
  ["Mostrar o trabalho", "Portfólio genérico", "O site da própria empresa, pronto"],
  ["Abordagem", "Mensagem copiada, uma por uma", "Envio automático no horário certo"],
  ["Respostas", "Você precisa ficar de olho", "Alerta quando alguém quer comprar"],
];

const FAQ: [string, string][] = [
  ["Preciso saber programar ou design?", "Não. Você escolhe o nicho e o bairro, gera o site com um clique e ajusta com um pedido em texto, como \"deixe mais escuro\"."],
  ["Uso o meu número de WhatsApp?", "Sim, você conecta o seu número lendo um QR code. No teste grátis o envio automático fica desligado: você copia a mensagem ou abre direto no WhatsApp do celular."],
  ["Meu número pode ser bloqueado?", "O Vendlia usa uma conexão não oficial com o WhatsApp, e todo envio em massa tem risco. Por isso limitamos o volume por hora e por dia, aquecemos números novos, respeitamos o horário comercial e incluímos a opção de sair em toda mensagem. Use um número comercial e siga os limites."],
  ["De onde vêm os dados das empresas?", "De fontes públicas: Google Maps e OpenStreetMap. Só usamos dados comerciais divulgados pela própria empresa, e quem pede para sair nunca mais recebe mensagem."],
  ["Quanto eu cobro pelo site?", "Você define o seu preço. Quem vende sites costuma cobrar de R$ 500 a R$ 1.500 por site, mais uma mensalidade de hospedagem."],
  ["Posso cancelar quando quiser?", `Sim, sem multa. E se não gostar nos primeiros 7 dias depois de assinar, devolvemos o valor pago.`],
  ["E se acabarem os sites do meu plano?", `Você pode comprar um pacote de ${SITE_PACK.sites} sites por ${brl(SITE_PACK.price)} ou mudar de plano. Sites com o modelo pronto não contam no limite.`],
];

export default async function Home() {
  if (await getSession()) redirect("/dashboard");
  const e = env();
  return (
    <div className="bg-paper text-graphite">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center gap-6 px-5">
          <Link href="/" className="flex items-center gap-2" aria-label="Vendlia">
            <LogoMark className="h-7 w-7" />
            <span className="text-[1.125rem] font-bold tracking-[-0.02em]">vendlia<span className="text-mint-600">.</span></span>
          </Link>
          <nav className="ml-6 hidden gap-6 text-sm text-graphite/70 md:flex">
            <a href="#como-funciona" className="hover:text-graphite">Como funciona</a>
            <a href="#precos" className="hover:text-graphite">Preços</a>
            <a href="#duvidas" className="hover:text-graphite">Dúvidas</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="btn btn-quiet btn-sm">Entrar</Link>
            <Link href="/signup" className="btn btn-primary btn-sm">Testar grátis</Link>
          </div>
        </div>
      </header>

      <section className="bg-forest text-paper">
        <div className="mx-auto grid max-w-[1160px] items-center gap-12 px-5 py-16 md:py-24 lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[0.8125rem] font-medium text-paper/85"><span className="h-1.5 w-1.5 rounded-full bg-mint" />Para quem vende sites</p>
            <h1 className="text-[2.5rem] leading-[1.05] font-bold tracking-[-0.035em] sm:text-[3.5rem] lg:text-[4rem]">
              Encontre quem não tem site, mostre o site <span className="text-mint">pronto</span> e feche pelo WhatsApp.
            </h1>
            <p className="mt-6 max-w-[34em] text-lg leading-relaxed text-paper/75">
              O Vendlia acha os negócios do seu bairro que ainda não têm site, cria uma demonstração com IA para cada um e faz o primeiro contato por você. Você só entra quando o cliente quer comprar.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="btn bg-mint px-6 py-3 text-base font-semibold text-forest hover:bg-[#5fe0af]">Testar grátis por {TRIAL_DAYS} dias <ArrowRight size={18} /></Link>
              <a href="#como-funciona" className="btn border border-white/20 px-6 py-3 text-base text-paper hover:bg-white/10">Ver como funciona</a>
            </div>
            <p className="mt-4 text-[0.8125rem] text-paper/55">Sem cartão de crédito. Cancele quando quiser.</p>
          </div>
          <div className="mx-auto w-full max-w-[320px]">
            <div className="rounded-[2.4rem] bg-black p-2.5 shadow-[0_40px_80px_-30px_rgba(0,0,0,.6)] ring-1 ring-white/10">
              <video className="aspect-[9/16] w-full rounded-[1.9rem] object-cover" src="/landing/demo.mp4" poster="/landing/demo-poster.jpg" autoPlay muted loop playsInline preload="metadata" aria-label="Demonstração do Vendlia" />
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-[1160px] scroll-mt-20 px-5 py-20 md:py-28">
        <p className="text-[0.8125rem] font-semibold tracking-[0.14em] text-mint-600 uppercase">Como funciona</p>
        <h2 className="mt-3 max-w-[18em] text-3xl font-bold tracking-[-0.03em] md:text-[2.75rem] md:leading-[1.1]">Do bairro ao cliente fechando, num lugar só.</h2>
        <ol className="mt-14 grid gap-6 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(16,24,40,.04)]">
              <div className="aspect-[16/10] overflow-hidden bg-[#eef0ea] p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.img} alt="" loading="lazy" className="h-full w-full rounded-lg object-cover object-top shadow-[0_12px_30px_-18px_rgba(16,24,40,.45)]" />
              </div>
              <div className="flex gap-4 p-6">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest text-sm font-bold text-mint">{i + 1}</span>
                <div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-1 text-graphite/70">{s.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[0.75rem] text-graphite/45">Telas com dados fictícios.</p>
      </section>

      <section className="border-y border-black/5 bg-white">
        <div className="mx-auto max-w-[1160px] px-5 py-20 md:py-28">
          <h2 className="max-w-[18em] text-3xl font-bold tracking-[-0.03em] md:text-[2.5rem] md:leading-[1.1]">Tudo o que você fazia na mão, rodando sozinho.</h2>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <f.icon size={22} className="text-mint-600" />
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-[0.9375rem] text-graphite/70">{f.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-16 overflow-hidden rounded-2xl border border-black/[0.08]">
            <table className="w-full text-left text-[0.9375rem]">
              <thead className="bg-[#f3f4ef] text-[0.8125rem] text-graphite/60">
                <tr><th className="px-5 py-3 font-medium"></th><th className="px-5 py-3 font-medium">Prospectar na mão</th><th className="px-5 py-3 font-semibold text-graphite">Com o Vendlia</th></tr>
              </thead>
              <tbody>
                {COMPARE.map(([k, a, b]) => (
                  <tr key={k} className="border-t border-black/[0.06]">
                    <td className="px-5 py-4 font-medium">{k}</td>
                    <td className="px-5 py-4 text-graphite/60"><span className="inline-flex gap-2"><X size={16} className="mt-0.5 shrink-0 text-[#d92d20]" />{a}</span></td>
                    <td className="px-5 py-4"><span className="inline-flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-mint-600" />{b}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="precos" className="mx-auto max-w-[1160px] scroll-mt-20 px-5 py-20 md:py-28">
        <p className="text-[0.8125rem] font-semibold tracking-[0.14em] text-mint-600 uppercase">Preços</p>
        <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] md:text-[2.75rem]">Um site vendido paga meses de plano.</h2>
        <p className="mt-3 text-graphite/70">Comece com {TRIAL_DAYS} dias grátis: {PLANS.trial.searches} buscas e {PLANS.trial.sites} site com IA, sem cartão. No plano anual, 20% de desconto.</p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PAID_PLANS.map((id) => {
            const p = PLANS[id];
            const yearly = priceFor(id, "yearly");
            return (
              <div key={id} className={`relative flex flex-col rounded-2xl border bg-white p-7 ${p.highlight ? "border-forest shadow-[0_24px_60px_-30px_rgba(16,47,41,.55)]" : "border-black/[0.08]"}`}>
                {p.highlight && <span className="absolute -top-3 left-7 rounded-full bg-forest px-3 py-1 text-[0.75rem] font-semibold text-mint">Mais escolhido</span>}
                <h3 className="text-xl font-semibold">{p.name}</h3>
                <p className="text-[0.875rem] text-graphite/60">{p.tagline}</p>
                <div className="mt-5 flex items-baseline gap-1"><span className="text-4xl font-bold tracking-[-0.03em]">{brl(p.monthly)}</span><span className="text-graphite/60">/mês</span></div>
                <p className="mt-1 text-[0.8125rem] text-graphite/55">ou {brl(yearly.perMonth)}/mês no anual</p>
                <ul className="mt-6 flex-1 space-y-2.5 text-[0.9375rem]">
                  {[`${p.sites} sites com IA por mês`, `${p.searches} buscas por mês`, `${p.logos} logos por mês`, `${p.numbers} ${p.numbers === 1 ? "número" : "números"} de WhatsApp`, ...(p.customDomain ? ["Domínio próprio nos sites"] : []), "Alertas e mensagem de espera"].map((t) => (
                    <li key={t} className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-mint-600" />{t}</li>
                  ))}
                </ul>
                <Link href="/signup" className={`btn mt-8 w-full py-3 ${p.highlight ? "btn-primary" : "btn-secondary"}`}>Começar teste grátis</Link>
              </div>
            );
          })}
        </div>
        <p className="mt-6 inline-flex items-center gap-2 text-[0.875rem] text-graphite/65"><ShieldCheck size={17} className="text-mint-600" />PIX, boleto ou cartão. Garantia de 7 dias depois de assinar.</p>
      </section>

      <section id="duvidas" className="scroll-mt-20 border-t border-black/5 bg-white">
        <div className="mx-auto max-w-[820px] px-5 py-20 md:py-28">
          <h2 className="text-3xl font-bold tracking-[-0.03em] md:text-[2.5rem]">Dúvidas</h2>
          <div className="mt-8 divide-y divide-black/[0.08] border-y border-black/[0.08]">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[1.0625rem] font-semibold">
                  {q}<span className="text-xl text-mint-600 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-graphite/70">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-forest text-paper">
        <div className="mx-auto max-w-[1160px] px-5 py-20 text-center md:py-24">
          <h2 className="mx-auto max-w-[16em] text-3xl font-bold tracking-[-0.03em] md:text-[2.75rem] md:leading-[1.1]">Tem cliente sem site no seu bairro agora.</h2>
          <p className="mt-4 text-paper/70">Faça a primeira busca em menos de um minuto.</p>
          <Link href="/signup" className="btn mt-8 bg-mint px-7 py-3.5 text-base font-semibold text-forest hover:bg-[#5fe0af]">Testar grátis por {TRIAL_DAYS} dias <ArrowRight size={18} /></Link>
        </div>
      </section>

      <footer className="bg-[#0b221d] text-[0.8125rem] text-paper/55">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-4 px-5 py-8">
          <span>© {new Date().getFullYear()} {e.LEGAL_NAME}{e.LEGAL_DOC ? ` · ${e.LEGAL_DOC}` : ""}</span>
          <nav className="flex flex-wrap gap-5">
            <Link href="/termos" className="hover:text-paper">Termos de uso</Link>
            <Link href="/privacidade" className="hover:text-paper">Privacidade</Link>
            {e.SUPPORT_EMAIL && <a href={`mailto:${e.SUPPORT_EMAIL}`} className="hover:text-paper">{e.SUPPORT_EMAIL}</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
