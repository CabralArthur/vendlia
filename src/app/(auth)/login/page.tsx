import Link from "next/link";
import { loginAction } from "../actions";
import { Submit } from "@/components/submit";
import { Flash } from "@/components/flash";
import { Field, Logo } from "@/components/ui";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <Logo className="mb-8 h-8 w-auto lg:hidden" />
      <h1 className="text-2xl font-bold tracking-tight">Entrar</h1>
      <p className="muted mb-6 mt-1 text-sm">Acesse seu centro de vendas.</p>
      <Flash sp={sp} />
      <form action={loginAction} className="space-y-4">
        <Field label="E-mail"><input className="field" name="email" type="email" required autoComplete="email" /></Field>
        <Field label="Senha"><input className="field" name="password" type="password" required autoComplete="current-password" /></Field>
        <Submit className="btn btn-dark w-full" pendingText="Entrando…">Entrar</Submit>
      </form>
      <p className="muted mt-6 text-sm">Ainda não tem conta? <Link href="/signup" className="font-semibold text-[var(--ink)] underline">Criar conta</Link></p>
    </>
  );
}
