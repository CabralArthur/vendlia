import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { requireSession } from "@/server/auth";
import { db, whatsappInstances, memberships, users } from "@/server/db";
import { Badge, Check, Field, Notice, PageHeader, INSTANCE_LABEL, ROLE_LABEL } from "@/components/ui";
import { Flash } from "@/components/flash";
import { Submit } from "@/components/submit";
import { getOrgSettings } from "@/server/org";
import { env } from "@/server/env";
import { llmConfigured, llmProvider, llmSiteModel, monthSpendUsd } from "@/server/ai/llm";
import { effectiveDailyLimit } from "@/server/whatsapp/limits";
import { isDemoInstance } from "@/lib/demo";
import { formatBrPhone } from "@/lib/phone";
import { addMember, changePassword, createInstanceAction, instanceAction, saveOrgSettings, testAiAction } from "../_actions/settings";
import { QrCode, RefreshCw, ShieldCheck, Pause, Play, Unplug, Trash2 } from "lucide-react";

export const metadata = { title: "Configurações" };

function Section({ id, title, description, children }: { id?: string; title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-8 gap-4 border-t border-[var(--line)] py-8 first:border-t-0 first:pt-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
        <div className="muted mt-1 text-[0.8125rem] leading-5">{description}</div>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

function InstanceOp({ id, op, children, className = "btn btn-secondary btn-sm", confirm }: { id: string; op: string; children: ReactNode; className?: string; confirm?: string }) {
  return (
    <form action={instanceAction}>
      <input type="hidden" name="instanceId" value={id} />
      <input type="hidden" name="op" value={op} />
      <Submit className={className} confirm={confirm}>{children}</Submit>
    </form>
  );
}

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="muted text-[0.8125rem]">{detail}</div>
      </div>
      <Badge tone={ok ? "green" : "neutral"}>{ok ? "Ativo" : "Desligado"}</Badge>
    </li>
  );
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
  const evoReady = !!(e.EVOLUTION_API_URL && e.EVOLUTION_API_KEY);
  const admin = s.role !== "operator";
  const ai = llmConfigured();
  const aiSpent = ai ? await monthSpendUsd(s.orgId) : 0;

  return (
    <>
      <PageHeader title="Configurações" />
      <Flash sp={sp} />

      <div className="panel px-6 py-7 sm:px-8">
        <Section
          id="whatsapp"
          title="WhatsApp"
          description={<>O número que envia o primeiro contato e recebe as respostas. Use um chip só para isso, nunca o seu número pessoal.</>}
        >
          {!evoReady && (
            <Notice tone="warn" title="Evolution API não configurada">
              Preencha EVOLUTION_API_URL e EVOLUTION_API_KEY no serviço web do Railway para conectar um número.
            </Notice>
          )}

          {instances.map((i) => {
            const [statusLabel, tone] = INSTANCE_LABEL[i.status] ?? [i.status, "neutral"];
            const today = effectiveDailyLimit(i.dailyLimit, i.warmupStartedAt, new Date());
            return (
              <div key={i.id} className="rounded-[var(--radius-lg)] border border-[var(--line)]">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="font-semibold">{i.label}</div>
                    <div className="muted text-[0.8125rem] tabular-nums">{i.phone ? formatBrPhone(i.phone) : "Número aparece após conectar"}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {i.paused && <Badge tone="amber">Envios pausados</Badge>}
                    <Badge tone={tone}>{statusLabel}</Badge>
                  </div>
                </div>

                {i.status !== "open" && i.qrBase64 && (
                  <div className="flex flex-col items-center gap-4 border-t border-[var(--line)] bg-[var(--surface-2)] px-4 py-5 sm:flex-row sm:items-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.qrBase64.startsWith("data:") ? i.qrBase64 : `data:image/png;base64,${i.qrBase64}`} alt="QR code para conectar o WhatsApp" className="h-48 w-48 rounded-[var(--radius)] bg-white p-2 ring-1 ring-[var(--line)]" />
                    <ol className="list-decimal space-y-1.5 pl-5 text-[0.8125rem]">
                      <li>Abra o WhatsApp no celular do chip comercial.</li>
                      <li>Toque em <b>Aparelhos conectados</b> e depois em <b>Conectar aparelho</b>.</li>
                      <li>Aponte a câmera para este código.</li>
                      <li className="muted">O código expira em cerca de 40 segundos. Se expirar, gere outro.</li>
                    </ol>
                  </div>
                )}

                <div className="border-t border-[var(--line)] px-4 py-3 text-[0.8125rem]">
                  <span className="muted">Hoje este número pode enviar até </span>
                  <b className="tabular-nums">{today}</b>
                  <span className="muted"> primeiros contatos{today < i.dailyLimit ? " (número em aquecimento: o limite sobe 5 por dia)" : ""}, no máximo {i.hourlyLimit} por hora.</span>
                </div>

                {admin && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-4 py-3">
                    {i.status !== "open" ? (
                      <InstanceOp id={i.id} op="qr" className="btn btn-primary btn-sm"><QrCode size={14} /> Gerar QR code</InstanceOp>
                    ) : (
                      <InstanceOp id={i.id} op="verify"><ShieldCheck size={14} /> Verificar números dos leads</InstanceOp>
                    )}
                    <InstanceOp id={i.id} op="refresh" className="btn btn-quiet btn-sm"><RefreshCw size={14} /> Atualizar status</InstanceOp>
                    <InstanceOp id={i.id} op="pause" className="btn btn-quiet btn-sm">{i.paused ? <><Play size={14} /> Retomar envios</> : <><Pause size={14} /> Pausar envios</>}</InstanceOp>
                    <div className="ml-auto flex gap-2">
                      {i.status === "open" && <InstanceOp id={i.id} op="logout" className="btn btn-quiet btn-sm" confirm="Desconectar este número?"><Unplug size={14} /> Desconectar</InstanceOp>}
                      <InstanceOp id={i.id} op="delete" className="btn btn-danger btn-sm" confirm="Remover este número? O histórico de conversas dele também será apagado."><Trash2 size={14} /> Remover</InstanceOp>
                    </div>
                  </div>
                )}

                {admin && (
                  <details className="group border-t border-[var(--line)] px-4 py-3">
                    <summary className="muted cursor-pointer list-none text-[0.8125rem] font-medium hover:text-[var(--ink)]">
                      <span className="inline-block transition-transform group-open:rotate-90">›</span> Ajustar limites de envio
                    </summary>
                    <form action={instanceAction} className="mt-3 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="instanceId" value={i.id} />
                      <input type="hidden" name="op" value="limits" />
                      <Field label="Por hora" className="w-28"><input className="field" name="hourlyLimit" type="number" min={1} max={60} defaultValue={i.hourlyLimit} /></Field>
                      <Field label="Por dia" className="w-28"><input className="field" name="dailyLimit" type="number" min={1} max={500} defaultValue={i.dailyLimit} /></Field>
                      <Submit className="btn btn-secondary">Salvar limites</Submit>
                    </form>
                  </details>
                )}
              </div>
            );
          })}

          {admin && evoReady && (
            <form action={createInstanceAction} className="flex flex-wrap items-end gap-3">
              <Field label={instances.length ? "Conectar outro número" : "Conectar um número"} className="min-w-56 flex-1">
                <input className="field" name="label" placeholder="Apelido, ex.: Comercial 1" />
              </Field>
              <Submit className={instances.length ? "btn btn-secondary" : "btn btn-primary"} pendingText="Conectando…"><QrCode size={16} /> Conectar número</Submit>
            </form>
          )}

          <p className="muted text-[0.8125rem]">
            A conexão pela Evolution API não é oficial do WhatsApp. Envio frio em volume pode bloquear o número; por isso a Vendlia envia devagar e para na hora com quem pede para sair.
          </p>
        </Section>

        <Section id="mensagem" title="Primeiro contato" description="A mensagem enviada com o link do site e quando ela pode sair.">
          <form action={saveOrgSettings} className="space-y-5">
            <Field
              label="Mensagem"
              hint={<>Use <code>{"{{saudacao}}"}</code>, <code>{"{{empresa}}"}</code>, <code>{"{{cidade}}"}</code>, <code>{"{{link}}"}</code> e <code>{"{{operador}}"}</code>. O <code>{"{{link}}"}</code> e a opção de responder SAIR são obrigatórios.</>}
            >
              <textarea className="field" rows={6} name="outreachTemplate" defaultValue={st.outreachTemplate} disabled={!admin} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Enviar a partir de" hint="Hora, de segunda a sábado"><input className="field" type="number" min={6} max={20} name="businessHoursStart" defaultValue={st.businessHoursStart} disabled={!admin} /></Field>
              <Field label="Até" hint="Hora"><input className="field" type="number" min={8} max={22} name="businessHoursEnd" defaultValue={st.businessHoursEnd} disabled={!admin} /></Field>
              <Field label="Lembrete após" hint="Horas sem resposta"><input className="field" type="number" min={24} max={240} name="followUpAfterHours" defaultValue={st.followUpAfterHours} disabled={!admin} /></Field>
            </div>
            <div className="space-y-3">
              <Check name="allowColdOutreach" defaultChecked={st.allowColdOutreach} disabled={!admin} label="Permitir contato com telefones comerciais públicos" description="Empresas que não pediram contato, mas divulgam o telefone. Desligado, só quem autorizou recebe mensagem." />
              <Check name="followUpEnabled" defaultChecked={st.followUpEnabled} disabled={!admin} label="Enviar um lembrete para quem não respondeu" description="Uma única mensagem, depois do prazo acima." />
              <Check name="holdingReply" defaultChecked={st.holdingReply} disabled={!admin} label="Segurar o lead quente quando você não puder responder" description="Se o cliente pedir preço ou quiser fechar e ninguém responder no prazo abaixo, sai uma mensagem curta como “Já vou te passar os valores, só um instante.” Nunca fala de preço. Se você responder antes, ela não é enviada." />
              <div className="pl-7">
                <Field label="Esperar antes de mandar" hint="Minutos (0 = na hora)">
                  <input className="field w-28" type="number" min={0} max={120} name="holdingReplyAfterMinutes" defaultValue={st.holdingReplyAfterMinutes} disabled={!admin} />
                </Field>
              </div>
              {ai ? (
                <Check name="autoReplyInformational" defaultChecked={st.autoReplyInformational} disabled={!admin} label="Responder dúvidas simples automaticamente" description="Nunca fala de preço, desconto ou prazo; isso fica sempre com você." />
              ) : (
                <input type="hidden" name="autoReplyInformational" value={st.autoReplyInformational ? "on" : ""} />
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Seu WhatsApp para alertas" optional hint="Recebe no celular um aviso com o link da conversa quando um cliente demonstrar interesse. Recomendado.">
                <input className="field" type="tel" inputMode="tel" name="operatorWhatsapp" defaultValue={st.operatorWhatsapp ? formatBrPhone(st.operatorWhatsapp) : ""} placeholder="(81) 99999-9999" disabled={!admin} />
              </Field>
              {ai ? (
                <Field label="Confiança mínima da IA" hint="Abaixo disso, a conversa vai para você.">
                  <input className="field" type="number" step="0.05" min={0.3} max={0.99} name="threshold" defaultValue={st.classifierConfidenceThreshold} disabled={!admin} />
                </Field>
              ) : (
                <input type="hidden" name="threshold" value={st.classifierConfidenceThreshold} />
              )}
            </div>
            {admin && <div className="flex justify-end"><Submit className="btn btn-primary" pendingText="Salvando…">Salvar</Submit></div>}
          </form>
        </Section>

        <Section id="equipe" title="Equipe" description="Quem pode entrar no painel. Operadores atendem e prospectam; admins também mudam configurações.">
          <ul className="divide-y divide-[var(--line)] rounded-[var(--radius-lg)] border border-[var(--line)]">
            {team.map((m) => (
              <li key={m.email} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{m.name}</div>
                  <div className="muted truncate text-[0.8125rem]">{m.email}</div>
                </div>
                <Badge>{ROLE_LABEL[m.role] ?? m.role}</Badge>
              </li>
            ))}
          </ul>
          {admin && (
            <details className="group">
              <summary className="btn btn-secondary btn-sm list-none">Adicionar pessoa</summary>
              <form action={addMember} className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Nome" required><input className="field" name="name" required autoComplete="off" /></Field>
                <Field label="E-mail" required><input className="field" name="email" type="email" required autoComplete="off" /></Field>
                <Field label="Senha inicial" required hint="Mínimo de 8 caracteres. Envie para a pessoa trocar depois."><input className="field" name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
                <Field label="Acesso">
                  <select className="field" name="role" defaultValue="operator"><option value="operator">Operador</option><option value="admin">Admin</option></select>
                </Field>
                <div className="flex justify-end sm:col-span-2"><Submit className="btn btn-primary">Adicionar</Submit></div>
              </form>
            </details>
          )}
        </Section>

        <Section id="conta" title="Sua senha" description={`Conectado como ${s.user.email}.`}>
          <form action={changePassword} className="flex flex-wrap items-end gap-3">
            <Field label="Nova senha" hint="Mínimo de 8 caracteres." className="min-w-56 flex-1"><input className="field" name="password" type="password" minLength={8} required autoComplete="new-password" /></Field>
            <Submit className="btn btn-secondary">Alterar senha</Submit>
          </form>
        </Section>

        <Section id="integracoes" title="Integrações" description="Configuradas pelas variáveis do Railway. O que estiver desligado é opcional, exceto o WhatsApp.">
          <ul className="divide-y divide-[var(--line)] rounded-[var(--radius-lg)] border border-[var(--line)] px-4">
            <Status ok={evoReady} label="WhatsApp (Evolution API)" detail="Envio do primeiro contato e respostas no Inbox." />
            <Status ok={!!e.GOOGLE_PLACES_API_KEY} label="Google Maps" detail="Busca de empresas com mais telefones. Sem ela, usa o OpenStreetMap." />
            <Status ok={ai} label="Inteligência artificial" detail={ai ? `Cria os sites (${llmSiteModel()} via ${llmProvider()}). Gasto este mês: US$ ${aiSpent.toFixed(2)} de US$ ${e.LLM_MONTHLY_BUDGET_USD}.` : "Sem chave: os sites usam o modelo pronto. Configure OPENROUTER_API_KEY."} />
            <Status ok={!!e.SITES_BASE_DOMAIN} label="Domínio para os sites" detail="Endereços como cliente.sites.seudominio.com.br." />
          </ul>
          <form action={testAiAction} className="flex flex-wrap items-center gap-3">
            <Submit className="btn btn-secondary" pendingText="Testando a IA… (até 1 min)">Testar IA</Submit>
            <span className="muted text-[0.8125rem]">Faz uma chamada curta ao modelo que cria os sites e mostra o resultado.</span>
          </form>
        </Section>
      </div>
    </>
  );
}
