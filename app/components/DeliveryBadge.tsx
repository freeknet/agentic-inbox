import { Tooltip } from "@cloudflare/kumo";

const LABELS: Record<string, { label: string; className: string; hint: string }> = {
	queued: { label: "Queued", className: "text-kumo-subtle", hint: "Waiting in the outbox" },
	sent: { label: "Sent", className: "text-kumo-subtle", hint: "Accepted by Resend" },
	delayed: { label: "Delayed", className: "text-kumo-warning", hint: "The recipient's server is deferring delivery" },
	delivered: { label: "Delivered", className: "text-kumo-success", hint: "Accepted by the recipient's server" },
	bounced: { label: "Bounced", className: "text-kumo-destructive", hint: "The recipient's server rejected it" },
	complained: { label: "Spam report", className: "text-kumo-destructive", hint: "The recipient marked it as spam" },
	failed: { label: "Failed", className: "text-kumo-destructive", hint: "Could not be sent" },
	suppressed: { label: "Suppressed", className: "text-kumo-destructive", hint: "Recipient is on the suppression list; not sent" },
};

/** Outbound delivery state for messages in Sent (fed by Resend webhooks). */
export function DeliveryBadge({ status }: { status?: string | null }) {
	if (!status) return null;
	const info = LABELS[status];
	if (!info) return null;
	return (
		<Tooltip content={info.hint} asChild>
			<span className={`shrink-0 text-xs font-medium ${info.className}`}>{info.label}</span>
		</Tooltip>
	);
}
