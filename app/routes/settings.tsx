// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BeachAccessOutlinedIcon from "@mui/icons-material/BeachAccessOutlined";
import ForwardOutlinedIcon from "@mui/icons-material/ForwardOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useParams } from "react-router";
import { formatBytes } from "~/lib/utils";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import api from "~/services/api";
import { useToast } from "~/lib/toast";
import { AGENT_MODELS, DEFAULT_AGENT_MODEL } from "shared/ai-models";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

/** ISO string to a `datetime-local` value in local time. */
function isoToLocal(iso?: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value (local time) to an ISO string, or "" for none. */
function localToIso(local: string): string {
	if (!local) return "";
	const d = new Date(local);
	return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function Section({
	icon,
	title,
	aside,
	children,
}: {
	icon: ReactNode;
	title: string;
	aside?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
			<Box sx={{ mb: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
				<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
					<Box sx={{ display: "flex", color: "text.secondary" }}>{icon}</Box>
					<Typography variant="body2" sx={{ fontWeight: 500 }}>
						{title}
					</Typography>
				</Box>
				{aside}
			</Box>
			{children}
		</Paper>
	);
}

function Toggle({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
}) {
	return (
		<FormControlLabel
			control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} size="small" />}
			label={<Typography variant="body2">{label}</Typography>}
			sx={{ alignItems: "flex-start", ml: 0, "& .MuiFormControlLabel-label": { pt: 0.5 } }}
		/>
	);
}

function UsageBar({ value, max, label }: { value: number; max: number; label: string }) {
	const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
	const color = pct > 90 ? "error" : pct > 70 ? "warning" : "primary";
	return (
		<LinearProgress
			variant="determinate"
			value={pct}
			color={color}
			aria-label={label}
			sx={{ height: 8, borderRadius: 999 }}
		/>
	);
}

const captionSx = { display: "block", mt: 0.5 };

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toast = useToast();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();
	const { data: stats } = useQuery({
		queryKey: ["stats", mailboxId],
		queryFn: () => api.getStats(mailboxId!),
		enabled: !!mailboxId,
	});

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [sigEnabled, setSigEnabled] = useState(false);
	const [sigText, setSigText] = useState("");
	const [arEnabled, setArEnabled] = useState(false);
	const [arSubject, setArSubject] = useState("");
	const [arMessage, setArMessage] = useState("");
	const [arStart, setArStart] = useState("");
	const [arEnd, setArEnd] = useState("");
	const [fwdEnabled, setFwdEnabled] = useState(false);
	const [fwdEmail, setFwdEmail] = useState("");
	const [autoDraft, setAutoDraft] = useState(false);
	const [agentModel, setAgentModel] = useState(DEFAULT_AGENT_MODEL);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!mailbox) return;
		const st = mailbox.settings;
		setAutoDraft(!!st?.agent?.autoDraft);
		setAgentModel(st?.agent?.model || DEFAULT_AGENT_MODEL);
		setDisplayName(st?.fromName || mailbox.name || "");
		setAgentPrompt(st?.agentSystemPrompt || "");
		setSigEnabled(!!st?.signature?.enabled);
		setSigText(st?.signature?.text || "");
		setArEnabled(!!st?.autoReply?.enabled);
		setArSubject(st?.autoReply?.subject || "");
		setArMessage(st?.autoReply?.message || "");
		setArStart(isoToLocal(st?.autoReply?.startsAt));
		setArEnd(isoToLocal(st?.autoReply?.endsAt));
		setFwdEnabled(!!st?.forwarding?.enabled);
		setFwdEmail(st?.forwarding?.email || "");
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		if (arEnabled && !arMessage.trim()) {
			toast.add({ title: "Write an auto-reply message first", variant: "error" });
			return;
		}
		const fwd = fwdEmail.trim();
		if (fwdEnabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fwd)) {
			toast.add({ title: "Enter the address to forward to", variant: "error" });
			return;
		}
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			agent: { autoDraft, model: agentModel },
			// Plain-text signature only; an old HTML version is dropped so the two can't disagree.
			signature: { enabled: sigEnabled, text: sigText },
			autoReply: {
				enabled: arEnabled,
				subject: arSubject,
				message: arMessage,
				startsAt: localToIso(arStart),
				endsAt: localToIso(arEnd),
			},
			forwarding: { enabled: fwdEnabled, email: fwd },
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toast.add({ title: "Settings saved!" });
		} catch {
			toast.add({ title: "Failed to save settings", variant: "error" });
		} finally {
			setIsSaving(false);
		}
	};

	if (!mailbox) {
		return (
			<Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
				<CircularProgress />
			</Box>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<Box sx={{ maxWidth: 672, px: { xs: 2, md: 4 }, py: { xs: 2, md: 3 }, height: "100%", overflowY: "auto" }}>
			<Typography variant="h6" sx={{ fontSize: 18, fontWeight: 600, mb: 3 }}>
				Settings
			</Typography>

			<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
				<Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
					<Typography variant="body2" sx={{ fontWeight: 500, mb: 2 }}>
						Account
					</Typography>
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
						<TextField
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							fullWidth
							size="small"
						/>
						<TextField label="Email" type="email" value={mailbox.email} disabled fullWidth size="small" />
					</Box>
				</Paper>

				<Section icon={<AttachFileOutlinedIcon fontSize="small" />} title="Signature">
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
						<Toggle
							checked={sigEnabled}
							onChange={setSigEnabled}
							label="Add a signature to new messages, replies and forwards"
						/>
						<TextField
							value={sigText}
							onChange={(e) => setSigText(e.target.value)}
							multiline
							minRows={4}
							placeholder="Your name"
							fullWidth
							size="small"
							slotProps={{ htmlInput: { "aria-label": "Signature" } }}
						/>
					</Box>
				</Section>

				<Section
					icon={<BeachAccessOutlinedIcon fontSize="small" />}
					title="Vacation auto-reply"
					aside={
						<Chip
							size="small"
							label={arEnabled ? "On" : "Off"}
							color={arEnabled ? "primary" : "default"}
							variant={arEnabled ? "filled" : "outlined"}
						/>
					}
				>
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
						<Toggle
							checked={arEnabled}
							onChange={setArEnabled}
							label="Reply automatically to people who write to you"
						/>
						<TextField
							label="Subject (leave empty to use Re: their subject)"
							value={arSubject}
							onChange={(e) => setArSubject(e.target.value)}
							fullWidth
							size="small"
						/>
						<TextField
							value={arMessage}
							onChange={(e) => setArMessage(e.target.value)}
							multiline
							minRows={5}
							placeholder="I am away until Monday and will reply when I am back."
							fullWidth
							size="small"
							slotProps={{ htmlInput: { "aria-label": "Auto-reply message" } }}
						/>
						<Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { sm: "1fr 1fr" } }}>
							<TextField
								label="Starts (optional)"
								type="datetime-local"
								value={arStart}
								onChange={(e) => setArStart(e.target.value)}
								size="small"
								slotProps={{ inputLabel: { shrink: true } }}
							/>
							<TextField
								label="Ends (optional)"
								type="datetime-local"
								value={arEnd}
								onChange={(e) => setArEnd(e.target.value)}
								size="small"
								slotProps={{ inputLabel: { shrink: true } }}
							/>
						</Box>
						<Typography variant="caption" color="text.secondary">
							Each sender gets at most one reply every 4 days. Mailing lists, automated mail and no-reply
							senders never get one. Replies count against the daily send limit.
						</Typography>
					</Box>
				</Section>

				<Section
					icon={<ForwardOutlinedIcon fontSize="small" />}
					title="Forwarding"
					aside={
						<Chip
							size="small"
							label={fwdEnabled ? "On" : "Off"}
							color={fwdEnabled ? "primary" : "default"}
							variant={fwdEnabled ? "filled" : "outlined"}
						/>
					}
				>
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
						<Toggle
							checked={fwdEnabled}
							onChange={setFwdEnabled}
							label="Also send a copy of every incoming email to another address"
						/>
						<TextField
							label="Forward to"
							type="email"
							value={fwdEmail}
							onChange={(e) => setFwdEmail(e.target.value)}
							placeholder="you@example.com"
							fullWidth
							size="small"
						/>
						<Typography variant="caption" color="text.secondary">
							Mail stays in this inbox too. The address must first be added and verified under Email Routing →
							Destination addresses in the Cloudflare dashboard, or forwarding silently does nothing. Forwarding
							doesn't count against the daily send limit.
						</Typography>
					</Box>
				</Section>

				<Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
					<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<AutoAwesomeOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
							<Typography variant="body2" sx={{ fontWeight: 500 }}>
								AI Agent Prompt
							</Typography>
							<Chip
								size="small"
								label={isCustomPrompt ? "Custom" : "Default"}
								color={isCustomPrompt ? "primary" : "default"}
								variant={isCustomPrompt ? "filled" : "outlined"}
							/>
						</Box>
						{isCustomPrompt && (
							<Button size="small" startIcon={<RestartAltIcon sx={{ fontSize: 14 }} />} onClick={() => setAgentPrompt("")}>
								Reset to default
							</Button>
						)}
					</Box>
					<Box sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1.5, borderBottom: 1, borderColor: "divider", pb: 2 }}>
						<Toggle
							checked={autoDraft}
							onChange={setAutoDraft}
							label="Draft a reply to every new email automatically"
						/>
						<Typography variant="caption" color="text.secondary">
							Off by default. Each auto-draft uses Workers AI Neurons (roughly 50 to 150 per email, including the
							safety scans). Auto-drafting stops for the day at 90% of the free 10,000 daily Neurons. The chat panel
							works either way.
						</Typography>
						<FormControl size="small" fullWidth>
							<TextField
								select
								label="Model"
								value={agentModel}
								onChange={(e) => setAgentModel(e.target.value)}
								size="small"
							>
								{AGENT_MODELS.map((m) => (
									<MenuItem key={m.id} value={m.id}>
										{m.label}
									</MenuItem>
								))}
							</TextField>
						</FormControl>
					</Box>
					<Typography variant="caption" color="text.secondary" sx={captionSx}>
						Customize how the AI agent behaves for this mailbox. Leave empty to use the built-in default prompt.
					</Typography>
					<TextField
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						multiline
						minRows={12}
						fullWidth
						size="small"
						sx={{ mt: 1, "& textarea": { fontFamily: "monospace", fontSize: 12, lineHeight: 1.6 } }}
					/>
					<Typography variant="caption" color="text.secondary" sx={captionSx}>
						The prompt is sent as the system message to the AI model. It controls the agent's personality, writing
						style, and behavior rules.
					</Typography>
				</Paper>

				<Section icon={<StorageOutlinedIcon fontSize="small" />} title="Usage">
					{stats ? (
						<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
							<Box>
								<Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
									<Typography variant="body2">Mailbox database</Typography>
									<Typography variant="body2">
										{formatBytes(stats.storage.databaseBytes)} of {formatBytes(stats.storage.databaseLimitBytes, 0)}
									</Typography>
								</Box>
								<UsageBar
									label="Mailbox database"
									value={stats.storage.databaseBytes}
									max={stats.storage.databaseLimitBytes}
								/>
								<Typography variant="caption" color="text.secondary" sx={captionSx}>
									{stats.storage.emails.toLocaleString()} messages. Attachments ({stats.storage.attachments.toLocaleString()},{" "}
									{formatBytes(stats.storage.attachmentBytes)}) are stored separately in R2.
								</Typography>
							</Box>
							<Box>
								<Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
									<Typography variant="body2">Recipients sent today (UTC)</Typography>
									<Typography variant="body2">
										{stats.quota.used} of {stats.quota.limit}
									</Typography>
								</Box>
								<UsageBar label="Recipients sent today" value={stats.quota.used} max={stats.quota.limit} />
								{stats.quota.pausedUntil ? (
									<Typography variant="caption" sx={{ color: "error.main", ...captionSx }}>
										Sending is paused until {new Date(stats.quota.pausedUntil).toLocaleString()} (Resend quota).
									</Typography>
								) : null}
							</Box>
							<Box>
								<Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
									<Typography variant="body2">Workers AI today (UTC, estimate)</Typography>
									<Typography variant="body2">
										{Math.round(stats.ai.neurons).toLocaleString()} of {stats.ai.limit.toLocaleString()} Neurons
									</Typography>
								</Box>
								<UsageBar label="Workers AI Neurons today" value={stats.ai.neurons} max={stats.ai.limit} />
								<Typography variant="caption" color="text.secondary" sx={captionSx}>
									{stats.ai.models.length === 0
										? "No AI calls today."
										: stats.ai.models
												.map((m) => `${m.model.split("/").pop()}: ${m.calls} calls, ${Math.round(m.neurons)} Neurons`)
												.join(" · ")}{" "}
									The free allocation is shared by everything on this Cloudflare account.
								</Typography>
							</Box>
						</Box>
					) : (
						<CircularProgress size={20} />
					)}
				</Section>

				<Box sx={{ display: "flex", justifyContent: "flex-end" }}>
					<Button
						variant="contained"
						onClick={handleSave}
						disabled={isSaving}
						startIcon={isSaving ? <CircularProgress size={14} color="inherit" /> : undefined}
					>
						Save Changes
					</Button>
				</Box>
			</Box>
		</Box>
	);
}
