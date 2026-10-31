"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, registerOwner, verifyLogin } from "@/server/auth";
import { redis } from "@/server/redis";
import { headers } from "next/headers";

async function rateLimit(key: string, max: number, windowSec: number) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const k = `rl:auth:${key}:${ip}`;
  const n = await redis().incr(k);
  if (n === 1) await redis().expire(k, windowSec);
  return n <= max;
}

export async function loginAction(fd: FormData) {
  if (!(await rateLimit("login", 10, 600))) redirect("/login?err=" + encodeURIComponent("Muitas tentativas. Aguarde alguns minutos."));
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  const r = await verifyLogin(email, password);
  if (!r) redirect("/login?err=" + encodeURIComponent("E-mail ou senha inválidos."));
  await createSession(r.userId, r.orgId);
  redirect("/dashboard");
}

const signupSchema = z.object({
  name: z.string().min(2, "Informe seu nome"),
  orgName: z.string().min(2, "Informe o nome da empresa"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
});

export async function signupAction(fd: FormData) {
  if (process.env.ALLOW_SIGNUP === "false") redirect("/login?err=" + encodeURIComponent("Cadastro desativado. Peça um convite."));
  if (!(await rateLimit("signup", 5, 3600))) redirect("/signup?err=" + encodeURIComponent("Muitas tentativas."));
  const parsed = signupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) redirect("/signup?err=" + encodeURIComponent(parsed.error.issues[0]!.message));
  let r: { userId: string; orgId: string };
  try {
    r = await registerOwner(parsed.data);
  } catch (e) {
    redirect("/signup?err=" + encodeURIComponent(e instanceof Error ? e.message : "Erro"));
  }
  await createSession(r.userId, r.orgId);
  redirect("/onboarding?ok=" + encodeURIComponent("Conta criada! Siga o passo a passo para começar."));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
