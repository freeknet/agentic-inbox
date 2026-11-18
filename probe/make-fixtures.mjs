// Generates probe fixtures in probe/fixtures/ (gitignored):
//   1mb.eml, 5mb.eml, 20mb.eml  multipart messages with an HTML body and 10 attachments
//   blob-25mb.bin               raw bytes for the base64 cost test
// Usage: node probe/make-fixtures.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
mkdirSync(out, { recursive: true });

function wrap76(b64) {
	return b64.replace(/.{1,76}/g, "$&\r\n");
}

function message(totalMb) {
	const boundary = "PROBE-BOUNDARY";
	const attachmentBytes = Math.floor((totalMb * 1024 * 1024 * 0.74) / 10); // base64 inflates ~4/3
	const html = `<html><body>${"<p>Probe paragraph with some <b>markup</b> and text.</p>".repeat(2000)}</body></html>`;
	const parts = [
		"From: Probe Sender <sender@probe.test>",
		"To: me@midwestfreeks.org",
		`Subject: Probe fixture ${totalMb} MB`,
		`Message-ID: <fixture-${totalMb}mb@probe.test>`,
		"Date: Tue, 03 Nov 2026 10:00:00 +0000",
		"MIME-Version: 1.0",
		`Content-Type: multipart/mixed; boundary="${boundary}"`,
		"",
		`--${boundary}`,
		"Content-Type: text/html; charset=utf-8",
		"Content-Transfer-Encoding: 8bit",
		"",
		html,
	];
	for (let i = 0; i < 10; i++) {
		parts.push(
			`--${boundary}`,
			`Content-Type: application/octet-stream; name="file-${i}.bin"`,
			`Content-Disposition: attachment; filename="file-${i}.bin"`,
			"Content-Transfer-Encoding: base64",
			"",
			wrap76(randomBytes(attachmentBytes).toString("base64")),
		);
	}
	parts.push(`--${boundary}--`, "");
	return parts.join("\r\n");
}

for (const mb of [1, 5, 20]) {
	const body = message(mb);
	writeFileSync(join(out, `${mb}mb.eml`), body);
	console.log(`${mb}mb.eml  ${(Buffer.byteLength(body) / 1024 / 1024).toFixed(1)} MiB`);
}
writeFileSync(join(out, "blob-25mb.bin"), randomBytes(25 * 1024 * 1024));
console.log("blob-25mb.bin  25.0 MiB");
