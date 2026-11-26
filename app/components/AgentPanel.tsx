// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MailOutlinedIcon from "@mui/icons-material/MailOutlined";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import ReplyIcon from "@mui/icons-material/Reply";
import SearchIcon from "@mui/icons-material/Search";
import SendIcon from "@mui/icons-material/Send";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useUIStore } from "~/hooks/useUIStore";
import type { UIMessage } from "ai";

const TOOL_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
	list_emails: { label: "Fetching emails", icon: <MailOutlinedIcon sx={{ fontSize: 14 }} /> },
	get_email: { label: "Reading email", icon: <VisibilityOutlinedIcon sx={{ fontSize: 14 }} /> },
	get_thread: { label: "Loading thread", icon: <ReplyIcon sx={{ fontSize: 14 }} /> },
	search_emails: { label: "Searching", icon: <SearchIcon sx={{ fontSize: 14 }} /> },
	draft_email: { label: "Drafting email", icon: <SendIcon sx={{ fontSize: 14 }} /> },
	draft_reply: { label: "Drafting reply", icon: <SendIcon sx={{ fontSize: 14 }} /> },
	discard_draft: { label: "Discarding draft", icon: <DeleteOutlinedIcon sx={{ fontSize: 14 }} /> },
	mark_email_read: { label: "Updating status", icon: <MarkEmailReadOutlinedIcon sx={{ fontSize: 14 }} /> },
	move_email: { label: "Moving email", icon: <MailOutlinedIcon sx={{ fontSize: 14 }} /> },
};

function ToolCallBadge({ toolName, state }: { toolName: string; state: string }) {
	const info = TOOL_LABELS[toolName] || {
		label: toolName,
		icon: <BuildOutlinedIcon sx={{ fontSize: 14 }} />,
	};
	const isDone = state === "output-available" || state === "output-error";

	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "center",
				gap: 0.75,
				py: 0.5,
				px: 1,
				borderRadius: 1,
				bgcolor: "action.hover",
			}}
		>
			<Box sx={{ display: "flex", color: "primary.main" }}>{info.icon}</Box>
			<Typography variant="caption" sx={{ color: "text.primary" }}>
				{info.label}
			</Typography>
			{isDone ? (
				<CheckCircleIcon sx={{ fontSize: 12, color: "success.main", ml: "auto" }} />
			) : (
				<CircularProgress size={12} sx={{ ml: "auto" }} />
			)}
		</Box>
	);
}

function getToolNameFromPart(part: UIMessage["parts"][number]): string | null {
	if (part.type === "dynamic-tool") return (part as any).toolName ?? null;
	if (part.type.startsWith("tool-")) return part.type.replace("tool-", "");
	return null;
}

function hasDraftReplyTool(message: UIMessage): boolean {
	return message.parts.some((part) => getToolNameFromPart(part) === "draft_reply");
}

function DraftActions({ onEdit, disabled }: { onEdit: () => void; disabled: boolean }) {
	return (
		<Box sx={{ display: "flex", gap: 0.75, mt: 0.5 }}>
			<Button variant="contained" size="small" startIcon={<EditOutlinedIcon />} onClick={onEdit} disabled={disabled}>
				Edit &amp; send in composer
			</Button>
		</Box>
	);
}

function MessageBubble({
	message,
	onAction,
	isStreaming,
}: {
	message: UIMessage;
	onAction?: (action: string) => void;
	isStreaming: boolean;
}) {
	const isUser = message.role === "user";

	return (
		<Box sx={{ display: "flex", gap: 1, flexDirection: isUser ? "row-reverse" : "row" }}>
			<Avatar
				sx={{
					width: 24,
					height: 24,
					flexShrink: 0,
					bgcolor: isUser ? "primary.main" : "action.selected",
					color: isUser ? "primary.contrastText" : "text.primary",
				}}
			>
				{isUser ? <PersonOutlinedIcon sx={{ fontSize: 14 }} /> : <SmartToyOutlinedIcon sx={{ fontSize: 14 }} />}
			</Avatar>
			<Box
				sx={{
					display: "flex",
					flexDirection: "column",
					gap: 0.5,
					maxWidth: "85%",
					minWidth: 0,
					alignItems: isUser ? "flex-end" : "flex-start",
				}}
			>
				{message.parts.map((part, i) => {
					const key = `${message.id}-part-${i}`;
					if (part.type === "text" && part.text.trim()) {
						return (
							<Box
								key={key}
								sx={{
									borderRadius: 2,
									px: 1.5,
									py: 1,
									fontSize: 13,
									lineHeight: 1.6,
									wordBreak: "break-word",
									overflowWrap: "anywhere",
									maxWidth: "100%",
									...(isUser
										? {
												bgcolor: "primary.main",
												color: "primary.contrastText",
												borderBottomRightRadius: 2,
											}
										: {
												bgcolor: "background.paper",
												color: "text.primary",
												border: 1,
												borderColor: "divider",
												overflow: "hidden",
											}),
								}}
							>
								{isUser ? (
									part.text
								) : (
									<Markdown
										remarkPlugins={[remarkGfm]}
										components={{
											a: ({ href, children }) => (
												<Box
													component="a"
													href={href}
													target="_blank"
													rel="noopener noreferrer"
													sx={{ color: "primary.main", textDecoration: "underline" }}
												>
													{children}
												</Box>
											),
											p: ({ children }) => (
												<Typography variant="inherit" component="p" sx={{ mb: 1, "&:last-child": { mb: 0 } }}>
													{children}
												</Typography>
											),
											strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
											ul: ({ children }) => (
												<Box component="ul" sx={{ listStyle: "disc", pl: 2, mb: 1, "&:last-child": { mb: 0 } }}>
													{children}
												</Box>
											),
											ol: ({ children }) => (
												<Box component="ol" sx={{ listStyle: "decimal", pl: 2, mb: 1, "&:last-child": { mb: 0 } }}>
													{children}
												</Box>
											),
											li: ({ children }) => <li>{children}</li>,
											h1: ({ children }) => (
												<Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600, mb: 0.5 }}>
													{children}
												</Typography>
											),
											h2: ({ children }) => (
												<Typography variant="subtitle2" component="h4" sx={{ fontWeight: 600, mb: 0.5 }}>
													{children}
												</Typography>
											),
											h3: ({ children }) => (
												<Typography variant="subtitle2" component="h5" sx={{ fontWeight: 600, mb: 0.25 }}>
													{children}
												</Typography>
											),
											code: ({ children }) => (
												<Box
													component="code"
													sx={{ bgcolor: "action.hover", px: 0.5, py: 0.25, borderRadius: 1, fontSize: 12 }}
												>
													{children}
												</Box>
											),
											table: ({ children }) => (
												<Box sx={{ overflowX: "auto", my: 1 }}>
													<Box component="table" sx={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
														{children}
													</Box>
												</Box>
											),
											thead: ({ children }) => (
												<Box component="thead" sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
													{children}
												</Box>
											),
											th: ({ children }) => (
												<Box component="th" sx={{ textAlign: "left", px: 1, py: 0.5, fontWeight: 600 }}>
													{children}
												</Box>
											),
											td: ({ children }) => (
												<Box component="td" sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: "divider" }}>
													{children}
												</Box>
											),
										}}
									>
										{part.text}
									</Markdown>
								)}
							</Box>
						);
					}
					const toolName = getToolNameFromPart(part);
					if (toolName) {
						return <ToolCallBadge key={key} toolName={toolName} state={(part as any).state ?? "running"} />;
					}
					return null;
				})}
				{/* Show action buttons for draft replies */}
				{!isUser && hasDraftReplyTool(message) && onAction && (
					<DraftActions onEdit={() => onAction("edit")} disabled={isStreaming} />
				)}
			</Box>
		</Box>
	);
}

function AgentChatConnected({
	mailboxId,
	useAgent,
	useAgentChat,
}: {
	mailboxId: string;
	useAgent: typeof import("agents/react").useAgent;
	useAgentChat: typeof import("@cloudflare/ai-chat/react").useAgentChat;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const [inputValue, setInputValue] = useState("");
	const { startCompose } = useUIStore();

	const agent = useAgent({ agent: "EmailAgent", name: mailboxId });
	const { messages, sendMessage, status, clearHistory, stop } = useAgentChat({ agent });
	const isStreaming = status === "streaming" || status === "submitted";

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSend = () => {
		const text = inputValue.trim();
		if (!text || isStreaming) return;
		setInputValue("");
		sendMessage({ text });
		if (inputRef.current) inputRef.current.style.height = "auto";
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const suggestedPrompts = [
		"Show me the latest inbox emails",
		"Any unread emails?",
		"Draft a response to the latest email",
	];

	return (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
			{/* Header */}
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					px: 1.5,
					py: 0.75,
					borderBottom: 1,
					borderColor: "divider",
					flexShrink: 0,
				}}
			>
				<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
					<Chip label="AI" size="small" color="primary" sx={{ height: 20, fontSize: 10, fontWeight: 700 }} />
					<Typography variant="caption" color="text.secondary">
						Email Agent
					</Typography>
				</Box>
				<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
					{isStreaming && <CircularProgress size={14} />}
					{messages.length > 0 && (
						<Tooltip title="Clear chat">
							<IconButton
								size="small"
								onClick={() => {
									if (window.confirm("Clear chat history?")) {
										clearHistory();
									}
								}}
								aria-label="Clear chat"
							>
								<DeleteOutlinedIcon sx={{ fontSize: 14 }} />
							</IconButton>
						</Tooltip>
					)}
				</Box>
			</Box>

			{/* Messages */}
			<Box ref={scrollRef} sx={{ flex: 1, overflowY: "auto", px: 1.5, py: 2 }}>
				{messages.length === 0 ? (
					<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 2 }}>
						<Box
							sx={{
								display: "flex",
								height: 48,
								width: 48,
								alignItems: "center",
								justifyContent: "center",
								borderRadius: 3,
								bgcolor: "action.selected",
							}}
						>
							<SmartToyOutlinedIcon sx={{ fontSize: 24, color: "primary.main" }} />
						</Box>
						<Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", lineHeight: 1.6, px: 2 }}>
							I can read emails, search conversations, and draft replies.
						</Typography>
						<Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, width: "100%" }}>
							{suggestedPrompts.map((prompt) => (
								<ButtonBase
									key={prompt}
									onClick={() => sendMessage({ text: prompt })}
									sx={{
										textAlign: "left",
										px: 1.5,
										py: 1,
										borderRadius: 2,
										border: 1,
										borderColor: "divider",
										fontSize: 12,
										color: "text.primary",
										justifyContent: "flex-start",
										"&:hover": { bgcolor: "action.hover" },
									}}
								>
									{prompt}
								</ButtonBase>
							))}
						</Box>
					</Box>
				) : (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
						{messages.map((msg) => (
							<MessageBubble
								key={msg.id}
								message={msg}
								isStreaming={isStreaming}
								onAction={(action) => {
									if (action !== "edit") return;
									// Extract draft data from the draft_reply tool result
									let draftData: { to?: string; subject?: string; body?: string; id?: string } | null = null;
									for (const part of msg.parts) {
										if ((part as any).toolName === "draft_reply" && (part as any).result) {
											draftData = (part as any).result;
											break;
										}
									}
									if (draftData) {
										const draftEmail = {
											id: draftData.id || "",
											subject: draftData.subject || "",
											sender: mailboxId,
											recipient: draftData.to || "",
											date: new Date().toISOString(),
											read: true,
											starred: false,
											body: draftData.body || "",
										};
										startCompose({
											mode: "reply",
											originalEmail: null,
											draftEmail,
										});
									} else {
										sendMessage({
											text: "Let me edit this draft first. Show me what you have so I can modify it.",
										});
									}
								}}
							/>
						))}
						{isStreaming && (
							<Box sx={{ display: "flex", gap: 1 }}>
								<Avatar sx={{ width: 24, height: 24, bgcolor: "action.selected", color: "text.primary" }}>
									<SmartToyOutlinedIcon sx={{ fontSize: 14 }} />
								</Avatar>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 0.75,
										px: 1.5,
										py: 1,
										borderRadius: 2,
										bgcolor: "background.paper",
										border: 1,
										borderColor: "divider",
									}}
								>
									<CircularProgress size={14} />
									<Typography variant="caption" color="text.secondary">
										Thinking...
									</Typography>
								</Box>
							</Box>
						)}
					</Box>
				)}
			</Box>

			{/* Input */}
			<Box sx={{ flexShrink: 0, borderTop: 1, borderColor: "divider", px: 1.5, py: 1 }}>
				{isStreaming ? (
					<Box sx={{ display: "flex", justifyContent: "center" }}>
						<Button variant="outlined" size="small" startIcon={<StopCircleOutlinedIcon />} onClick={() => stop()}>
							Stop generating
						</Button>
					</Box>
				) : (
					<Box sx={{ display: "flex", alignItems: "flex-end", gap: 0.75 }}>
						<TextField
							inputRef={inputRef}
							id="agent-chat-input"
							name="agent-chat-input"
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Ask your email agent..."
							multiline
							minRows={1}
							maxRows={4}
							fullWidth
							slotProps={{
								input: { sx: { fontSize: 12, borderRadius: 2, py: 1 } },
								htmlInput: { "aria-label": "Chat message input" },
							}}
						/>
						<IconButton
							color="primary"
							disabled={!inputValue.trim()}
							onClick={handleSend}
							aria-label="Send message"
							sx={{ bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.dark" } }}
						>
							<ArrowUpwardIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</Box>
				)}
			</Box>
		</Box>
	);
}

export default function AgentPanel() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const [hooks, setHooks] = useState<{
		useAgent: typeof import("agents/react").useAgent;
		useAgentChat: typeof import("@cloudflare/ai-chat/react").useAgentChat;
	} | null>(null);

	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		Promise.all([import("agents/react"), import("@cloudflare/ai-chat/react")])
			.then(([a, c]) =>
				setHooks({
					useAgent: a.useAgent,
					useAgentChat: c.useAgentChat,
				}),
			)
			.catch((err) => {
				console.error("Failed to load agent modules:", err);
				setLoadError("Failed to connect to agent. Reload to retry.");
			});
	}, []);

	if (loadError) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 1, px: 2, textAlign: "center" }}>
				<Typography variant="caption" color="error">
					{loadError}
				</Typography>
			</Box>
		);
	}

	if (!hooks) {
		return (
			<Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 1 }}>
				<CircularProgress size={20} />
				<Typography variant="caption" color="text.secondary">
					Connecting...
				</Typography>
			</Box>
		);
	}

	return (
		<AgentChatConnected
			mailboxId={mailboxId ?? "default"}
			useAgent={hooks.useAgent}
			useAgentChat={hooks.useAgentChat}
		/>
	);
}
