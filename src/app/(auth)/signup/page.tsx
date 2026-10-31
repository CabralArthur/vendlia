import Link from "next/link";
import { signupAction } from "../actions";
import { Submit } from "@/components/submit";
import { Flash } from "@/components/flash";
import { Field, Logo } from "@/components/ui";

export const metadata = { title: "Criar conta" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <Logo className="mb-10 h-8 w-auto lg:hidden" />
      <h1 className="text-[1.625rem] font-bold tracking-[-0.02em]">Criar conta</h1>
      <p className="muted mt-1.5 mb-7 text-sm">Leva menos de um minuto.</p>
      <Flash sp={sp} />
      <form action={signupAction} className="space-y-4">
        <Field label="Seu nome"><input className="field" name="name" required autoComplete="name" /></Field>
        <Field label="Nome da sua empresa"><input className="field" name="orgName" required /></Field>
        <Field label="E-mail"><input className="field" name="email" type="email" required autoComplete="email" /></Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres"><input className="field" name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
        <Submit className="btn btn-primary btn-block" pendingText="Criando…">Criar conta</Submit>
      </form>
      <p className="muted mt-8 text-center text-sm">Já tem conta? <Link href="/login" className="font-semibold text-[var(--ink)] underline underline-offset-4">Entrar</Link></p>
    </>
  );
}
