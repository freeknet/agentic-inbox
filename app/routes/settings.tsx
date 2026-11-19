// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { AirplaneTiltIcon, ArrowCounterClockwiseIcon, DatabaseIcon, RobotIcon, SignatureIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useParams } from "react-router";
import { formatBytes } from "~/lib/utils";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import api from "~/services/api";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

const textareaClass =
	"w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring";
const dateInputClass = "mt-1 w-full rounded border border-kumo-line bg-kumo-recessed px-2 py-1 text-sm text-kumo-default";

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

function Section({ icon, title, aside, children }: { icon: ReactNode; title: string; aside?: ReactNode; children: ReactNode }) {
	return (
		<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
			<div className="mb-4 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					{icon}
					<span className="text-sm font-medium text-kumo-default">{title}</span>
				</div>
				{aside}
			</div>
			{children}
		</div>
	);
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
	return (
		<label className="flex cursor-pointer items-center gap-2 text-sm text-kumo-default">
			<input type="checkbox" className="h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
			{label}
		</label>
	);
}

function UsageBar({ value, max, label }: { value: number; max: number; label: string }) {
	const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
	const color = pct > 90 ? "bg-kumo-danger" : pct > 70 ? "bg-kumo-warning" : "bg-kumo-brand";
	return (
		<div
			className="h-2 w-full overflow-hidden rounded-full bg-kumo-fill"
			role="meter"
			aria-label={label}
			aria-valuenow={value}
			aria-valuemin={0}
			aria-valuemax={max}
		>
			<div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
		</div>
	);
}

const iconClass = "text-kumo-subtle";

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
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
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!mailbox) return;
		const st = mailbox.settings;
		setDisplayName(st?.fromName || mailbox.name || "");
		setAgentPrompt(st?.agentSystemPrompt || "");
		setSigEnabled(!!st?.signature?.enabled);
		setSigText(st?.signature?.text || "");
		setArEnabled(!!st?.autoReply?.enabled);
		setArSubject(st?.autoReply?.subject || "");
		setArMessage(st?.autoReply?.message || "");
		setArStart(isoToLocal(st?.autoReply?.startsAt));
		setArEnd(isoToLocal(st?.autoReply?.endsAt));
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		if (arEnabled && !arMessage.trim()) {
			toastManager.add({ title: "Write an auto-reply message first", variant: "error" });
			return;
		}
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			// Plain-text signature only; an old HTML version is dropped so the two can't disagree.
			signature: { enabled: sigEnabled, text: sigText },
			autoReply: {
				enabled: arEnabled,
				subject: arSubject,
				message: arMessage,
				startsAt: localToIso(arStart),
				endsAt: localToIso(arEnd),
			},
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({ title: "Failed to save settings", variant: "error" });
		} finally {
			setIsSaving(false);
		}
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">Account</div>
					<div className="space-y-3">
						<Input label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				<Section icon={<SignatureIcon size={16} weight="duotone" className={iconClass} />} title="Signature">
					<div className="space-y-3">
						<Toggle checked={sigEnabled} onChange={setSigEnabled} label="Add a signature to new messages, replies and forwards" />
						<textarea
							value={sigText}
							onChange={(e) => setSigText(e.target.value)}
							rows={4}
							placeholder="Your name"
							className={textareaClass}
							aria-label="Signature"
						/>
					</div>
				</Section>

				<Section
					icon={<AirplaneTiltIcon size={16} weight="duotone" className={iconClass} />}
					title="Vacation auto-reply"
					aside={arEnabled ? <Badge variant="primary">On</Badge> : <Badge variant="secondary">Off</Badge>}
				>
					<div className="space-y-3">
						<Toggle checked={arEnabled} onChange={setArEnabled} label="Reply automatically to people who write to you" />
						<Input label="Subject (leave empty to use Re: their subject)" value={arSubject} onChange={(e) => setArSubject(e.target.value)} />
						<textarea
							value={arMessage}
							onChange={(e) => setArMessage(e.target.value)}
							rows={5}
							placeholder="I am away until Monday and will reply when I am back."
							className={textareaClass}
							aria-label="Auto-reply message"
						/>
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="text-xs text-kumo-subtle">
								Starts (optional)
								<input type="datetime-local" value={arStart} onChange={(e) => setArStart(e.target.value)} className={dateInputClass} />
							</label>
							<label className="text-xs text-kumo-subtle">
								Ends (optional)
								<input type="datetime-local" value={arEnd} onChange={(e) => setArEnd(e.target.value)} className={dateInputClass} />
							</label>
						</div>
						<p className="text-xs text-kumo-subtle">
							Each sender gets at most one reply every 4 days. Mailing lists, automated mail and no-reply senders never get one.
							Replies count against the daily send limit.
						</p>
					</div>
				</Section>

				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className={iconClass} />
							<span className="text-sm font-medium text-kumo-default">AI Agent Prompt</span>
							{isCustomPrompt ? <Badge variant="primary">Custom</Badge> : <Badge variant="secondary">Default</Badge>}
						</div>
						{isCustomPrompt && (
							<Button variant="ghost" size="xs" icon={<ArrowCounterClockwiseIcon size={14} />} onClick={() => setAgentPrompt("")}>
								Reset to default
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the AI agent behaves for this mailbox. Leave empty to use the built-in default prompt.
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						The prompt is sent as the system message to the AI model. It controls the agent's personality, writing style, and behavior rules.
					</p>
				</div>

				<Section icon={<DatabaseIcon size={16} weight="duotone" className={iconClass} />} title="Usage">
					{stats ? (
						<div className="space-y-4 text-sm">
							<div className="space-y-1">
								<div className="flex justify-between text-kumo-default">
									<span>Mailbox database</span>
									<span>
										{formatBytes(stats.storage.databaseBytes)} of {formatBytes(stats.storage.databaseLimitBytes, 0)}
									</span>
								</div>
								<UsageBar label="Mailbox database" value={stats.storage.databaseBytes} max={stats.storage.databaseLimitBytes} />
								<p className="text-xs text-kumo-subtle">
									{stats.storage.emails.toLocaleString()} messages. Attachments ({stats.storage.attachments.toLocaleString()},{" "}
									{formatBytes(stats.storage.attachmentBytes)}) are stored separately in R2.
								</p>
							</div>
							<div className="space-y-1">
								<div className="flex justify-between text-kumo-default">
									<span>Recipients sent today (UTC)</span>
									<span>
										{stats.quota.used} of {stats.quota.limit}
									</span>
								</div>
								<UsageBar label="Recipients sent today" value={stats.quota.used} max={stats.quota.limit} />
								{stats.quota.pausedUntil ? (
									<p className="text-xs text-kumo-danger">
										Sending is paused until {new Date(stats.quota.pausedUntil).toLocaleString()} (Resend quota).
									</p>
								) : null}
							</div>
						</div>
					) : (
						<Loader size="sm" />
					)}
				</Section>

				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
