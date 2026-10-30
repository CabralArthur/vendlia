import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-900 p-12 text-paper lg:flex lg:flex-col lg:justify-between">
        <Logo inverted className="h-10 w-auto self-start" />
        <div>
          <p className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            Sua próxima venda começa <span className="text-brand-500">antes do primeiro contato.</span>
          </p>
          <ul className="mt-8 space-y-3 text-sm text-paper/75">
            <li>● Encontre negócios sem site na sua cidade</li>
            <li>● Gere uma demonstração personalizada em segundos</li>
            <li>● Receba o alerta quando o cliente quiser comprar</li>
            <li>● Feche, cobre e publique sem sair do painel</li>
          </ul>
        </div>
        <p className="text-xs text-paper/50">© {new Date().getFullYear()} Vendlia</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" />
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
