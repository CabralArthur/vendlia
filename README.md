# Vendlia

Achar clientes → gerar o site → entrar em contato pelo WhatsApp → publicar quando o cliente fechar.

## Arquitetura

| Peça | O que faz |
|---|---|
| **web** (Next.js 16) | Painel, webhook do WhatsApp e os sites dos clientes (`/s/<slug>`, subdomínio curinga e domínio próprio via `src/proxy.ts`) |
| **processamento em segundo plano** (BullMQ) | Prospecção, geração de sites, envio de WhatsApp com ritmo controlado, leitura das respostas, follow-ups. Roda dentro do serviço web por padrão |
| **PostgreSQL** (Drizzle) | Dados; migrations em `drizzle/`, aplicadas no start |
| **Redis** | Filas, limites de envio e atualização da tela em tempo real |
| **Evolution API** (serviço separado) | Conecta o WhatsApp por QR code |

Pagamento fica fora do sistema: combine com o cliente e publique o site no Studio quando ele aprovar.

## Deploy no Railway

1. No projeto do Railway, adicione **PostgreSQL** e **Redis**.
2. **Serviço `web`**: *New → GitHub Repo* → este repositório. Variáveis:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `REDIS_URL=${{Redis.REDIS_URL}}`
   - `APP_URL` = domínio público do serviço (Settings → Networking → Generate Domain), sem barra no final
   - `SESSION_SECRET` = texto longo e aleatório
3. Não é preciso um serviço `worker`: o serviço web já faz o processamento em segundo plano. (Se preferir separar, crie um serviço com `/railway.worker.json` e defina `WORKER_IN_WEB=false` no web.)
4. **Evolution API** (para o WhatsApp automático): use o template "Evolution API" com a imagem fixada em `evoapicloud/evolution-api:v2.3.7` (a partir da v2.4.0 exige ativação de licença) e volume em `/evolution/instances`. No serviço web:
   - `EVOLUTION_API_URL` = URL da Evolution (de preferência a interna, ex.: `http://evolution-api.railway.internal:8080`)
   - `EVOLUTION_API_KEY` = o `AUTHENTICATION_API_KEY` da Evolution
5. Abra o painel, crie sua conta e depois defina `ALLOW_SIGNUP=false`.
6. Configurações → **Conectar número** → escaneie o QR com o WhatsApp do chip comercial.

Opcionais: `SITES_BASE_DOMAIN` (sites em `<slug>.sites.seudominio.com.br`, com domínio curinga no serviço web), `GOOGLE_PLACES_API_KEY` (prospecção pelo Google), `LLM_PROVIDER` + chave (textos e leitura de mensagens por IA; sem chave usa regras).

Health check: `GET /api/health`.

## Primeiro acesso

Depois de criar a conta você cai em **Como funciona**:

- **Dados de exemplo**: empresas fictícias, sites gerados, uma conversa “Aguardando humano”, um site publicado e um opt-out. Nunca enviam mensagens. Remova com um clique.
- **Tour guiado** pelas telas.
- **Checklist** com o seu progresso real.

## Operação

1. **Prospecção** → cidade + segmento (OpenStreetMap grátis; Google com chave), CSV ou cadastro manual.
2. **Leads** → ordenados por nota. Selecione e “Gerar demonstrações”.
3. **Enviar 1º contato** → sai em horário comercial (seg–sáb), com aquecimento do número (10/dia subindo 5/dia), limite por hora e intervalo de 1–4 min. Um follow-up após 48h sem resposta.
4. Resposta com interesse → a automação para, a conversa fica “Aguardando humano” e aparece um alerta na tela.
5. **Inbox** → assumir → conversar → combinar preço e pagamento.
6. **Studio** → ajustar o site → **Publicar**. O lead vira “Fechado”.

“SAIR”/“parar” bloqueia o número na hora e cancela envios pendentes.

## Desenvolvimento local

```bash
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm tsx scripts/evolution-sandbox.ts   # WhatsApp simulado (só dev)
pnpm dev                              # já inclui o processamento em segundo plano
pnpm test
```

## Riscos

- **WhatsApp não oficial**: a Evolution API viola os termos do WhatsApp; envio frio em volume leva a banimento. Use chip dedicado e limites baixos.
- **LGPD**: o sistema registra origem dos dados e opt-out, mas a base legal é avaliação sua.
- **Google Places**: dados (exceto o ID) ficam no máximo 30 dias; leads não trabalhados são apagados automaticamente.
