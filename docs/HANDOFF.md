# Handoff: agentic-inbox fork, for a local agent

You are taking over a fork of [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox). The goal is a single-user personal webmail for **`midwestfreeks.org`**. It must run on **Cloudflare Workers Free + Resend Free**, with no paid plans.

You have `wrangler` and the owner's browser. Read this whole file before acting.

## 1. Read first

| File | Why |
|---|---|
| `docs/FORK_PLAN_v2.md` | **Source of truth.** Research findings (§A), upstream defects (§B), dependency plan (§C), phases (§D), decisions (§E) and the Phase 0/2 results (§E2, §E3). Where it disagrees with the original v1 plan, v2 wins. |
| `probe/README.md` | Step-by-step run sheet for Phase 1, your first task |
| `test/*.test.ts` | Characterization tests. `it.fails("KNOWN BUG: …")` tests assert *correct* behavior for bugs that later phases fix. When you fix one, vitest reports it as unexpectedly passing; remove the `.fails`. |

## 2. Repo state

- **Repo:** `github.com/freeknet/agentic-inbox`, private. Remotes: `origin` = freeknet, `upstream` = cloudflare.
- **`main`:** untouched upstream `48039bb`.
- **`phase-0-baseline`:** test harness, CI, probe.
- **`phase-2-upgrades`:** stacked on phase-0, CI green. **Work from here.** Holds all dependency upgrades: zod 4, Kumo 2, agents 0.33, ai-chat 0.12, AI SDK 7, React Router 8, Vite 8, postal-mime 4, TS 6. The model is `@cf/zai-org/glm-4.7-flash`.
- **Nothing is merged to `main`.** Don't merge or open PRs unless the owner asks.
- **Done:** Phases 0 and 2.
- **Not started:** Phase 1 (needs the owner's accounts) and Phases 3–8.

**Do not deploy the main app yet.** Upstream routes inbound mail by the first `To:` header. With postal-mime 4 that silently drops mail where the mailbox isn't first. Phase 4 fixes this by routing on the envelope recipient.

## 3. Local setup

Requires Node ≥ 22.22.

```bash
git clone https://github.com/freeknet/agentic-inbox && cd agentic-inbox
```

```bash
git checkout phase-2-upgrades
```

```bash
npm ci
```

Check that the tree is green:

```bash
npm run typecheck && npm test && npm run build
```

Expected result: 15 passed, 5 expected failures.

## 4. Task 1: run the Phase 1 probe

**Purpose.** It answers questions the docs leave open. The answers decide the ingest design, how attachments are sent, and how Message-IDs are stored. Follow `probe/README.md` exactly; what follows adds detail for an agent.

### 4.1 Steps the owner must approve
Ask before each of these, and show what you'll click or create:
- **Activating R2.** It may ask for a payment method. The owner must enter card details themselves; never type payment info.
- **Signing up for Cloudflare Zero Trust**, if the account doesn't have it. Free tier, under 50 users; it may also ask for a card.
- **Adding DNS records** to the `midwestfreeks.org` zone. Rules:
  - Add **only** the exact records the Resend dashboard shows for the domain.
  - Set them to **DNS only** (grey cloud).
  - **Never** touch the existing apex MX/SPF records, which belong to Cloudflare Email Routing.
  - Leave Resend "Receiving" **off**.
- **Creating Access applications.**
- **Creating API keys or tokens.**

### 4.2 Secrets
- Put every secret in with `npx wrangler secret put NAME -c probe/wrangler.jsonc`, entering the value at the prompt. If the owner prefers, let them paste it.
- **Never** write a secret into a file, a commit, a command line, or chat output.
- Resend key: a **temporary full-access** key, named e.g. `probe-temp`. Delete it after the probe.
- R2 API token: **Object Read only**, scoped to the bucket `agentic-inbox-probe` only.

### 4.3 What to record
Create `docs/probe-results.md` with the raw outputs plus a verdict for each item.

1. **DO CPU on Free.** For `worker-parse` vs `do-parse`, each at 1/5/20 MB, record the HTTP status plus `outcome` and `cpuTime` from `wrangler tail`. Also record `rpc-chain`, `do-base64` and the alarm result.
   - **Verdict:** Design A (full parse in DO) or Design B (headers/text only, lazy attachments). See plan §A2.
   - Also record whether each RPC call gets a fresh budget.
2. **Resend presigned `path` attachment.** Did `probe.txt` arrive, and does the inline pixel render?
   - **Verdict:** `path` works, or use the stream-concatenated base64 fallback (plan §E1).
3. **Scheduled send with a `path` attachment.** Accepted (status code)? Arrived about 3 min later, with the attachment?
4. **Message-ID.** The custom ID sent, the `Message-ID:` in Gmail's "Show original", and `message_id` from `/resend/status`.
   - **Verdict:** preserved or overwritten. The plan assumes overwritten, and stores Resend's `message_id` from the `email.sent` webhook.
5. **Authentication.** SPF, DKIM and DMARC results from Gmail. All must PASS.
6. **Access.** `/private` → 302 to `cloudflareaccess.com`? `/webhooks/resend` → 200 with `accessJwtPresent: false`?

Commit `docs/probe-results.md` and update the "Still unverified" list in plan §F. Commit only those files, by name.

### 4.4 Clean up after the probe
- `npx wrangler delete -c probe/wrangler.jsonc`.
- Empty and delete the `agentic-inbox-probe` bucket.
- Delete the temporary full-access Resend key.
- Delete the probe Access apps, and the `probe.midwestfreeks.org` custom domain if wrangler leaves it.
- **Keep** the verified Resend domain and its DNS records; the app needs them.

## 5. Next: Phase 3 (Resend outbound + outbox + webhooks)

Phase 3 doesn't depend on the probe results. Full scope is plan §D row 3, plus §A3 and §A4. In short:

- **Provider.**
  - Replace `workers/email-sender.ts` and all 5 call sites: `workers/index.ts`, `workers/routes/reply-forward.ts` ×2, `workers/lib/tools.ts` ×2.
  - Use an `EmailProvider` interface with a Resend implementation over plain `fetch`.
  - Send a **`User-Agent` header** (Resend 403s without one) and an `Idempotency-Key` = outbox id.
- **Outbox in MailboxDO.** New migration with an outbox table.
  - The send endpoint writes the row with `send_at = now + 10 s` (undo window) and sets an alarm.
  - The alarm submits the email.
  - Classify errors with the table in plan §A3:
    - 429 `daily_quota_exceeded` / `monthly_quota_exceeded`: pause the outbox until 00:00 UTC.
    - 429 rate limit, 500 and 503: back off and retry.
    - Other 4xx: mark `failed`.
- **Rate limit.** Count **recipients** (To + Cc + Bcc) per **UTC calendar day**, 100 max. This replaces `checkSendRateLimit` and fixes B1. Cap recipients per message at 50.
- **Drafts.** Sending from a draft moves the draft row server-side, in one `transactionSync` (B9).
- **Agent/MCP sends** go through the outbox (B10).
- **Webhook route `POST /webhooks/resend`.**
  - Verify the Svix signature: HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}`, keyed with the base64-decoded secret after removing `whsec_`.
  - The header holds `v1,<b64>` entries; compare in constant time. Allow ±5 min.
  - Dedupe on `svix-id`.
  - **Exempt the path from the Access JWT middleware** in `workers/app.ts` (B3).
- **Store Resend's `message_id`** from `email.sent` for threading (B2).
- **Mirror `suppression.added` / `.removed`** into a table used for a compose-time warning.
- **Remove the `send_email` binding** from `wrangler.jsonc`, then re-run `npm run cf-typegen`.
- **Production Resend key:** sending-only, restricted to the domain via `domain_id`.
- **Tests.** Mock outbound `fetch` to `api.resend.com` and cover:
  - signature verification, both valid and invalid;
  - dedupe;
  - backoff;
  - quota pause;
  - undo before `send_at`;
  - the recipient-based UTC-day limit.

  Use `runDurableObjectAlarm` from `cloudflare:test`.

After that: Phase 4 (inbound pipeline), 5 (attachments + rendering fixes), 6 (features), 7 (agent/UI/MCP auth), 8 (README). Each is specified in plan §D.

## 6. Conventions (owner preferences: follow them)

- **Never `git add .` or `git add -A`.** Stage only the files you changed, by name.
- **Start replies with substance.** No "You're right", "I apologize", "Good catch" or similar; state what was wrong and what you're doing.
- **Use Context7** (library docs MCP) for any library, framework or Cloudflare API question, in addition to other tools.
- **One logical change per commit**, with typecheck, tests and build green before each commit. Push the phase branch; branch each new phase from the previous phase's branch (e.g. `phase-3-outbound` from `phase-2-upgrades`).
- **Dependency targets:** the newest release at least 14 days old, pinned exactly when a caret would resolve newer.

## 7. Gotchas already hit

- **npm 10 install crash.** npm 10.9 crashes on installs involving vitest 4 peers (`Cannot read properties of null (reading 'edgesOut')`). Use **`npx -y npm@11 install …`** for installs and upgrades; `npm ci` on npm 10 works fine with the lockfile.
- **Lockfile anchoring.** Peer cycles (agents ↔ ai-chat, react-router ↔ vite) cause ERESOLVE on incremental upgrades. Fix: set the versions in `package.json`, delete those packages' entries from `package-lock.json`, then install.
- **Local dev needs a token.** `npm run dev` needs `CLOUDFLARE_API_TOKEN` because `send_email` and `ai` are remote bindings.
  - For a UI-only smoke test, use a throwaway vite config with `cloudflare({ viteEnvironment: { name: "ssr" }, remoteBindings: false })`. Don't commit it.
  - The first load may 504 with "Outdated Optimize Dep"; reload.
- **Test noise.** Tests log "Binding AI needs to be run remotely" from Miniflare's remote-proxy stub. App code catches it, so it's harmless. A mock AI binding is planned for Phase 7.
- **Test storage resets.** Test storage is wiped after every test (`test/setup.ts`). Tests use `test/worker-entry.ts`, not `workers/app.ts`, which needs the React Router virtual module and Access.
- **Bundle size.** The Worker bundle is 1.88 MB gzip against the 3 MB Free limit. Check `npx wrangler deploy --dry-run` when adding dependencies.
- **Recipient order.** postal-mime 4 returns recipients in document order (2.x reversed them).

## 8. Free-tier limits to design against

| Limit | Value |
|---|---|
| Worker CPU | 10 ms per invocation |
| DO CPU | unknown, measured by the probe |
| Subrequests per invocation | 50 external + 1,000 to Cloudflare services |
| DO storage | 1 GB per object, 5 GB per account |
| DO quotas | 100k rows written per day |
| DO SQL | 100 bound params per query; LIKE patterns ≤ 50 bytes |
| Resend | 100 recipients/day, 3,000/month; 10 requests/s; 1 webhook endpoint; 40 MB per email after base64 |
| Workers AI | 10,000 Neurons/day |
| Inbound mail | 25 MiB |

Sources for each are linked in plan §A.
