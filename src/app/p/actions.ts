"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";
import { approveContent, checkoutProposal } from "@/server/commerce";
import { redis } from "@/server/redis";

async function limited(token: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const k = `rl:checkout:${token}:${ip}`;
  const n = await redis().incr(k);
  if (n === 1) await redis().expire(k, 900);
  return n > 10;
}

export async function checkoutAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (await limited(token)) redirect(`/p/${token}?err=${encodeURIComponent("Muitas tentativas. Aguarde alguns minutos.")}`);
  let url: string;
  try {
    const r = await checkoutProposal(token, {
      name: String(fd.get("name") ?? ""),
      document: String(fd.get("document") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      approveContent: fd.get("approve") === "on",
      acceptTerms: fd.get("accept") === "on",
    });
    url = r.redirectUrl;
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/p/${token}?err=${encodeURIComponent(e instanceof Error ? e.message : "Erro")}`);
  }
  redirect(url);
}

export async function approveAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  try {
    await approveContent(token);
  } catch (e) {
    unstable_rethrow(e);
    redirect(`/p/${token}?err=${encodeURIComponent(e instanceof Error ? e.message : "Erro")}`);
  }
  redirect(`/p/${token}?ok=${encodeURIComponent("Conteúdo aprovado. Obrigado!")}`);
}
