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
      <Logo className="mb-8 h-8 w-auto lg:hidden" />
      <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
      <p className="muted mb-6 mt-1 text-sm">Configure sua operação em menos de 2 minutos.</p>
      <Flash sp={sp} />
      <form action={signupAction} className="space-y-4">
        <Field label="Seu nome"><input className="field" name="name" required autoComplete="name" /></Field>
        <Field label="Nome da sua empresa/agência"><input className="field" name="orgName" required /></Field>
        <Field label="E-mail"><input className="field" name="email" type="email" required autoComplete="email" /></Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres"><input className="field" name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
        <Submit className="btn btn-dark w-full" pendingText="Criando…">Criar conta</Submit>
      </form>
      <p className="muted mt-6 text-sm">Já tem conta? <Link href="/login" className="font-semibold text-[var(--ink)] underline">Entrar</Link></p>
    </>
  );
}
