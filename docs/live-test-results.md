# Live end-to-end test (2026-11-19 UTC)

Deployed from `phase-5-rendering` to `https://mail.midwestfreeks.org` (Workers Free, Worker version `51187f47…`, then secret-update versions). The test used the owner's Gmail as the external correspondent.

## Results

| Test | Result |
|---|---|
| Access on the app | `GET /` → 302 to `wsllc.cloudflareaccess.com`. Policy allows only the owner's email. |
| Access bypass + signature check | `POST /webhooks/resend` with no signature → 401 "Invalid signature". Before the secret existed → 500 "not configured". |
| Compose → outbox → Resend | Queued with a 10 s undo window. The alarm sent it on attempt 1, and the Resend id was stored. |
| Delivery webhooks | `email.sent` / `email.delivered` were verified and applied. The badge shows **Delivered**. |
| Message-ID capture (B2) | `message_id` was replaced with Resend's `<010001a1f1ccedc3-…@email.amazonses.com>`. It is identical to the `Message-ID` Gmail received. |
| Authentication at Gmail | `dkim=pass` (d=midwestfreeks.org, s=resend), `spf=pass` (MAIL FROM `…@rsend.midwestfreeks.org`), `dmarc=pass`. |
| Inbound via Email Routing | A Gmail reply to `lawrence@` arrived. Its `thread_id` equals the sent message's thread (lookup on the stored provider Message-ID, B14). The Date header was used. |
| Inbound CPU (Design A) | The stateless `email()` handler used 3 ms CPU (stream to R2 only). The MailboxDO parse used 10 ms. Outcome `ok`. |
| Undo send | Cancelled within the window → moved to Drafts, and it never reached Gmail. |
| Bounce | A send to `bounced@resend.dev` was accepted, then `email.bounced` arrived → badge **Bounced**. |
| Recipient quota | `send-quota` reported 2 used (the delivered message + the bounce). Failed and cancelled sends were not counted. |
| Non-retryable error handling | The first two sends got `400 validation_error: API key is invalid` and were marked **Failed** with no retry, as designed (see below). |

## Phase 5–7 live tests (2026-11-19 UTC)

| Test | Result |
|---|---|
| Attach two files in compose (upload on pick) | Both PUT uploads succeeded in production, so browsers send `Content-Length`. The message reached Gmail with `notes.txt` and `pixel.png`. |
| Inbound Gmail message with an inline image + attachment | Stored. Gmail labels the inline part `disposition: attachment` with a Content-ID. It renders inline from a `data:` URI. |
| Forward with one of two original files removed | Gmail received only the kept file. |
| Search after deploy | FTS5 migration backfilled existing mail. Body, prefix, `from:` and long queries work. |
| Send later (UI, custom time +2 min) | Banner "Scheduled to send … / Cancel send" shown. Delivered at exactly the scheduled minute. |
| Vacation auto-reply | Gmail got `Re: …` 3 s after sending, threaded, with `Auto-Submitted: auto-replied` and dkim/spf/dmarc pass. A second message within 4 days got no reply. Auto-reply was turned off again afterwards. |
| Agent chat with metered AI binding | Answered with a tool call. The meter recorded 2 glm-4.7-flash calls, about 14 Neurons. |
| Dark mode, 390 px layout | Kumo tokens switch with `data-mode`. Inbox, message, compose and settings fit at 390 px; the compose fields were widened. |

## Setup done for production

- **R2 bucket:** `agentic-inbox`.
- **Access:**
  - App `agentic-inbox` on `mail.midwestfreeks.org` with policy `agentic-inbox-owner-only` (owner email).
  - App `agentic-inbox-resend-webhook` on `mail.midwestfreeks.org/webhooks/resend` with a Bypass policy.
- **Resend:**
  - Sending-only key restricted to midwestfreeks.org (`agentic-inbox-prod-3`).
  - Webhook to `/webhooks/resend` for all events.
  - Both values are stored as Worker secrets `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`.
- **Email Routing:**
  - Enabled, with the records Cloudflare listed: 3 MX, the `cf2024-1._domainkey` TXT, and the apex SPF `v=spf1 include:_spf.mx.cloudflare.net -all`.
  - Rule: `lawrence@midwestfreeks.org` → Worker `agentic-inbox`. Catch-all stays disabled.
  - Outbound SPF is unaffected, because Resend's MAIL FROM is `rsend.midwestfreeks.org`.

## Gotcha: setting secrets from Windows PowerShell

`"value" | npx wrangler secret put NAME` in Windows PowerShell 5.1 sends a trailing CRLF to wrangler, and writing through `Process.StandardInput` can prepend a UTF-8 BOM. Either one corrupts the secret silently: Resend answered `400 validation_error: API key is invalid` and logged nothing.

What works is passing the value through an environment variable to Node and writing it as raw stdin:

```powershell
$env:RK = '<value>'   # e.g. from Get-Clipboard; never on a command line
node -e "require('child_process').spawnSync('npx wrangler secret put RESEND_API_KEY',{input:process.env.RK,encoding:'utf8',shell:true,stdio:['pipe','inherit','inherit']})"
Remove-Item Env:RK
```

The simpler option is to run `npx wrangler secret put NAME` interactively and paste at the prompt.

- **R2 lifecycle rule** `expire-unsent-uploads`: deletes `uploads/` objects after 1 day.

## Forwarding, MCP v2 and cleanup (2026-11-19 UTC)

Deployed versions `89c4dcef` and `2c02f161` (branch `forwarding-and-cleanup`).

| Check | Result |
|---|---|
| `/mcp` `initialize` from a 2025-protocol client | 200, server `agentic-inbox` 1.0.0 |
| `/mcp` `tools/list` | 200, 13 tools |
| `/mcp` `tools/call list_emails` | 200, returned the live inbox |
| `/mcp` from the site's own browser origin | 200 after `8c79fba`; the first deploy returned 403 `Invalid Origin` |
| Tooltip triggers after `asChild` → `render` | Buttons carry `data-base-ui-tooltip-trigger` and keep their icons; the popup itself was not captured (Chrome screenshots of the tab timed out) |
| Forwarding on, destination not verified in Email Routing | Gmail message stored in the Inbox; no bounce in Gmail. Forwarding was turned off afterwards |
| Forwarding to a verified destination | Not tested: the account has no verified Email Routing destination addresses |

## Access changes

- The reusable policy "Lawrence B Norton" used to allow any one-time-PIN login (any email address) plus any service token. On 2026-11-19 it was changed to allow only the owner's email. It is attached to no application.
- The `matrix` app (matrix.midwestfreeks.org) has no policies, so Access denies everyone. The hostname has no DNS record.
