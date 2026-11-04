import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui";
import { env } from "@/server/env";

/** Shared shell for the public legal pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const e = env();
  return (
    <div className="min-h-screen bg-paper text-graphite">
      <header className="border-b border-black/5">
        <div className="mx-auto flex h-16 max-w-[820px] items-center px-5">
          <Link href="/" className="flex items-center gap-2"><LogoMark className="h-7 w-7" /><span className="text-[1.125rem] font-bold tracking-[-0.02em]">vendlia<span className="text-mint-600">.</span></span></Link>
        </div>
      </header>
      <main className="legal mx-auto max-w-[820px] px-5 py-12">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-sm text-graphite/55">Atualizado em {updated}. Responsável: {e.LEGAL_NAME}{e.LEGAL_DOC ? `, ${e.LEGAL_DOC}` : ""}{e.SUPPORT_EMAIL ? ` · contato: ${e.SUPPORT_EMAIL}` : ""}.</p>
        <div className="mt-8 space-y-5 text-[0.9375rem] leading-7 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{children}</div>
      </main>
    </div>
  );
}

export function contactLine() {
  const e = env();
  return e.SUPPORT_EMAIL ? `pelo e-mail ${e.SUPPORT_EMAIL}` : "pelos canais de suporte informados no site";
}
