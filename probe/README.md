# Free-tier probe (plan v2, Phase 1)

This is a throwaway Worker. It answers the questions the Cloudflare and Resend docs leave open. Run it once, paste the results back, then delete it.

Everything below runs from the repo root on your machine, logged in with `npx wrangler login`.

## 0. One-time setup

1. **Activate R2.** In the dashboard, go to R2 and activate it. This may ask for a payment method; free-tier usage costs $0.
2. **Create the probe bucket.**

   ```bash
   npx wrangler r2 bucket create agentic-inbox-probe
   ```

3. **Create an R2 API token** (Dashboard → R2 → Manage API tokens):
   - Permission: **Object Read only**.
   - Scope: **only** the `agentic-inbox-probe` bucket.
   - Note the Access Key ID and the Secret Access Key.
4. **Set up Resend.** Add `midwestfreeks.org` as a domain and add **exactly** the DNS records Resend shows. In Cloudflare DNS:
   - Set every Resend record to **DNS only** (grey cloud).
   - Leave the existing Email Routing MX records on the apex alone.
   - Keep Resend "Receiving" off.

   Wait until Resend shows the domain as Verified.
5. **Create a temporary Resend API key** with **Full access**.
   - It's needed only for `/resend/status`, which calls `GET /emails/:id`. The real app will use a sending-only key.
   - Delete this key when you finish.
6. **Generate the test messages and upload them:**

   ```bash
   node probe/make-fixtures.mjs
   ```

   ```bash
   for f in 1mb.eml 5mb.eml 20mb.eml blob-25mb.bin; do npx wrangler r2 object put "agentic-inbox-probe/fixtures/$f" --file "probe/fixtures/$f" --remote; done
   ```

7. **Deploy the probe and set its secrets.** The deploy creates the custom domain `probe.midwestfreeks.org`.

   ```bash
   npx wrangler deploy -c probe/wrangler.jsonc
   ```

   ```bash
   npx wrangler secret put RESEND_API_KEY -c probe/wrangler.jsonc
   ```

   ```bash
   npx wrangler secret put R2_ACCESS_KEY_ID -c probe/wrangler.jsonc
   ```

   ```bash
   npx wrangler secret put R2_SECRET_ACCESS_KEY -c probe/wrangler.jsonc
   ```

   ```bash
   npx wrangler secret put CF_ACCOUNT_ID -c probe/wrangler.jsonc
   ```

## 1. CPU budget (Durable Object on Free)

1. In one terminal, start the log stream:

   ```bash
   npx wrangler tail agentic-inbox-probe --format json > probe-tail.jsonl
   ```

2. In a second terminal, run each call. For each one, note the HTTP status, and whether the output is JSON or a CPU error. Start with the small messages so a large failure doesn't hide the small results.

   ```bash
   for k in 1mb 5mb 20mb; do curl -s -o /dev/null -w "worker-parse $k %{http_code}\n" "https://probe.midwestfreeks.org/cpu/worker-parse?key=fixtures/$k.eml"; done
   ```

   ```bash
   for k in 1mb 5mb 20mb; do curl -s -o /dev/null -w "do-parse $k %{http_code}\n" "https://probe.midwestfreeks.org/cpu/do-parse?key=fixtures/$k.eml"; done
   ```

   ```bash
   curl -s -o /dev/null -w "rpc-chain 5mb x5 %{http_code}\n" "https://probe.midwestfreeks.org/cpu/rpc-chain?key=fixtures/5mb.eml&n=5"
   ```

   ```bash
   curl -s -o /dev/null -w "do-base64 25mb %{http_code}\n" "https://probe.midwestfreeks.org/cpu/do-base64?key=fixtures/blob-25mb.bin"
   ```

   ```bash
   curl -s "https://probe.midwestfreeks.org/cpu/do-alarm?key=fixtures/20mb.eml"
   ```

3. After about 10 seconds, read the alarm result:

   ```bash
   curl -s "https://probe.midwestfreeks.org/cpu/alarm-results"
   ```

4. Stop the tail, then pull out the outcome and CPU time per event:

   ```bash
   grep -o '"outcome":"[a-zA-Z]*"\|"cpuTime":[0-9]*\|"url":"[^"]*"' probe-tail.jsonl
   ```

**What the results mean:**
- **`worker-parse` fails on 5 MB or 20 MB but `do-parse` succeeds:** the Durable Object has a real budget, so the plan uses Design A.
- **`do-parse` fails too (`exceededCpu`):** the plan uses Design B.
- **`rpc-chain` succeeds while a single parse is near the limit:** each RPC call gets its own budget.

## 2. Resend: presigned `path` attachments and Message-ID

1. Send the test emails to a Gmail address you can read:

   ```bash
   curl -s "https://probe.midwestfreeks.org/resend/send?to=YOU@gmail.com"
   ```

   ```bash
   curl -s "https://probe.midwestfreeks.org/resend/send-scheduled?to=YOU@gmail.com"
   ```

2. Both calls return `{ customMessageId, status, body: { id } }`. Then fetch Resend's record, replacing `RESEND_ID` with that `id`:

   ```bash
   curl -s "https://probe.midwestfreeks.org/resend/status?id=RESEND_ID"
   ```

3. In Gmail, open the message, then ⋮ → **Show original**. Record:
   - Did **probe.txt** arrive, and does the inline pixel show? This tests the presigned `path`.
   - The `Message-ID:` header. Is it the `customMessageId` the probe sent, or something else? Does it match `message_id` from `/resend/status`?
   - `SPF`, `DKIM` and `DMARC`: all should say PASS.
   - Did the scheduled send arrive about 3 minutes later, with its attachment? A 4xx in step 1 also counts as an answer.

## 3. Access path bypass

1. Create two Access applications (Zero Trust → Access → Applications → Self-hosted):
   - **App A:** domain `probe.midwestfreeks.org`. Policy: Allow, your email.
   - **App B:** domain `probe.midwestfreeks.org`, path `webhooks/resend` (exact, no `/*`). Policy: **Bypass**, Include **Everyone**.
2. From a terminal (no browser cookies), run:

   ```bash
   curl -s -o /dev/null -w "private %{http_code} %{redirect_url}\n" https://probe.midwestfreeks.org/private
   ```

   ```bash
   curl -s -w "\nwebhook %{http_code}\n" https://probe.midwestfreeks.org/webhooks/resend
   ```

**Expected:** `/private` returns a 302 redirect to `…cloudflareaccess.com`. `/webhooks/resend` returns 200 with `"accessJwtPresent": false`.

## 4. Report and clean up

Paste the outputs from sections 1–3, or `probe-tail.jsonl` plus your Gmail notes, into the session. They become `docs/probe-results.md`. Then clean up:

```bash
npx wrangler delete -c probe/wrangler.jsonc
```

```bash
npx wrangler r2 bucket delete agentic-inbox-probe
```

Do the rest by hand:
- Empty the bucket first if the delete refuses.
- Delete the temporary full-access Resend key.
- Delete Access app B.
- Keep the Resend domain; the app needs it.
