# Agentic Inbox Fork Plan, v2: research revisions

This document revises v1 of the plan (the "Resend Outbound, Free-Tier Fit, Attachments, Upgrades" audit of upstream commit `48039bb`). Read v1 for the overall design. This document records:

- what research on 2026-11-18 changed, confirmed or added;
- the new phase order;
- the decisions to make before implementation starts.

Where this document and v1 disagree, **this document wins**.

Every claim below carries a source URL or a `file:line` in upstream `48039bb`.

---

## A. Findings that change the design

### A1. The upstream AI agent is broken today
- `workers/agent/index.ts:284,466` call `@cf/moonshotai/kimi-k2.5`.
- On 2026-05-30 that model began aliasing to `kimi-k2.6`, which "requires a paid billing method". On Workers Free the agent fails as shipped. Sources: [Workers AI changelog](https://developers.cloudflare.com/workers-ai/changelog/), [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
- **Change:** default to `@cf/zai-org/glm-4.7-flash`. It has a 131k context window and tool calling, and costs 5,500 / 36,400 Neurons per M input / output tokens. Cloudflare suggests it as the migration target.
- Offer these alternates in the model setting (Neurons per M input / output tokens):

  | Model | Input | Output |
  |---|---|---|
  | `@cf/qwen/qwen3-30b-a3b-fp8` | 4,625 | 30,475 |
  | `@cf/google/gemma-4-26b-a4b-it` | 9,091 | 27,273 |
  | `@cf/ibm-granite/granite-4.0-h-micro` | 1,542 | 10,158 |

- **New budget:** about 5k input + 500 output tokens per draft is about 46 Neurons, versus about 410 on kimi-k2.5.
  - v1 missed that every inbound email also runs `isPromptInjection` (`workers/lib/ai.ts:33`, llama-3.1-8b-fast). A second check runs on the thread context (`agent/index.ts:349,396`).
  - Sending through the agent adds `verifyDraft` (`ai.ts:139`, llama-4-scout).
  - The Neuron meter must count all of these calls.
- The auto-draft tool set (`agent/index.ts:112-259`) has **no send tools**: only the MCP server can send. Keep it that way.

### A2. Durable Object CPU on Free is undocumented, so a spike decides the ingest design
- The DO limits table says "30 seconds (default)" CPU per request, with no plan split.
- The FAQ on the same page says DOs "have the same per invocation CPU limits as any Workers do". On Free, Workers get 10 ms.
- Sources: [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- Each HTTP request, WebSocket message or alarm resets the budget. Each RPC call is billed as its own request, so it almost certainly resets the budget too, but no page says so explicitly.
- **Change:** Phase 1 (new) measures this before any ingest code is written. The result picks the design:
  - **Design A (DO has a real budget).** This is v1 §3.3 unchanged: the `email()` handler streams the raw message to R2, and `MailboxDO.ingest` parses it fully.
  - **Design B (DO also gets about 10 ms).** Ingest parses only headers and the first text/html part, with postal-mime 4's `maxPartCount` and size limits. Attachments are listed from the MIME structure but not decoded. Each attachment is extracted on its first download: one request per attachment, so each gets a fresh budget. The result is cached into `blobs/{sha}`. FTS indexing of large bodies is chunked across alarms.

### A3. Resend: recipient quota, Message-ID and attachment `path`
**Quota.** Each To, Cc and Bcc address counts as one email against 100/day and 3,000/month. The day is a UTC calendar day, not a rolling 24 h. Source: [quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits.md).
- The outbox rate limit counts **recipients** per UTC day.
- It also reads the `x-resend-daily-quota` response header (sent to Free accounts) to stay in sync.
- Resend also counts emails received *through Resend*. Inbound mail here arrives via Cloudflare Email Routing, so that doesn't apply.

**Message-ID.** Resend doesn't document whether a custom Message-ID is kept. It has sent through SES, and SES documents overwriting it ([SES header fields](https://docs.aws.amazon.com/ses/latest/dg/header-fields.html)).
- Since 2026-07-08, the real `message_id` is in `GET /emails/:id` and in every webhook from `email.sent` onward ([changelog](https://resend.com/changelog/message-id-for-sent-emails.md)).
- **Change:** store the Message-ID that Resend reports, not the generated one. **Webhooks therefore move into the outbound phase** (v1 had them in Phase 4).
- Until `email.sent` arrives, threading uses the generated ID plus the existing subject fallback.

**Attachments via `path`.** Resend doesn't document how it fetches `path` URLs: when, with what timeout, whether signed query strings work, or how long the URL must stay valid ([attachments](https://resend.com/docs/dashboard/emails/attachments.md)). An old blog post also says scheduled emails can't carry attachments.
- **Change:** Phase 1 tests a presigned R2 URL as `path`.
- Expiry: 1 h for immediate sends. Never use `path` together with `scheduled_at`.
- **Fallback:** base64-encode `content` inside the DO alarm. This works only under Design A.

**Other request-level rules.** Sources: [errors](https://resend.com/docs/api-reference/errors.md), [rate limit](https://resend.com/docs/api-reference/rate-limit.md).
- Send a `User-Agent` header. Without one, plain `fetch` can get "403 error code 1010" ([custom headers](https://resend.com/docs/dashboard/emails/custom-headers.md)).
- The API allows 10 requests/s per team, with no burst allowance.

**Error classification, replacing v1 §4.1:**

| Response | Action |
|---|---|
| 429 `rate_limit_exceeded` | Retry after `retry-after` |
| 429 `daily_quota_exceeded` / `monthly_quota_exceeded` | Pause the outbox until 00:00 UTC (or month reset); Resend does not queue the email |
| 500 / 503 (`application_error`, `service_unavailable`, `dns_lookup_failed`) | Retry with backoff |
| 409 `concurrent_idempotent_requests` | Retry later |
| 409 `invalid_idempotent_request` | Bug; mark `failed` |
| Every other 4xx | Mark `failed`, no retry |

**Recipient cap.** `to` is capped at 50. No combined cap across To, Cc and Bcc is documented, so cap the total at 50 in the compose UI.

### A4. Webhooks and suppression (replaces v1 §4.3)
**Events:** `email.sent` (carries `message_id`), `email.delivered`, `email.delivery_delayed`, `email.bounced` (`data.bounce.type` is Permanent, Transient or Undetermined), `email.complained`, `email.failed` (`data.failed.reason`), `email.suppressed`, `suppression.added`, `suppression.removed`. Source: [event types](https://resend.com/docs/webhooks/event-types.md).

**Verification** (Svix scheme, [Svix manual verification](https://docs.svix.com/receiving/verifying-payloads/how-manual)):
1. Compute HMAC-SHA256 over `` `${svix-id}.${svix-timestamp}.${rawBody} `` using the base64-decoded secret, with the `whsec_` prefix removed.
2. The signature header is a space-separated list of `v1,<b64>` entries. Compare in constant time.
3. Allow a ±5 min timestamp tolerance. That is the standard-webhooks library default; Resend doesn't document a value.
4. Deduplicate on `svix-id`, because retries reuse it. Resend retries over roughly 27 h ([retries](https://resend.com/docs/webhooks/retries-and-replays.md)).

**Suppression.** Resend suppresses hard bounces and complaints automatically, team-wide ([suppressions](https://resend.com/docs/dashboard/emails/email-suppressions.md)).
- **Change:** don't build a separate suppression engine. Mirror Resend's list into the `suppressed_recipients` table from `suppression.added` / `suppression.removed` events, and use it only for the compose-time warning.
- Gmail never sends complaint events.

**API key.** Use a sending-only key restricted with `domain_id` ([create API key](https://resend.com/docs/api-reference/api-keys/create-api-key.md)). It can't call `GET /emails/:id` or `/cancel`. That is acceptable because `message_id` arrives via the webhook, and undo-send stays a local queue.

**Access bypass is confirmed.** A self-hosted Access app on exactly `mail.<domain>/webhooks/resend` with a Bypass / Everyone policy takes precedence over the app on the whole hostname, and inherits nothing from it ([app paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)). Rules for that app:
- Use the exact path, without `/*`.
- Bypassed requests aren't logged.
- **Also exempt the path in code.** The Hono JWT middleware runs on `*` (`workers/app.ts:46`), so the request would get a 403 even with the Access bypass in place.

**Undo send and scheduled send.**
- Undo send stays a local DO-alarm queue. Resend's minimum lead time for `scheduled_at` is undocumented.
- "Send later" for times beyond 1 h may use Resend `scheduled_at` (up to 30 days, `POST /emails/:id/cancel` to cancel), but only for messages without `path` attachments.

### A5. R2 and uploads
- **Streaming to R2 needs a known length.** `R2Bucket.put` takes a stream only if its length is known. Source: [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
  - Inbound: `message.raw` must go through `new FixedLengthStream(message.rawSize)`, as v1 says. This is confirmed.
  - Upload route: the request must carry `Content-Length`. Browser `fetch(url, { method: "PUT", body: file })` sets it. Reject chunked uploads with 411.
- **Request body limit.** The 100 MB limit comes from the **zone's** Cloudflare plan, not the Workers plan ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)).
- **Presigned URLs are confirmed:**
  - `aws4fetch` with `signQuery`;
  - expiry from 1 s to 7 days;
  - S3 endpoint only;
  - the token can be scoped to one bucket with "Object Read" ([presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [tokens](https://developers.cloudflare.com/r2/api/tokens/)).
- **Prerequisite:** "You must purchase R2 before you can generate an API token." In practice this means adding a payment method, even inside the free tier.
- **Lifecycle rules are confirmed.** Expiry by prefix: `wrangler r2 bucket lifecycle add <bucket> <name> <prefix> --expire-days N`. Deletes are free operations ([object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)).

### A6. DO SQLite limits v1 didn't account for
Source: [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) and [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

| Limit | Value | Consequence |
|---|---|---|
| Storage per object | **1 GB on Free** (10 GB is the Paid figure) | Confirmed. Add a size meter to Settings. Writes fail with `SQLITE_FULL`; reads and deletes still work. |
| Bound parameters per query | 100 | Batch multi-row inserts (attachments, FTS backfill) ≤ 100 params per statement. Drizzle's `insert().values([...])` can exceed this for messages with many attachments. |
| LIKE / GLOB pattern | **50 bytes** | Upstream search `LIKE '%q%'` (`durableObject/index.ts:679`) fails for queries over 48 bytes. FTS5 removes this. Until then, cap query length. |
| SQL statement | 100 KB | — |
| Free daily quotas | 5M rows read, **100k rows written** | FTS5 writes count as rows written. Fine for personal volume. Batch the backfill across days if importing a large mbox. |
| Free daily quotas | 100k requests, 13,000 GB-s duration | — |

**Subrequests on Free:** 50 external `fetch()` calls plus **1,000 calls to Cloudflare services** (R2, KV, D1) per invocation ([changelog 2026-02-11](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/)).
- R2 PUTs during ingest fall under the 1,000 limit, so the v1 §3.3 step 4 concern (60 attachments) is resolved.
- At most 6 connections can wait on response headers at once, so run R2 writes in parallel with a concurrency limit of ≤ 6.
- Resend calls are external and count against the 50. Webhook handling and the outbox alarm make only 1–2 each.

### A7. Email handler details
Source: [email handler](https://developers.cloudflare.com/email-service/api/route-emails/email-handler/).
- **Docs moved.** The Email Routing docs now live under `/email-service/`. Update v1 links on implementation.
- **`ForwardableEmailMessage` fields are confirmed:** `from`, `to` (envelope), `headers`, `raw`, `rawSize`, `canBeForwarded`, `setReject`, `forward(rcptTo, headers?)` and `reply()`.
  - `forward()` can add only `X-` headers, and only to verified destinations.
  - Free allows 200 destination addresses.
- **`reply()` is not usable for auto-reply.** It requires the incoming mail to pass DMARC, it allows one call per event, and it throws if the incoming mail has no Message-ID. Send auto-replies through the Resend outbox, as v1 already planned.
- **CPU:** the `email()` handler on Free is 10 ms. `EXCEEDED_CPU` is documented ([Email Service limits](https://developers.cloudflare.com/email-service/platform/limits/)).
- **The binding still can't reach outside recipients on Free.** The `send_email` binding returns `E_RECIPIENT_PLAN_RESTRICTED` for unverified recipients ([pricing](https://developers.cloudflare.com/email-service/platform/pricing/)), which confirms that Resend is required.
- **Type the handler properly.** Upstream types the handler parameter as `{ raw, rawSize }` (`workers/app.ts:114`). Use `ForwardableEmailMessage` from generated types.

---

## B. Upstream code defects v1 missed

| # | Defect | Where | Fix (phase) |
|---|---|---|---|
| B1 | **The send rate limit miscounts.** `date` is stored as ISO (`2026-11-18T20:00:00.000Z`) but compared with `datetime('now','-1 hour')` (`2026-11-18 19:00:00`). `T` (0x54) sorts after space (0x20), so every send since UTC midnight counts as "last hour", and the daily window starts at the beginning of yesterday. | `durableObject/index.ts:793-818` | Replaced by the outbox recipient counter. Compare with `strftime('%Y-%m-%dT%H:%M:%fZ', …)` or epoch integers (P3) |
| B2 | **The Message-ID is generated and stored but never sent.** `sendEmail` gets no `Message-ID` header, so recipients' replies reference the provider's ID and threading falls back to subject matching. | `index.ts:181,205`, `reply-forward.ts:48,91`, `tools.ts:437,502` | Store the provider's `message_id` from the webhook (P3) |
| B3 | **Access middleware runs on `*`.** A webhook can't get through even with an Access bypass. | `workers/app.ts:46` | Allowlist `/webhooks/resend` before the JWT check (P3) |
| B4 | **JWKS is rebuilt per request** (v1 had this). | `workers/app.ts:69` | Module-scope cache (P4) |
| B5 | **MCP is unusable from MCP clients behind Access.** Claude Code and others can't do the Access browser login. | `workers/app.ts:85-91` | Document an Access **service token** policy for `/mcp`, and validate service-token JWTs (`common_name` claim) (P7) |
| B6 | **Email links can navigate the app tab** (`allow-top-navigation-by-user-activation`), a phishing vector. | `EmailIframe.tsx:147` | Remove it. Use `allow-popups allow-popups-to-escape-sandbox` plus the confirm interstitial from v1 §7 (P5) |
| B7 | **The iframe CSP has `script-src 'unsafe-inline'`.** Any inline script that survives DOMPurify runs. | `EmailIframe.tsx:94` | Replace with `'sha256-…'` of the height-reporting script only (P5) |
| B8 | **`FORBID_TAGS: ["style"]` strips all `<style>`**, which breaks most HTML newsletters. | `EmailIframe.tsx:64` | Allow `<style>`. The CSP (`default-src 'none'`, `img-src data:`) already blocks CSS `url()` exfiltration. Keep `font-src` unset (P5) |
| B9 | **Deleting a draft after send is a separate client call.** A failure leaves a duplicate draft. | `useComposeForm.ts:258` | Send-from-draft moves the draft row into the outbox server-side in one `transactionSync` (P3) |
| B10 | **Agent and MCP sends are synchronous and bypass Sent-on-failure semantics.** | `tools.ts:437,502` | Route through the outbox (P3) |
| B11 | **Foreign-key enforcement (`ON DELETE CASCADE`) is undocumented for DO SQLite.** If it's off, deleting emails orphans attachment rows. | `db/schema.ts:17,38` | Phase 0 test asserts the cascade. If FKs are off, delete explicitly (P0) |
| B12 | **`.parse()` failures become 500s.** | `index.ts:103,170,216` | `safeParse` → 400 with `z.treeifyError` (P2) |
| B13 | **Settings `PUT` stores any JSON** (v1 had this). | `index.ts:128-131` | Zod schema (P4) |
| B14 | **Inbound replies never join the root's thread.** The root gets `thread_id` = internal UUID, while a reply gets `thread_id` = the root's Message-ID string (`references[0] \|\| inReplyTo`). | `index.ts:386` | Resolve `thread_id` by looking up `message_id` of `In-Reply-To`/`References` in the DB, then fall back (P4). Covered by a `KNOWN BUG` test. |
| B15 | **The subject-threading fallback can't attach to a single-message thread.** It filters `thread_id != id`, and its 7-day window has the same ISO-vs-`datetime()` comparison bug as B1. | `durableObject/index.ts:756-760` | Fix with B14 (P4) |

---

## C. Dependency plan (replaces v1 §5)

Targets are the newest releases published ≥ 14 days before 2026-11-18. The Node floor is 22.22, because React Router 8 needs it; add `"engines"` to `package.json`.

**Changes from v1:**
- **`workers-ai-provider` is deprecated.** Replace it with `createAI` from `agents/models/ai-sdk`.
- **`@cloudflare/vitest-pool-workers` is deprecated.** It was renamed to `@cloudflare/vitest-plugin` (1.5.1, with vitest 4.1.12). Use a separate `vitest.config.ts` with a test entry. Don't reuse `vite.config.ts`, because `virtual:react-router/server-build` won't resolve there.
- **`agents@0.33.0` requires `zod@^4`**, so they move together.
- **Two imported packages are undeclared** and must be added:
  - `@modelcontextprotocol/sdk` (imported at `workers/mcp/index.ts:6`), pinned to exactly 1.32.2 to match `agents`;
  - `@ai-sdk/react`.
- **`@cloudflare/ai-chat` ≥ 0.12 migrates chat storage one way.** Old chat history migrates on first wake, and a downgrade leaves the DO with an empty history.
- **React Router 8:**
  - `AppLoadContext` is removed (`workers/app.ts:17-24,104-107`, `app/entry.server.tsx:5,15`); pass a `RouterContextProvider`;
  - remove `future.v8_viteEnvironmentApi` (`react-router.config.ts:9-11`).
- **TypeScript:** target **6.0.3**, not 7.0.2. TS 7 has no compiler API until 7.1. Both versions require removing `baseUrl` (`tsconfig.cloudflare.json:21`).
- **Types:** drop `@cloudflare/workers-types` and the `/experimental` types entry. Use `wrangler types` output only. This also gives the real `Env` to `AIChatAgent<Env>` in place of `any`.
- **`@cloudflare/vite-plugin`:** stay on 1.x (1.67.0). 2.0 replaces wrangler config with `cloudflare.config.ts`.
- **Local email test endpoint** is now `/cdn-cgi/local/email`.
- **Kumo:** use 2.17.0, and remove the `"@cloudflare/kumo": {"zod": "$zod"}` override after zod 4.
  - Dark theme: override the `--color-kumo-*` variables under `[data-theme="inbox"]` and `[data-mode="dark"]`.
- **Tiptap:** bump all overrides to 3.32.2 in lockstep.

| Package | Target |
|---|---|
| agents | 0.33.0 |
| @cloudflare/ai-chat | 0.12.2 |
| @modelcontextprotocol/sdk | 1.32.2 (exact) |
| ai | 7.0.162 |
| @ai-sdk/react | 4.0.166 |
| zod | 4.6.7 |
| postal-mime | 4.2.0 |
| react-router, @react-router/dev | 8.5.1 |
| vite | 8.3.5 |
| @cloudflare/vite-plugin | 1.67.0 |
| wrangler | 4.157.0 |
| @cloudflare/kumo | 2.17.0 |
| typescript | 6.0.3 |
| hono | 4.13.16 |
| jose | 6.2.15 |
| dompurify | 3.4.17 |
| drizzle-orm | 0.45.4 |
| react, react-dom | 19.3.1 |
| tailwindcss, @tailwindcss/vite | 4.3.4 |
| @types/node | ^22.20.5 |
| aws4fetch | 1.0.20 |
| vitest | 4.1.12 |
| @cloudflare/vitest-plugin | 1.5.1 |
| @types/dompurify | remove (dompurify ships its own types) |

**Breaking changes in this codebase, by package:**
- **zod 4:** `z.record(z.any())` → `z.record(z.string(), z.any())` (`index.ts:31`) is a type error until fixed. `.email()` and `{ message }` are deprecated but still work.
- **ai 7:** `stepCountIs`→`isStepCount`, `system`→`instructions`, `onFinish`→`onEnd`, `toUIMessageStreamResponse()`→`createUIMessageStreamResponse({ stream: toUIMessageStream(...) })`. The old names remain as aliases.
- **postal-mime 3/4:**
  - `to`/`cc`/`bcc` now come back in document order (previously reversed);
  - a duplicated `Subject` or `From` header resolves to the first occurrence;
  - header values keep folding whitespace;
  - `parse()` accepts a `ReadableStream`;
  - limits are available: `maxPartCount`, `maxHeadersSize`, `maxNestingDepth`.
- **ai-chat client:** replace `setMessages([])` with `clearHistory()` (`AgentPanel.tsx:366`), because setMessages now syncs to the server.

---

## D. Revised phases (replaces v1 §8)

The upgrades move **before** feature work. The codebase is about 10k LOC; the agent is already broken (A1); the test harness needs current wrangler; and React Router 8 and AI SDK 7 touch files the feature phases rewrite. Upgrading first avoids doing that work twice.

| Phase | Scope | Exit test | Needs from you |
|---|---|---|---|
| **0. Repo + baseline** | Private repo `freeknet/agentic-inbox` with upstream history. Housekeeping: declare the missing deps, `wrangler types`, wrangler 4.157 + vite-plugin 1.67, remove `baseUrl`, bump `compatibility_date`. Add vitest-plugin and characterization tests: email ingest, CRUD, threading, the FK cascade (B11), and the rate-limit bug (B1, a failing test marked `todo`). Add GitHub Actions for typecheck, test and `wrangler deploy --dry-run`. | CI green | Create the empty private repo |
| **1. Free-tier probe** | A throwaway Worker on your account, in `probe/`, not shipped. It measures: **(a)** DO CPU on Free, by RPC-parsing a 20 MB / 10-attachment `.eml` in a DO and reading `exceededCpu` / `cpuTime` from `wrangler tail`; **(b)** Resend with a presigned R2 `path` attachment and a custom `Message-ID`, sent to Gmail (is it kept? does the attachment arrive?); **(c)** the path-scoped Access bypass; **(d)** whether the RPC budget resets. | Written results in `docs/probe-results.md`. Decides Design A/B (A2), `path` vs base64 (A3), and the Message-ID strategy. | Cloudflare account + domain on Email Routing, R2 activated, a Resend account with the domain verified, an Access team |
| **2. Dependency upgrades** | §C order: zod → kumo → agents + ai-chat + MCP SDK → ai 7 + `createAI` + glm-4.7-flash → vite 8 + RR 8 → postal-mime 4 → TS 6. One commit per step, with tests green after each. | Typecheck, tests and a manual smoke test (`wrangler dev`) after each step. The agent drafts a reply locally. | — |
| **3. Resend outbound + webhooks** | Provider interface; Resend over `fetch` with `User-Agent` and `Idempotency-Key`; the A3 error table; outbox + alarm + backoff + quota pause; undo send; recipient-based UTC-day rate limit (fixes B1); server-side draft→outbox (B9); agent/MCP through the outbox (B10); `/webhooks/resend` with Svix verification, `svix-id` dedupe, code exemption (B3); `message_id` capture (B2); state badges; suppression mirror; remove the `send_email` binding. | Send, reply and forward to Gmail and Outlook: `dkim=pass`, `dmarc=pass`. A Gmail reply threads to the stored `message_id`. A bounce to a nonexistent address shows "Bounced". | Resend sending key + webhook secret |
| **4. Inbound pipeline** | Envelope routing + `setReject`; raw `.eml` → R2 via `FixedLengthStream`; ingest Design A or B; `Date:` header; `body_text` + text snippet; atomic drafts; settings zod schema (B13); JWKS cache (B4); mailbox purge. | A 20 MB / 10-attachment message ingests on Free with no `EXCEEDED_CPU`. Cc and Bcc mail lands. A message to an unknown address is rejected. | — |
| **5. Attachments + rendering** | v1 §3, plus: `Content-Length`-required upload (411 otherwise); `path` or base64 per the Phase 1 result; ≤ 100-param batching; R2 writes with concurrency ≤ 6; iframe fixes B6, B7, B8; `data:` inline images; remote-image blocking. | v1 Phase 3 tests, plus: a newsletter renders with its styles; a link can't navigate the app tab | — |
| **6. Features** | v1 §6 table. Auto-reply goes via the outbox, not `message.reply()` (A7). FTS5 replaces LIKE (A6). | v1 Phase 6 | — |
| **7. Agent + UI + MCP** | Opt-in auto-draft; model setting (A1); Neuron meter counting every AI call; `/mcp` service-token auth (B5); dark theme via Kumo 2 tokens; mobile layout. | 24 h soak on Free with no Workers AI errors | — |
| **8. Docs** | README: setup, DNS (add the exact records Resend shows; post-Aug-2026 domains may get CNAMEs, which must be DNS-only / grey cloud), Access apps, R2 activation note, limits table, troubleshooting. | Fresh deploy on a clean account following only the README | — |

---

## E. Decisions (resolved 2026-11-18)

1. **Phase order:** as in §D (upgrades before features). The owner has no preference.
2. **Resend key:** sending-only, restricted to the domain with `domain_id`. `message_id` comes from the webhook.
3. **Default AI model:** `@cf/zai-org/glm-4.7-flash`. Auto-draft defaults to off.
4. **Domain:** `midwestfreeks.org`, already on the owner's Cloudflare account.
   - Email Routing MX stays on the apex.
   - Resend's sending records go on its Return-Path subdomain (default `send.`), exactly as Resend shows them. CNAMEs must be DNS-only (grey cloud).
   - Resend "Receiving" stays off.
5. **Repo:** `freeknet/agentic-inbox` is private. `upstream` remote = `cloudflare/agentic-inbox`.

### E1. Free-plan prerequisites and fallbacks (no paid plan required)
**Prerequisites**
- R2 must be activated, which usually means adding a payment method; usage stays $0 within the free tier. This is needed for the bucket and for the R2 API token used for presigning.
- Cloudflare Zero Trust (Access) is free for under 50 users. Signup may ask for a payment method; that wasn't confirmed.

**If the DO CPU budget on Free turns out to be about 10 ms (Phase 1 result)**
- **Inbound:** use Design B (A2). Optionally parse the raw `.eml` client-side in the browser for rendering; postal-mime runs in browsers.
- **Outbound attachments without presigned `path`:** the browser base64-encodes each file at upload and stores it as `uploads/…b64`. The Worker builds the Resend JSON request body as a concatenation of R2 streams through a `FixedLengthStream` with a precomputed length. That is I/O, not CPU, so no base64 work or `JSON.stringify` runs on a large string server-side.

### E2. Phase 0 results
- **B11 resolved:** DO SQLite enforces foreign keys, and `ON DELETE CASCADE` removes attachment rows (`test/storage.test.ts`).
- **Worker bundle:** 1.05 MB gzip, against the Free plan's 3 MB compressed limit.
- **npm:** npm 10.9's arborist crashes resolving vitest 4's optional peers (`Cannot read properties of null (reading 'edgesOut')`). The lockfile was produced with npm 11. `npm ci` on npm 10 (CI on Node 22) works with it.

### E3. Phase 2 results
**Done on branch `phase-2-upgrades`; CI green.** Deviations from §C:
- **Steps 3 and 4 had to merge.** `agents@0.33`'s optional peer `@ai-sdk/provider@^4` conflicts with AI SDK 6's provider 3.x, so agents/ai-chat/MCP SDK and AI SDK 7 moved together.
- **Extra direct dependencies.** The bundle needs these declared, because they aren't hoisted otherwise:
  - `@ai-sdk/provider` 4.0.35;
  - `@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.4.0, imported by `agents/mcp`.
- **Lockfile anchoring.** Peer cycles (agents ↔ ai-chat, react-router ↔ vite) block incremental installs. Bumps were done by setting `package.json` and dropping the stale lockfile entries.
- **Worker bundle grew** from 1.05 MB to **1.88 MB gzip** (agents 0.33 + MCP v2 + AI SDK 7). The Free limit is 3 MB; watch it in later phases.
- **Recipient order changed.** postal-mime ≥ 3 returns recipients in document order. Upstream routing by first `To:` now drops `To: other, me`. This is captured as a KNOWN BUG test; Phase 4 fixes it.
- **Local dev needs a token.** `npm run dev` needs `CLOUDFLARE_API_TOKEN` because `send_email`/AI are remote bindings. Phase 3 removes `send_email`.
- **Test noise.** Tests log "Binding AI needs to be run remotely" from inside Miniflare's remote-proxy stub. App code catches it, and tests pass. A mock AI binding comes with Phase 7.
- **Deprecated but working, left for Phase 7:**
  - Kumo `Tooltip asChild` and `Banner text=`;
  - MCP `server.tool` → `registerTool`;
  - `McpAgent` → `createMcpHandler`.

## F. Verification status after the Phase 1 probe

Full results: `docs/probe-results.md` (2026-11-18).

**Resolved by the probe**
- **DO CPU on Free:** a DO request has a real budget (20 MB parse at 550–750 ms CPU, 10 of 10 ok; 25 MB base64 at 1.5 s ok). The stateless Worker is killed under sustained load (`exceededCpu`). **Design A.** Each RPC call is metered separately.
- **Custom `Message-ID`:** discarded. Recipients see Resend's `…@email.amazonses.com` ID, and it equals `message_id` from `GET /emails/:id`. Store Resend's ID (plan §A3 unchanged).
- **Presigned R2 URL as `path`:** works for immediate sends, including inline `content_id` images. A 1 h expiry was enough.
- **SPF/DKIM/DMARC** with the four Resend records: all pass at Gmail.
- **Access path bypass:** works. It also covers sub-paths of the bypassed path.
- **`scheduled_at` with `path` attachments:** works (delivered on time with both attachments). This supersedes §A3's "never use `path` together with `scheduled_at`". If combining them, set the URL expiry to at least `scheduled_at` + 1 h, because the fetch time is unknown. `message_id` stays `null` until the send happens.

**Still unverified**
- Resend `path` fetch timeout and the minimum URL lifetime it needs.
- Whether a cancelled scheduled email still counts toward quota.
- Combined To + Cc + Bcc cap (capped at 50 in the UI until known).
- Whether the observed DO CPU allowance is a stable guarantee (it is not documented). Keep postal-mime limits as a safety net.

**New prerequisite found:** the `midwestfreeks.org` zone has no MX records, so Cloudflare Email Routing must be enabled in Phase 4.
