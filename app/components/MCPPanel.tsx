// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API unavailable or permission denied — ignore silently
		}
	};

	return (
		<Tooltip title={copied ? "Copied!" : "Copy"}>
			<IconButton size="small" onClick={handleCopy} aria-label="Copy to clipboard">
				{copied ? (
					<CheckIcon sx={{ fontSize: 14, color: "success.main" }} />
				) : (
					<ContentCopyIcon sx={{ fontSize: 14 }} />
				)}
			</IconButton>
		</Tooltip>
	);
}

const TOOLS = [
	{ name: "list_mailboxes", desc: "List all mailboxes" },
	{ name: "list_emails", desc: "List emails in a folder" },
	{ name: "get_email", desc: "Read a full email with body" },
	{ name: "get_thread", desc: "Load a conversation thread" },
	{ name: "search_emails", desc: "Search emails by query" },
	{ name: "draft_reply", desc: "Draft a reply to an email" },
	{ name: "send_reply", desc: "Send a reply" },
	{ name: "send_email", desc: "Send a new email" },
	{ name: "mark_email_read", desc: "Mark email as read/unread" },
	{ name: "move_email", desc: "Move email to a folder" },
];

export default function MCPPanel() {
	const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://your-app.workers.dev";
	const mcpUrl = `${baseUrl}/mcp`;

	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2, display: "flex", flexDirection: "column", gap: 2 }}>
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
						<Box
							sx={{
								display: "flex",
								height: 40,
								width: 40,
								alignItems: "center",
								justifyContent: "center",
								borderRadius: 3,
								bgcolor: "action.selected",
							}}
						>
							<ExtensionOutlinedIcon sx={{ fontSize: 20, color: "primary.main" }} />
						</Box>
						<Box>
							<Typography variant="body2" sx={{ fontWeight: 600 }}>
								Connect via MCP
							</Typography>
							<Typography variant="caption" color="text.secondary">
								Model Context Protocol
							</Typography>
						</Box>
					</Box>
					<Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
						This email agent exposes an MCP server so AI coding assistants can manage your inbox
						directly — read emails, search, draft replies, and send messages using natural language.
					</Typography>
				</Box>

				<Box>
					<Typography variant="caption" sx={{ fontWeight: 500, color: "text.primary", display: "block", mb: 0.5 }}>
						Server URL
					</Typography>
					<Box sx={{ position: "relative" }}>
						<Box sx={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}>
							<CopyButton text={mcpUrl} />
						</Box>
						<Paper
							variant="outlined"
							sx={{
								bgcolor: "action.hover",
								fontFamily: "monospace",
								fontSize: 11,
								px: 1.5,
								py: 1.25,
								pr: 5,
								borderRadius: 2,
								wordBreak: "break-all",
								lineHeight: 1.6,
							}}
						>
							{mcpUrl}
						</Paper>
					</Box>
				</Box>

				<Box>
					<Typography
						variant="caption"
						sx={{ textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600, color: "text.secondary", display: "block", mb: 0.75 }}
					>
						Available Tools
					</Typography>
					<Paper variant="outlined" sx={{ borderRadius: 2 }}>
						{TOOLS.map((tool, idx) => (
							<Box
								key={tool.name}
								sx={{
									display: "flex",
									alignItems: "center",
									gap: 1,
									px: 1.5,
									py: 1,
									borderTop: idx === 0 ? 0 : 1,
									borderColor: "divider",
								}}
							>
								<BuildOutlinedIcon sx={{ fontSize: 14, color: "primary.main", flexShrink: 0 }} />
								<Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 500, flex: 1, minWidth: 0 }} noWrap>
									{tool.name}
								</Typography>
								<Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontSize: 10 }}>
									{tool.desc}
								</Typography>
							</Box>
						))}
					</Paper>
				</Box>
			</Box>
		</Box>
	);
}
