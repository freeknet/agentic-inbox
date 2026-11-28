// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DOMPurify from "dompurify";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isHtmlBody, plainTextToHtml } from "~/lib/plainText";
import { isSimpleHtml, splitQuoted } from "~/lib/quotes";

interface EmailIframeProps {
	body: string;
	/** When true, iframe auto-sizes to content height instead of filling parent */
	autoSize?: boolean;
	/** Hide the quoted history at the end behind a "•••" button, as Gmail does. */
	trimQuotes?: boolean;
	/** Sit directly on the card (conversation view) instead of in a bordered box. */
	flush?: boolean;
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

/** The app switches schemes by swapping a class on <html>, so watch that. */
function subscribeScheme(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "data-mui-color-scheme"],
	});
	return () => observer.disconnect();
}

const isDarkScheme = () =>
	document.documentElement.classList.contains("dark") ||
	document.documentElement.dataset.muiColorScheme === "dark";

function useDarkScheme(): boolean {
	return useSyncExternalStore(subscribeScheme, isDarkScheme, () => false);
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
export default function EmailIframe({ body, autoSize, trimQuotes, flush }: EmailIframeProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(autoSize ? 100 : 0);
	// Remote images (and CSS url()) are blocked until the user asks; they leak opens and IPs.
	const [showRemote, setShowRemote] = useState(false);
	// Text-only messages become paragraphs, breaks and links first.
	const textOnly = !isHtmlBody(body ?? "");
	const fullBody = plainTextToHtml(body);
	const [showQuoted, setShowQuoted] = useState(false);
	const split = useMemo(() => (trimQuotes ? splitQuoted(fullBody) : { main: fullBody, quoted: null }), [fullBody, trimQuotes]);
	const htmlBody = showQuoted || !split.quoted ? fullBody : split.main;
	const hasRemote = REMOTE_CONTENT.test(htmlBody);

	// Plain-text mail has no colours of its own, so follow the app's scheme.
	// HTML mail keeps whatever it sets, as email clients do.
	// HTML newsletters often set dark text and assume a white page, so only
	// text-only mail goes dark.
	// Typed HTML with no colours of its own (most personal mail) follows it too.
	const appDark = useDarkScheme();
	const dark = appDark && (textOnly || isSimpleHtml(split.main));
	// Designed HTML in the dark theme gets its own light page with a margin.
	const lightPage = appDark && !dark;
	const c = useMemo(() => (dark
		? {
				bg: "#131314",
				fg: "#e4e6e9",
				muted: "#9aa0a6",
				link: "#8ab4f8",
				linkRule: "rgba(138, 180, 248, 0.35)",
				border: "#3c4043",
				code: "#26282c",
				tableHeader: "#26282c",
			}
		: {
				bg: "#ffffff",
				fg: "#1f2328",
				muted: "#59636e",
				link: "#1a5fd6",
				linkRule: "rgba(26, 95, 214, 0.3)",
				border: "#d8dee4",
				code: "#f6f8fa",
				tableHeader: "#f6f8fa",
			}), [dark]);

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
			// Converted plain text gets a readable measure; HTML mail keeps its layout.
			const content = textOnly ? `<div class="plain">${cleanBody}</div>` : cleanBody;

		const padding = autoSize ? (lightPage ? "16px" : "0") : "24px";
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
	background: ${c.bg};
	color-scheme: ${dark ? "dark" : "light"};
}
body {
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
	font-size: 15px;
	line-height: 1.65;
	color: ${c.fg};
	background: ${c.bg};
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
	color: ${c.link};
	text-decoration: none;
	border-bottom: 1px solid ${c.linkRule};
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
	border-left: 3px solid ${c.border};
	padding: 0 0 0 1em;
	margin: 0 0 0.9em;
	color: ${c.muted};
}
blockquote p { margin-bottom: 0.4em; }
pre {
	background: ${c.code};
	padding: 12px 14px;
	border-radius: 8px;
	overflow-x: auto;
	font-size: 13px;
	line-height: 1.5;
}
code, pre {
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
hr { border: 0; border-top: 1px solid ${c.border}; margin: 1.4em 0; }
img { max-width: 100%; height: auto; }
table { border-collapse: collapse; max-width: 100%; }
td, th { padding: 6px 10px; border: 1px solid ${c.border}; }
th { background: ${c.tableHeader}; text-align: left; }
/* Plain-text mail has no layout of its own: keep lines a comfortable length. */
.plain { max-width: 760px; }
</style>
</head>
<body>${content}${heightScript}</body>
</html>`;
		})();
		return () => {
			cancelled = true;
		};
	}, [htmlBody, autoSize, showRemote, textOnly, dark, lightPage, c]);

	const hideRemote = hasRemote && !showRemote;

	// The message sits in the app's card, not a bare white rectangle.
	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				// Grow to the pane: as a flex child it would otherwise shrink to its content.
				flex: autoSize ? "0 0 auto" : "1 1 auto",
				width: "100%",
				minWidth: 0,
				minHeight: 0,
				height: autoSize ? "auto" : "100%",
				borderRadius: "12px",
				border: flush ? 0 : 1,
				borderColor: "divider",
				bgcolor: lightPage ? "#ffffff" : "background.paper",
				overflow: "hidden",
			}}
		>
			{hideRemote && (
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
						flexShrink: 0,
					}}
				>
					<Typography variant="caption" color="text.secondary">
						Remote images are hidden.
					</Typography>
					<Button size="small" onClick={() => setShowRemote(true)} sx={{ minWidth: 0, fontSize: 12 }}>
						Show images
					</Button>
				</Box>
			)}
			<iframe
				ref={iframeRef}
				style={{
					display: "block",
					width: "100%",
					border: 0,
					...(autoSize ? { height: `${height}px` } : { height: "100%", minHeight: 0, flex: 1 }),
				}}
				// No allow-top-navigation: links can only open new tabs (B6).
				sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
				title="Email content"
			/>
			{split.quoted && (
				<Box sx={{ px: lightPage ? 2 : 0, pb: lightPage ? 1.5 : 0, pt: 0.5, bgcolor: lightPage ? "#ffffff" : undefined }}>
					<Tooltip title={showQuoted ? "Hide expanded content" : "Show trimmed content"}>
						<Button
							size="small"
							aria-label={showQuoted ? "Hide expanded content" : "Show trimmed content"}
							aria-expanded={showQuoted}
							onClick={() => setShowQuoted((v) => !v)}
							sx={{
								minWidth: 0,
								height: 14,
								px: 0.75,
								py: 0,
								lineHeight: 1,
								fontSize: 14,
								letterSpacing: 1,
								borderRadius: 1,
								// Neutral grey like Gmail's, whatever the accent colour.
								color: lightPage ? "#444" : "text.secondary",
								bgcolor: lightPage ? "#e8eaed" : "rgba(128, 128, 128, 0.22)",
								"&:hover": { bgcolor: lightPage ? "#dadce0" : "rgba(128, 128, 128, 0.35)" },
							}}
						>
							•••
						</Button>
					</Tooltip>
				</Box>
			)}
		</Box>
	);
}
