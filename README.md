# Vendlia

Prospecção → demonstração de site → WhatsApp → handoff humano → proposta → pagamento → site publicado com mensalidade.

## Arquitetura

| Peça | O que faz |
|---|---|
| **web** (Next.js 16, App Router) | Painel, server actions, webhooks, renderer multi-tenant dos sites (`/s/<slug>`, subdomínio curinga e domínio próprio via `src/proxy.ts`), página pública de proposta/checkout |
| **worker** (BullMQ) | Prospecção, geração de sites, envio de WhatsApp com ritmo controlado, processamento de mensagens recebidas, pagamentos, follow-ups, rotinas de manutenção |
| **PostgreSQL** (Drizzle ORM) | Dados, migrations versionadas em `drizzle/` (aplicadas no start com advisory lock) |
| **Redis** | Filas, limites de envio, tempo real (pub/sub → SSE no painel) |
| **Evolution API** (serviço separado) | Conexão do WhatsApp por QR code |
| **Asaas** | Pix/boleto/cartão + assinatura mensal |

Decisões: um único app Next.js no lugar de Next + NestJS (menos serviços, mesmo código de domínio no web e no worker); Drizzle no lugar de Prisma (sem binários de engine, build mais simples); IA opcional — sem chave, classificação e textos usam regras determinísticas que nunca inventam fatos.

## Deploy no Railway (≈20 min)

1. Suba este repositório para o GitHub.
2. No Railway, crie um projeto e adicione **PostgreSQL** e **Redis**.
3. **Serviço `web`**: *New → GitHub Repo* → este repositório. Variáveis (veja `.env.example`):
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `REDIS_URL=${{Redis.REDIS_URL}}`
   - `APP_URL` = domínio público do serviço (Settings → Networking → Generate Domain), `SESSION_SECRET`
4. **Serviço `worker`**: adicione o mesmo repositório de novo. Em *Settings → Config-as-code*, aponte para `/railway.worker.json`. Copie as mesmas variáveis do web.
5. **Evolution API**: *New → Template* → "Evolution API" (fixe a imagem em `evoapicloud/evolution-api:v2.3.7` — a partir da v2.4.0 exige ativação de licença). Monte o volume em `/evolution/instances`. Coloque no web e no worker:
   - `EVOLUTION_API_URL` (de preferência a URL interna `http://<serviço>.railway.internal:8080`)
   - `EVOLUTION_API_KEY` = `AUTHENTICATION_API_KEY` da Evolution
6. **Asaas**: crie a chave de API (comece em sandbox: `ASAAS_ENV=sandbox`). No painel Asaas → Integrações → Webhooks, cadastre `https://<APP_URL>/api/webhooks/asaas` com um *token de autenticação* (32+ caracteres) e eventos de cobrança e assinatura. Use o mesmo valor em `ASAAS_WEBHOOK_TOKEN`.
7. **Sites dos clientes** (opcional, recomendado): no serviço web adicione o domínio curinga `*.sites.seudominio.com.br` e defina `SITES_BASE_DOMAIN=sites.seudominio.com.br`. Domínio próprio de um cliente: adicione-o como Custom Domain no serviço web e salve no Studio do site.
8. Abra o painel, crie sua conta, depois defina `ALLOW_SIGNUP=false`.
9. Configurações → **Conectar número** → escaneie o QR com o WhatsApp do chip comercial.

Health check: `GET /api/health` (banco, Redis e heartbeat do worker).

## Operação diária

1. **Prospecção** → cidade + segmento (OpenStreetMap grátis; Google Places se tiver chave) ou CSV.
2. **Leads** → ordenados por score explicável. Confirme ausência de site, selecione e “Gerar demonstrações”.
3. **Enviar 1º contato** → enfileirado; sai em horário comercial (seg–sáb), com aquecimento do número (10/dia subindo 5/dia), limite por hora e intervalo aleatório de 1–4 min.
4. Resposta chega → classificada → se houver interesse/preço/compra, a conversa vai para **Aguardando humano**, a automação para, e você recebe alerta (painel, notificação do navegador e, se configurado, no seu WhatsApp).
5. **Inbox** → assumir → responder → **Criar proposta** (link enviado no WhatsApp).
6. Cliente abre a proposta → preenche CPF/CNPJ → paga no Asaas → webhook confirma (com reconsulta ao Asaas) → lead vira **Fechado**.
7. Cliente aprova o conteúdo → site publicado automaticamente. Mensalidade em atraso por 15 dias suspende o site.

“SAIR”/“parar” bloqueia o número na hora, cancela envios pendentes e manda uma única confirmação.

## Desenvolvimento local

```bash
pnpm install
cp .env.example .env.local   # aponte para Postgres/Redis locais
pnpm db:migrate
pnpm tsx scripts/evolution-sandbox.ts   # WhatsApp simulado (só dev)
pnpm dev & pnpm dev:worker
pnpm test                               # unitários + fluxo completo contra Postgres/Redis reais
```

Com `EVOLUTION_API_URL=http://localhost:8089`, `EVOLUTION_API_KEY=sandbox-key` e `DEV_IGNORE_BUSINESS_HOURS=true` (ignorado em produção) é possível rodar o fluxo inteiro. Para simular a resposta de um lead:
`curl -XPOST localhost:8089/_simulate -d '{"from":"5581999998888","text":"Quanto fica?"}'`

## Riscos que continuam sendo seus

- **WhatsApp não oficial**: a Evolution API viola os termos do WhatsApp; volume frio leva a banimento. Use chips dedicados, mantenha limites baixos e mensagens personalizadas.
- **LGPD**: o sistema registra origem dos dados, consentimento e opt-out, mas a base legal (legítimo interesse) é avaliação sua.
- **Google Places**: dados (exceto o place_id) ficam no máximo 30 dias; leads nunca trabalhados são apagados automaticamente.
- **Marca/registro**: verifique “Vendlia” no INPI e o domínio no Registro.br antes de investir na marca.
