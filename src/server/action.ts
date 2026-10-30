import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";

/** Runs a mutation and redirects back with a flash message (?ok= / ?err=). */
export async function act(back: string, fn: () => Promise<string | void>): Promise<never> {
  let ok: string | void;
  try {
    ok = await fn();
  } catch (e) {
    unstable_rethrow(e);
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    console.error("[action]", back, msg);
    redirect(withParam(back, "err", msg.slice(0, 300)));
  }
  revalidatePath(back.split("?")[0]!);
  redirect(ok ? withParam(back, "ok", ok) : back);
}

function withParam(url: string, k: string, v: string) {
  const [p, q] = url.split("?");
  const sp = new URLSearchParams(q);
  sp.delete("ok");
  sp.delete("err");
  sp.set(k, v);
  return `${p}?${sp.toString()}`;
}

export function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}
