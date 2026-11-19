<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A personal webmail with an AI agent, on Cloudflare Workers Free and Resend Free</em></p>
</div>

This is a fork of [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox) reworked to run with **no paid plans**:

- **Inbound** mail arrives through [Cloudflare Email Routing](https://developers.cloudflare.com/email-service/). The Worker streams the raw message into R2, and the mailbox's Durable Object parses it.
- **Outbound** mail goes through [Resend](https://resend.com), from a queue inside the Durable Object. The queue gives you undo send and send later, retries failures, and stays inside Resend's free quota.
- **Each mailbox** is one Durable Object with its own SQLite database (messages and full-text search). Attachments and raw messages are stored in R2.
- **The app** is behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/), so only you can open it.
- **The AI agent** ([Agents SDK](https://developers.cloudflare.com/agents/) + [Workers AI](https://developers.cloudflare.com/workers-ai/)) can search mail and draft replies. Auto-drafting is off by default, and a meter tracks the free daily Neuron allowance.

`docs/FORK_PLAN_v2.md` has the design and its sources. `docs/live-test-results.md` records the production test.

## Features

- Compose, reply, reply-all and forward, with a rich-text editor and threading by Message-ID.
- Attachments up to 18 MB per message: drag and drop or pick files; forwarding includes the original's files.
- **Undo send** (10 seconds), and **send later** at any time up to a year ahead, cancellable until it goes out.
- Delivery status on sent mail (Queued, Sent, Delivered, Delayed, Bounced, Spam report, Failed), from Resend webhooks.
- A warning before you send to an address on Resend's suppression list.
- **Full-text search** (SQLite FTS5) over subject, people and body, with `from:`, `to:`, `subject:`, `is:unread`, `is:starred`, `has:attachment` and date filters.
- **Vacation auto-reply** with optional start and end times. It never answers mailing lists, automated mail or no-reply senders, and answers each sender at most once every 4 days (RFC 3834).
- **Forwarding**: keep mail here and also forward each incoming message, unchanged, to another address through Email Routing (the address must be a verified Email Routing destination; it costs no Resend quota).
- Signature; folders; a safe HTML viewer (sandboxed frame, remote images blocked until you allow them, inline `cid:` images shown).
- Dark mode (system, light or dark); works on phones.
- An AI agent panel with email tools; optional auto-drafted replies; a choice of model; a daily Neuron meter.
- An MCP server at `/mcp` for Claude Code, Cursor and other MCP clients, authenticated with an Access service token.

## What it costs: free-tier limits

| Resource | Free limit | How the app handles it |
|---|---|---|
| Resend sending | 100 recipients/day (UTC), 3,000/month; To + Cc + Bcc each count | The outbox counts recipients per UTC day, refuses sends over the limit, and pauses until reset if Resend reports its quota is used up |
| Recipients per message | 50 (the app's cap) | The send is refused |
| Inbound message size | 25 MiB | Rejected with SMTP 552 |
| Outgoing attachments | 18 MiB total per message (so the message stays under Gmail's and Outlook's 25 MB after encoding) | The upload or send is refused |
| Worker CPU | 10 ms per request | Inbound mail and uploads are streamed straight into R2; parsing and sending run in the Durable Object |
| Durable Object storage | 1 GB per mailbox | Settings → Usage shows the database size |
| Durable Object writes | 100,000 rows/day | Search indexing only rewrites the index when text changes |
| Workers AI | 10,000 Neurons/day, account-wide | Auto-draft is off by default and stops for the day at 90%; Settings → Usage shows an estimate |
| R2 | 10 GB-month storage | Unsent uploads expire after 1 day (lifecycle rule) |

## Set up your own copy

You need:

- a Cloudflare account with your domain on it;
- a free [Resend](https://resend.com) account;
- Node.js 22.22 or newer.

The steps use `example.com` and `you@example.com`; replace them with your own.

### 1. Clone and install

```bash
git clone https://github.com/freeknet/agentic-inbox && cd agentic-inbox
```

```bash
npm ci
```

```bash
npx wrangler login
```

### 2. Configure `wrangler.jsonc`

Edit these values:

- `vars.DOMAINS`: your domain, e.g. `"example.com"`.
- `vars.EMAIL_ADDRESSES`: the addresses that may have mailboxes, e.g. `["you@example.com"]`. Mail to any other address is rejected.
- `routes`: the hostname for the app, e.g. `{ "pattern": "mail.example.com", "custom_domain": true }`.
- `vars.TEAM_DOMAIN` and `vars.POLICY_AUD`: fill these in at step 6. Neither value is secret.

### 3. Create the R2 bucket

R2 has to be activated once in the dashboard (R2 → Overview). Cloudflare may ask for a payment method even though usage stays free; enter it yourself if asked.

```bash
npx wrangler r2 bucket create agentic-inbox
```

```bash
npx wrangler r2 bucket lifecycle add agentic-inbox expire-unsent-uploads uploads/ --expire-days 1 -y
```

### 4. Set up Resend

1. In Resend → Domains, add your domain. Resend sends from a Return-Path subdomain (by default `send.`), so your root domain's MX and SPF stay with Email Routing.
2. Add **exactly** the DNS records Resend shows, in Cloudflare DNS:
   - set every record to **DNS only** (grey cloud), including any CNAMEs (newer domains may get CNAMEs);
   - don't change any existing record on the root domain;
   - leave Resend "Receiving" off.
3. Wait until Resend shows the domain as verified.
4. Create an API key with **Sending access**, restricted to that domain.
5. Create a webhook pointing at `https://mail.example.com/webhooks/resend` for all events, and copy its signing secret (`whsec_…`).

### 5. Store the secrets and deploy

Paste each value at the prompt:

```bash
npx wrangler secret put RESEND_API_KEY
```

```bash
npx wrangler secret put RESEND_WEBHOOK_SECRET
```

```bash
npm run deploy
```

> **Windows PowerShell:** don't pipe a secret into wrangler (`"…" | npx wrangler secret put`). PowerShell 5.1 adds a line ending, which silently corrupts the secret, and Resend then answers `API key is invalid`. Type or paste at the prompt instead. `docs/live-test-results.md` has a scripted alternative.

### 6. Protect the app with Cloudflare Access

In Zero Trust → Access → Applications (Zero Trust is free for up to 50 users):

1. Add a **self-hosted** app on `mail.example.com` with a policy that allows **only your email address**.
   - Don't reuse a policy whose only rule is "login method: One-time PIN". Anyone can get a PIN for their own address, so that rule admits everyone.
   - Copy the app's **Application Audience (AUD) tag** into `POLICY_AUD`.
   - Set `TEAM_DOMAIN` to `https://<your-team>.cloudflareaccess.com`.
2. Add a second self-hosted app on exactly `mail.example.com/webhooks/resend` (no `/*`) with a **Bypass / Everyone** policy. Resend's webhooks can't log in; the app checks their signature instead.
3. Run `npm run deploy` again.

The Worker refuses every request in production unless `POLICY_AUD` and `TEAM_DOMAIN` are set and the request carries a valid Access token.

### 7. Turn on Email Routing

In the dashboard, open your domain → Email → Email Routing:

1. Enable it, and add the MX and TXT records it lists. On a domain with no mail yet, that is 3 MX records, a DKIM TXT record and an SPF TXT record on the root domain.
2. Under Routing rules, add a **custom address** rule: `you@example.com` → **Send to a Worker** → `agentic-inbox`.
3. Leave the catch-all off. The Worker also rejects addresses that aren't in `EMAIL_ADDRESSES`.

### 8. Create your mailbox and test

1. Open `https://mail.example.com`, sign in through Access, and create a mailbox for `you@example.com`.
2. Send yourself a message from another account, then reply to it from the app.
3. In the other account, "Show original" should report `dkim=pass`, `spf=pass` and `dmarc=pass`.
4. In Sent, the badge should turn **Delivered** within a few seconds.

## Using the MCP server

`/mcp` exposes tools to list, read, search, draft and send mail. MCP clients can't complete the Access browser login, so give them an **Access service token**:

1. Zero Trust → Access → Service Auth → create a service token. Copy the Client ID and Client Secret; the secret is shown once.
2. In the `mail.example.com` Access app, add a policy with action **Service Auth** that includes that token.
3. Optional: set `MCP_SERVICE_TOKEN_IDS` (a comma-separated list of client IDs) in `wrangler.jsonc` vars to pin which tokens may connect.
4. Configure your client to send two headers with every request:

   ```json
   {
     "mcpServers": {
       "inbox": {
         "url": "https://mail.example.com/mcp",
         "headers": {
           "CF-Access-Client-Id": "<client id>",
           "CF-Access-Client-Secret": "<client secret>"
         }
       }
     }
   }
   ```

Service tokens can reach only `/mcp`, not the web app or its REST API. Sends from MCP go through the same outbox and limits as the UI. Anyone who passes your Access policy can use every mailbox in the app, because Access is the only access boundary.

## AI agent and Neurons

- **Model.** The default is `@cf/zai-org/glm-4.7-flash`. Settings offers Qwen3 30B, Gemma 4 26B and Granite 4.0 Micro (the cheapest).
- **Chat panel.** It always works. A short question costs about 10 to 20 Neurons.
- **Auto-draft.** Settings → AI Agent turns it on. Each new email then costs roughly 50 to 150 Neurons:
  - a prompt-injection scan;
  - the draft itself;
  - a cleanup pass over the draft.
- **Daily cap.** Auto-draft stops for the day at 90% of the free 10,000 Neurons.
- **The meter** in Settings → Usage is an estimate from token counts and Cloudflare's published prices. The dashboard's Workers AI page has the authoritative figure.
- **Sending.** Drafts are never sent automatically. The agent has no send tool; only you, or an MCP client, can send.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Invalid or expired Access token` | `POLICY_AUD` or `TEAM_DOMAIN` doesn't match the Access app. Copy them again and redeploy. |
| `Cloudflare Access must be configured in production` | `POLICY_AUD` / `TEAM_DOMAIN` are not set. |
| Sends show **Failed** with `API key is invalid` | The secret was stored with extra characters; see the PowerShell note in step 5. Store it again with `wrangler secret put` and paste at the prompt. |
| Sends show **Failed** with `not_configured` | `RESEND_API_KEY` isn't set. |
| Delivery badges stay on **Sent** | The webhook isn't arriving. Check the bypass Access app's path (exactly `/webhooks/resend`) and `RESEND_WEBHOOK_SECRET`. Resend → Webhooks shows each attempt and its response. |
| `Daily send limit reached` | 100 recipients per UTC day; it resets at 00:00 UTC. |
| Mail to you never arrives | Check the Email Routing rule points at the Worker and that the address is in `EMAIL_ADDRESSES`. Email Routing → Activity log shows rejections (`550` = unknown address, `552` = over 25 MiB). |
| Attachment upload fails with 411 | The request had no `Content-Length`. Browsers set it; a custom client must too. |
| AI calls fail | The daily 10,000 Neurons are used up (they reset at 00:00 UTC), or the model isn't available on your account. |

## Development

```bash
npm run dev
```

```bash
npm run typecheck && npm test && npm run build
```

- **Local dev.** `npm run dev` uses remote bindings for Workers AI, so it needs `CLOUDFLARE_API_TOKEN`.
- **Tests** run in the Workers runtime (`@cloudflare/vitest-plugin`, entry `test/worker-entry.ts`). Resend is mocked by stubbing `fetch`.
- **Bundle size.** Keep the Worker under the Free plan's 3 MB compressed limit; `npx wrangler deploy --dry-run` reports the size.

## Architecture

```
            Email Routing                        Resend API
                 │ email()                           ▲  │ webhooks (Svix-signed)
                 ▼                                   │  ▼
┌──────────┐  ┌───────────────────────────┐   ┌──────┴───────────────────────┐
│ Browser  │─▶│ Worker (Hono + React SSR) │──▶│ MailboxDO (one per mailbox)  │
│ React    │  │ • Access JWT check        │   │ • SQLite: mail, FTS5, outbox │
│ SPA      │  │ • streams raw mail and    │   │ • parses inbound (postal-mime)│
└────┬─────┘  │   uploads into R2         │   │ • alarm sends from outbox    │
     │ WS     │ • /mcp (stateless MCP)    │   │ • auto-reply, AI usage meter │
     └───────▶│ • /agents/* ──────────────┼─▶ │                              │
              └───────────┬───────────────┘   └──────────────────────────────┘
                          ▼                    EmailAgent DO (chat, auto-draft)
                    R2: raw/, attachments/,     Workers AI (metered)
                    uploads/, mailboxes/
```

## License

Apache 2.0. See [LICENSE](LICENSE).
