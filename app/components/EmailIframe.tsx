// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useRef, useState } from "react";
import { plainTextToHtml } from "~/lib/plainText";

interface EmailIframeProps {
	body: string;
	/** When true, iframe auto-sizes to content height instead of filling parent */
	autoSize?: boolean;
}

// Every link opens in a new tab; nothing in an email can navigate the app (B6).
let hookInstalled = false;
function installLinkHook() {
	if (hookInstalled) return;
	hookInstalled = true;
	DOMPurify.addHook("afterSanitizeAttributes", (node) => {
		if (node.tagName === "A" && node.hasAttribute("href")) {
			node.setAttribute("target", "_blank");
			node.setAttribute("rel", "noopener noreferrer");
		}
	});
}

const REMOTE_CONTENT = /(?:src|background)\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i;

// The only script allowed in the frame (B7). Its hash goes in the CSP, so
// any other inline script that survives sanitising is blocked.
const HEIGHT_SCRIPT = `function reportHeight(){var h=document.body.scrollHeight;if(h>0)parent.postMessage({__emailIframeHeight:true,height:h},"*");}reportHeight();setTimeout(reportHeight,50);setTimeout(reportHeight,150);setTimeout(reportHeight,400);window.addEventListener("load",reportHeight);`;

async function sha256Base64(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/**
 * Renders email HTML inside a sandboxed iframe.
 *
 * Security model:
 * - DOMPurify sanitises the HTML before injection.
 * - The iframe sandbox does NOT include `allow-same-origin`, so even if
 *   DOMPurify has a bypass the attacker's code runs in an opaque origin
 *   with no access to the parent page's cookies, DOM, or API.
 * - Because the iframe is cross-origin we cannot read `contentDocument`
 *   for auto-sizing. Instead, the injected HTML includes a tiny inline
 *   script that posts its body height to the parent via `postMessage`.
 *   The `allow-scripts` flag is required for this, but scripts inside
 *   the opaque-origin sandbox cannot access anything useful.
 * - A strict CSP meta tag blocks external resource loads inside the
 *   iframe as a defense-in-depth layer.
 */
export default function EmailIframe({ body, autoSize }: EmailIframeProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(autoSize ? 100 : 0);
	// Remote images (and CSS url()) are blocked until the user asks; they leak opens and IPs.
	const [showRemote, setShowRemote] = useState(false);
	// Text-only messages become paragraphs, breaks and links first.
	const htmlBody = plainTextToHtml(body);
	const hasRemote = REMOTE_CONTENT.test(htmlBody);

	// Listen for height reports from the sandboxed iframe
	const handleMessage = useCallback(
		(event: MessageEvent) => {
			if (!autoSize) return;
			// Only accept messages from our own iframe
			if (event.source !== iframeRef.current?.contentWindow) return;
			if (
				event.data &&
				typeof event.data === "object" &&
				event.data.__emailIframeHeight &&
				typeof event.data.height === "number" &&
				event.data.height > 0
			) {
				setHeight(event.data.height);
			}
		},
		[autoSize],
	);

	useEffect(() => {
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [handleMessage]);

	useEffect(() => {
		const iframe = iframeRef.current;
		if (!iframe || !htmlBody) return;
		let cancelled = false;
		installLinkHook();

		// <style> is allowed (B8): newsletters depend on it, and the CSP below
		// (no remote loads unless opted in, no fonts) stops CSS exfiltration.
		const cleanBody = DOMPurify.sanitize(htmlBody, {
			USE_PROFILES: { html: true },
			ADD_TAGS: ["style"],
			ADD_ATTR: ["target"],
			FORCE_BODY: true,
		});

		const padding = autoSize ? "0" : "24px";
		const imgSrc = showRemote ? "data: cid: https:" : "data: cid:";

		void (async () => {
			const scriptSrc = autoSize ? `'sha256-${await sha256Base64(HEIGHT_SCRIPT)}'` : "'none'";
			const heightScript = autoSize ? `<script>${HEIGHT_SCRIPT}<\/script>` : "";
			if (cancelled) return;

			// Use srcdoc so the iframe is truly sandboxed (no same-origin access).
			// We can't use doc.write() because that requires allow-same-origin.
			iframe.srcdoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${imgSrc}; script-src ${scriptSrc}; form-action 'none'; base-uri 'none';">
<style>
* { box-sizing: border-box; }
html {
	background: #ffffff;
	color-scheme: light;
}
body {
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
	font-size: 15px;
	line-height: 1.65;
	color: #1f2328;
	background: #ffffff;
	padding: ${padding};
	margin: 0;
	word-wrap: break-word;
	overflow-wrap: break-word;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	${autoSize ? "overflow: hidden;" : ""}
}
@media (min-width: 900px) {
	body { padding: ${autoSize ? "0" : "28px 32px"}; }
}
[style*="position: fixed"], [style*="position:fixed"], [style*="position: absolute"], [style*="position:absolute"] {
	position: relative !important;
}
p { margin: 0 0 0.9em; }
p:last-child { margin-bottom: 0; }
a {
	color: #1a5fd6;
	text-decoration: none;
	border-bottom: 1px solid rgba(26, 95, 214, 0.3);
}
a:hover { border-bottom-color: currentColor; }
h1, h2, h3, h4 {
	line-height: 1.3;
	margin: 1.2em 0 0.5em;
}
h1:first-child, h2:first-child, h3:first-child, h4:first-child { margin-top: 0; }
ul, ol { padding-left: 22px; margin: 0 0 0.9em; }
li { margin: 0.2em 0; }
blockquote {
	border-left: 3px solid #d8dee4;
	padding: 0 0 0 1em;
	margin: 0 0 0.9em;
	color: #59636e;
}
blockquote p { margin-bottom: 0.4em; }
pre {
	background: #f6f8fa;
	padding: 12px 14px;
	border-radius: 8px;
	overflow-x: auto;
	font-size: 13px;
	line-height: 1.5;
}
code, pre {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
hr { border: 0; border-top: 1px solid #d8dee4; margin: 1.4em 0; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; max-width: 100%; }
td, th { padding: 6px 10px; border: 1px solid #e5e9ee; }
th { background: #f6f8fa; text-align: left; }
</style>
</head>
<body>${cleanBody}${heightScript}</body>
</html>`;
		})();
		return () => {
			cancelled = true;
		};
	}, [htmlBody, autoSize, showRemote]);

	const frame = (
		<iframe
			ref={iframeRef}
			style={{
				display: "block",
				width: "100%",
				border: 0,
				...(autoSize ? { height: `${height}px` } : { height: "100%" }),
			}}
			// No allow-top-navigation: links can only open new tabs (B6).
			sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
			title="Email content"
		/>
	);
	if (!hasRemote || showRemote) return frame;
	return (
		<Box sx={{ display: "flex", flexDirection: autoSize ? "column" : "column", height: autoSize ? "auto" : "100%" }}>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1,
					borderBottom: 1,
					borderColor: "divider",
					bgcolor: "action.hover",
					px: 1.5,
					py: 0.75,
				}}
			>
				<Typography variant="caption" color="text.secondary">
					Remote images are hidden.
				</Typography>
				<Button size="small" onClick={() => setShowRemote(true)} sx={{ minWidth: 0, fontSize: 12 }}>
					Show images
				</Button>
			</Box>
			<Box sx={{ minHeight: 0, flex: autoSize ? undefined : 1 }}>{frame}</Box>
		</Box>
	);
}
