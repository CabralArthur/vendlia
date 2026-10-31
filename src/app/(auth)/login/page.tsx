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
      <Logo className="mb-10 h-8 w-auto lg:hidden" />
      <h1 className="text-[1.625rem] font-bold tracking-[-0.02em]">Entrar</h1>
      <p className="muted mt-1.5 mb-7 text-sm">Acesse sua conta Vendlia.</p>
      <Flash sp={sp} />
      <form action={loginAction} className="space-y-4">
        <Field label="E-mail"><input className="field" name="email" type="email" required autoComplete="email" /></Field>
        <Field label="Senha"><input className="field" name="password" type="password" required autoComplete="current-password" /></Field>
        <Submit className="btn btn-primary btn-block" pendingText="Entrando…">Entrar</Submit>
      </form>
      <p className="muted mt-8 text-center text-sm">Ainda não tem conta? <Link href="/signup" className="font-semibold text-[var(--ink)] underline underline-offset-4">Criar conta</Link></p>
    </>
  );
}
