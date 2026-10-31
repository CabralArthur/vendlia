import { Logo } from "@/components/ui";

const STEPS = [
  ["Ache clientes", "Empresas sem site na sua cidade, com nota de oportunidade."],
  ["Gere o site", "Uma demonstração pronta com os dados reais de cada empresa."],
  ["Entre em contato", "O link vai pelo WhatsApp e você é avisado quando alguém se interessa."],
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="hidden flex-col justify-between bg-forest p-12 text-paper lg:flex xl:p-16">
        <Logo inverted className="h-9 w-auto self-start" />
        <div className="max-w-md">
          <p className="text-[2.25rem] font-bold leading-[1.1] tracking-[-0.03em]">Sua próxima venda começa antes do primeiro contato.</p>
          <ol className="mt-10 space-y-5">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-mint/50 text-[0.8125rem] font-bold text-mint">{i + 1}</span>
                <div>
                  <div className="font-semibold">{t}</div>
                  <div className="text-[0.875rem] text-paper/65">{d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-[0.75rem] text-paper/45">© {new Date().getFullYear()} Vendlia</p>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>
    </main>
  );
}
