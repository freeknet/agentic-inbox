# Phase 1 probe results (2026-11-18)

Run against the owner's Cloudflare account (Workers **Free**, confirmed on the Workers plans page) and a Resend Free account, using `probe/` deployed at `probe.midwestfreeks.org`. Raw numbers come from `wrangler tail --format json` (`outcome`, `cpuTime` in ms).

## Verdicts

| # | Question | Verdict |
|---|---|---|
| 1 | DO CPU budget on Free | **Design A.** A DO request has a real budget well beyond 10 ms; the stateless Worker does not. |
| 1b | Fresh budget per RPC call | **Yes.** Each RPC call is a separate tail event with its own `cpuTime`. |
| 2 | Resend presigned R2 `path` attachment | **`path` works.** Both attachments arrived, including the inline `cid:` image. |
| 3 | Scheduled send with `path` attachment | **Works.** 200 on submit, delivered at the scheduled time with both attachments. The old "no attachments on scheduled emails" note is outdated. |
| 4 | Custom `Message-ID` | **Overwritten.** Store Resend's `message_id` (from `email.sent` / `GET /emails/:id`), as plan §A3 assumes. |
| 5 | SPF / DKIM / DMARC at Gmail | **All pass.** DKIM `d=midwestfreeks.org s=resend`; SPF via `rsend.midwestfreeks.org`. |
| 6 | Access path bypass | **Works.** `/private` → 302 to Access; `/webhooks/resend` → 200, no JWT. The bypass also covers sub-paths. |

## 1. CPU budget

Fixtures: `.eml` files with 10 attachments each (1.1 / 5.2 / 20.4 MiB), plus a 25 MiB binary blob.

### Single calls

| Call | HTTP | Worker `cpuTime` | DO `cpuTime` | Outcome |
|---|---|---|---|---|
| `worker-parse` 1 MB | 200 | 77 | – | ok |
| `worker-parse` 5 MB | 200 | 146 | – | ok |
| `worker-parse` 20 MB | 200 | 496 | – | ok |
| `do-parse` 1 MB | 200 | 0 | 91 | ok |
| `do-parse` 5 MB | 200 | 0 | 301 | ok |
| `do-parse` 20 MB | 200 | 0 | 637 | ok |
| `rpc-chain` 5 MB × 5 | 200 | 2 | 150, 192, 198, 163, 220 | ok (5 separate DO events) |
| `do-base64` 25 MB (→ 34,952,536 chars) | 200 | 0 | 1,528 | ok |
| `do-alarm` 20 MB (parse inside `alarm()`) | 200 | 0 | 711 | ok, result row written |

### Sustained: 10 back-to-back 20 MB parses each

| Path | Results | CPU per call |
|---|---|---|
| `worker-parse` | **6 × 200, 4 × 503 `exceededCpu`** ("Worker exceeded CPU time limit.") | 368–657 ms when ok |
| `do-parse` | **10 × 200** | 551–752 ms |

**Interpretation.**
- The stateless Worker gets burst slack above the documented 10 ms but is killed once that runs out. Ingest must not parse in the `email()` handler or any plain Worker path.
- No DO request was killed at up to ~1.5 s CPU. DOs on Free behave like the "30 s default" row of the DO limits table, not the 10 ms Workers figure. Design A (stream raw to R2, full parse in `MailboxDO`) is viable.
- Alarms also get a full budget.
- Each RPC call into a DO is metered as its own invocation.
- Base64-encoding 25 MB in a DO costs ~1.5 s CPU and succeeds, so the base64 fallback is available if `path` ever fails.

**Caveat.** The DO budget is observed, not documented. Keep postal-mime's `maxPartCount`/size limits as a safety net and cap single-message size at the 25 MiB inbound limit.

## 2–5. Resend

Sent from `probe@midwestfreeks.org` to a Gmail inbox, with two attachments given as presigned R2 GET URLs (`aws4fetch` `signQuery`, token scoped Object Read to the probe bucket): `probe.txt`, and `pixel.png` with `content_id: probe-pixel`. A custom `Message-ID` header was passed in `headers`.

### Immediate send

- `POST /emails` → **200**, id `01a1f101-2159-720a-bd91-13cc02bc530f`; `last_event: delivered` within seconds.
- Gmail MIME structure: `multipart/mixed` → `multipart/alternative` (text + `multipart/related` html + `pixel.png` `Content-ID: <probe-pixel>`, `inline`) + `probe.txt` (`attachment`). **Resend fetched both presigned URLs.** The 1 h expiry was ample.
- **Message-ID:**
  - sent: `<probe-41aeb815-7627-4066-a7a3-0fd22519e6c9@midwestfreeks.org>`
  - Gmail `Message-ID:` header: `<010001a1f101260d-27e132f9-1136-4dc0-b142-276f49c61645-000000@email.amazonses.com>`
  - `GET /emails/:id` `message_id`: the same `…@email.amazonses.com` value

  → The custom header is **discarded**, and Resend's reported `message_id` matches what recipients see.
- **Authentication-Results** (Gmail):
  - `dkim=pass header.i=@midwestfreeks.org header.s=resend`
  - `dkim=pass header.i=@amazonses.com`
  - `spf=pass` (`smtp.mailfrom=…@rsend.midwestfreeks.org`, 54.240.11.31)
  - `dmarc=pass (p=NONE) header.from=midwestfreeks.org`
- Resend labels the domain "Resend Forge", but delivery still goes through Amazon SES (`X-SES-Outgoing`, `amazonses.com` Message-ID).

### Scheduled send (`scheduled_at: "in 3 min"`, same `path` attachments, 6 h URL expiry)

- `POST /emails` at 23:32:26 → **200**, id `01a1f101-2576-7975-ad10-338bb07b30a7`. `GET /emails/:id` showed `last_event: scheduled`, `scheduled_at: 23:35:26.614`, `message_id: null` until sent.
- Delivered: Gmail `date` 23:36:07, Resend `last_event: delivered`, `message_id` `<010001a1f10484a6-61233dbb-b983-4b16-a133-b982c14acb21-000000@email.amazonses.com>`.
- Gmail shows both `pixel.png` (inline) and `probe.txt`. **`scheduled_at` + presigned `path` works.**
- Not determined: whether Resend fetched the URLs at submit time or at send time. Until that is known, give presigned URLs an expiry of at least `scheduled_at` + 1 h.
- `message_id` is `null` while scheduled, so the outbox must take it from the `email.sent` webhook, not from the submit response.

## 6. Access

Two self-hosted apps on team `wsllc`:
- **A:** `probe.midwestfreeks.org`, Allow (owner email).
- **B:** `probe.midwestfreeks.org/webhooks/resend`, Bypass / Everyone.

Results:

```
private 302 https://wsllc.cloudflareaccess.com/cdn-cgi/access/login/probe.midwestfreeks.org?...&redirect_url=%2Fprivate
{ "path": "/webhooks/resend", "accessJwtPresent": false }   webhook 200
webhook-subpath (/webhooks/resend/x) 200
```

- The path-scoped Bypass app takes precedence over the hostname app, as documented.
- **New:** a path app also matches everything **below** the path. The webhook handler must verify the Svix signature on every request regardless (planned in Phase 3).

## Setup facts learned

- **R2** was already active on the account. No payment step was needed.
- **Zero Trust** existed (team `wsllc`) but had no plan, so Access apps were unavailable until "Zero Trust Free" was activated. That checkout requires a card on file and an overage-charge authorization, even at $0.
- **Resend DNS** for this domain (manual setup, all DNS-only):
  - TXT `resend._domainkey`
  - CNAME `send` → `send.forge.rmta.net`
  - CNAME `rsend` → `rsend.forge.rmta.net`
  - TXT `_dmarc` = `v=DMARC1; p=none;`

  Resend also offers `receive.forge.rmta.net` for receiving. It was not added (Receiving stays off).
- **The zone has no MX records.** Cloudflare Email Routing is not enabled on `midwestfreeks.org` yet. Phase 4 must enable it before any inbound mail can arrive. The production mailbox will be `lawrence@midwestfreeks.org`.
