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

## Follow-ups noticed

- The pre-existing reusable Access policy "Lawrence B Norton" allows any one-time-PIN login (any email address) plus any service token. It still protects the `matrix` app. It was not changed here.
