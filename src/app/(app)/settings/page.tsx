import { eq } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, whatsappInstances, memberships, users } from "@/server/db";
import { Badge, Card, Field, Notice, PageHeader } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { getOrgSettings } from "@/server/org";
import { env } from "@/server/env";
import { llmConfigured } from "@/server/ai/llm";
import { effectiveDailyLimit } from "@/server/whatsapp/limits";
import { isDemoInstance } from "@/lib/demo";
import { addMember, changePassword, createInstanceAction, instanceAction, saveOrgSettings } from "../_actions/settings";

export const metadata = { title: "Configurações" };

function Status({ ok, label }: { ok: boolean; label: string }) {
  return <li className="flex items-center justify-between py-2"><span>{label}</span><Badge tone={ok ? "green" : "amber"}>{ok ? "configurado" : "pendente"}</Badge></li>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const [st, instances, team] = await Promise.all([
    getOrgSettings(s.orgId),
    db.select().from(whatsappInstances).where(eq(whatsappInstances.orgId, s.orgId)).then((l) => l.filter((i) => !isDemoInstance(i.name))),
    db.select({ name: users.name, email: users.email, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.orgId, s.orgId)),
  ]);
  const e = env();
  const base = e.APP_URL.replace(/\/$/, "");
  const evoReady = !!(e.EVOLUTION_API_URL && e.EVOLUTION_API_KEY);
  const admin = s.role !== "operator";

  return (
    <>
      <PageHeader title="Configurações" />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card tour="settings-whatsapp" title={<span id="whatsapp">Números de WhatsApp</span>} action={admin && evoReady ? (
            <form action={createInstanceAction} className="flex gap-2">
              <input className="field !w-40 !py-1.5" name="label" placeholder="Apelido do número" />
              <Submit className="btn btn-primary !py-1.5">Conectar número</Submit>
            </form>
          ) : undefined}>
            {!evoReady && <Notice tone="warn">Configure <code>EVOLUTION_API_URL</code> e <code>EVOLUTION_API_KEY</code> (serviço Evolution API no Railway) para conectar números.</Notice>}
            {evoReady && instances.length === 0 && <p className="muted text-sm">Nenhum número conectado. Use um chip comercial dedicado — nunca seu número pessoal.</p>}
            <div className="space-y-4">
              {instances.map((i) => (
                <div key={i.id} className="rounded-xl border border-[var(--line)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold">{i.label} {i.phone && <span className="muted text-sm font-normal">· +{i.phone}</span>}</div>
                      <div className="muted text-xs">{i.name}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge tone={i.status === "open" ? "green" : i.status === "connecting" ? "amber" : "red"}>{i.status}</Badge>
                      {i.paused && <Badge tone="amber">envios frios pausados</Badge>}
                    </div>
                  </div>
                  {i.status !== "open" && i.qrBase64 && (
                    <div className="mt-3 flex flex-col items-center gap-2 rounded-lg bg-white p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={i.qrBase64.startsWith("data:") ? i.qrBase64 : `data:image/png;base64,${i.qrBase64}`} alt="QR code do WhatsApp" className="h-56 w-56" />
                      <p className="text-center text-xs text-black/60">WhatsApp → Aparelhos conectados → Conectar aparelho. O QR expira em ~40s: clique em “Novo QR” se precisar.</p>
                    </div>
                  )}
                  <div className="muted mt-3 text-xs">Limite efetivo hoje: {effectiveDailyLimit(i.dailyLimit, i.warmupStartedAt, new Date())}/dia (aquecimento), {i.hourlyLimit}/hora · intervalo aleatório de 1–4 min entre primeiros contatos.</div>
                  {admin && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {i.status !== "open" && <form action={instanceAction}><input type="hidden" name="instanceId" value={i.id} /><input type="hidden" name="op" value="qr" /><Submit className="btn btn-dark !py-1.5 text-xs">Novo QR</Submit></form>}
                      <form action={instanceAction}><input type="hidden" name="instanceId" value={i.id} /><input type="hidden" name="op" value="refresh" /><Submit className="btn btn-ghost !py-1.5 text-xs">Atualizar status</Submit></form>
                      {i.status === "open" && <form action={instanceAction}><input type="hidden" name="instanceId" value={i.id} /><input type="hidden" name="op" value="verify" /><Submit className="btn btn-ghost !py-1.5 text-xs">Verificar números dos leads</Submit></form>}
                      <form action={instanceAction}><input type="hidden" name="instanceId" value={i.id} /><input type="hidden" name="op" value="pause" /><Submit className="btn btn-ghost !py-1.5 text-xs">{i.paused ? "Retomar envios" : "Pausar envios frios"}</Submit></form>
                      <form action={instanceAction}><input type="hidden" name="instanceId" value={i.id} /><input type="hidden" name="op" value="logout" /><Submit className="btn btn-ghost !py-1.5 text-xs" confirm="Desconectar este número?">Desconectar</Submit></form>
                      <form action={instanceAction}><input type="hidden" name="instanceId" value={i.id} /><input type="hidden" name="op" value="delete" /><Submit className="btn btn-danger !py-1.5 text-xs" confirm="Remover a instância? O histórico de conversas também será removido.">Remover</Submit></form>
                      <form action={instanceAction} className="flex items-center gap-1">
                        <input type="hidden" name="instanceId" value={i.id} /><input type="hidden" name="op" value="limits" />
                        <input className="field !w-16 !py-1 text-xs" name="hourlyLimit" type="number" defaultValue={i.hourlyLimit} aria-label="Limite por hora" />
                        <span className="muted text-xs">/h</span>
                        <input className="field !w-16 !py-1 text-xs" name="dailyLimit" type="number" defaultValue={i.dailyLimit} aria-label="Limite diário" />
                        <span className="muted text-xs">/dia</span>
                        <Submit className="btn btn-ghost !py-1 text-xs">OK</Submit>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4"><Notice tone="warn">A Evolution API conecta o WhatsApp de forma não oficial. Mensagens frias em volume podem levar ao banimento do número: mantenha limites baixos, personalize as mensagens e respeite quem pedir para sair (o Vendlia bloqueia automaticamente).</Notice></div>
          </Card>

          <Card title="Abordagem e automação">
            <form action={saveOrgSettings} className="space-y-4">
              <Field label="Mensagem do primeiro contato" hint="Variáveis: {{saudacao}} {{empresa}} {{cidade}} {{link}} {{operador}}. Obrigatório conter {{link}} e uma opção de SAIR.">
                <textarea className="field min-h-32" name="outreachTemplate" defaultValue={st.outreachTemplate} disabled={!admin} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Início (h)"><input className="field" type="number" name="businessHoursStart" defaultValue={st.businessHoursStart} /></Field>
                <Field label="Fim (h)"><input className="field" type="number" name="businessHoursEnd" defaultValue={st.businessHoursEnd} /></Field>
                <Field label="Follow-up após (h)"><input className="field" type="number" name="followUpAfterHours" defaultValue={st.followUpAfterHours} /></Field>
                <Field label="Confiança mínima da IA"><input className="field" type="number" step="0.05" name="threshold" defaultValue={st.classifierConfidenceThreshold} /></Field>
                <div className="sm:col-span-2"><Field label="Seu WhatsApp para alertas (opcional)" hint="Recebe um aviso quando um lead esquentar."><input className="field" name="operatorWhatsapp" defaultValue={st.operatorWhatsapp ?? ""} placeholder="(81) 99999-9999" /></Field></div>
              </div>
              <div className="space-y-2 text-sm">
                <label className="flex items-start gap-2"><input type="checkbox" name="allowColdOutreach" defaultChecked={st.allowColdOutreach} className="mt-1 accent-[#39D79B]" /> Permitir primeiro contato para telefones comerciais públicos (sem opt-in)</label>
                <label className="flex items-start gap-2"><input type="checkbox" name="followUpEnabled" defaultChecked={st.followUpEnabled} className="mt-1 accent-[#39D79B]" /> Enviar um único follow-up para quem não respondeu</label>
                <label className="flex items-start gap-2"><input type="checkbox" name="autoReplyInformational" defaultChecked={st.autoReplyInformational} className="mt-1 accent-[#39D79B]" /> IA responde sozinha dúvidas simples (nunca preço, desconto ou prazo; exige LLM configurado)</label>
              </div>
              {admin && <Submit>Salvar</Submit>}
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={<span id="integracoes">Integrações</span>}>
            <ul className="divide-y divide-[var(--line)] text-sm">
              <Status ok={evoReady} label="WhatsApp (Evolution API)" />
              <Status ok={llmConfigured()} label={`IA (${e.LLM_PROVIDER})`} />
              <Status ok={!!e.GOOGLE_PLACES_API_KEY} label="Google Places (opcional)" />
              <Status ok={!!e.SITES_BASE_DOMAIN} label="Domínio dos sites" />
            </ul>
            <div className="mt-4 space-y-2 text-xs">
              <div><div className="font-semibold">Webhook Evolution (configurado automaticamente)</div><code className="block break-all rounded bg-[var(--panel-2)] p-2">{base}/api/webhooks/evolution</code></div>
            </div>
          </Card>

          <Card title="Equipe">
            <ul className="mb-4 divide-y divide-[var(--line)] text-sm">
              {team.map((m) => <li key={m.email} className="flex justify-between py-2"><span>{m.name}<span className="muted block text-xs">{m.email}</span></span><Badge>{m.role}</Badge></li>)}
            </ul>
            {admin && (
              <form action={addMember} className="grid gap-2">
                <input className="field" name="name" placeholder="Nome" required />
                <input className="field" name="email" type="email" placeholder="E-mail" required />
                <div className="flex gap-2">
                  <input className="field" name="password" type="password" placeholder="Senha inicial (8+)" minLength={8} required />
                  <select className="field !w-32" name="role" defaultValue="operator"><option value="operator">Operador</option><option value="admin">Admin</option></select>
                </div>
                <Submit className="btn btn-ghost">Adicionar pessoa</Submit>
              </form>
            )}
          </Card>

          <Card title="Minha senha">
            <form action={changePassword} className="flex gap-2">
              <input className="field" name="password" type="password" minLength={8} placeholder="Nova senha" required />
              <Submit className="btn btn-ghost">Alterar</Submit>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
