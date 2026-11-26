import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

const LABELS: Record<
	string,
	{ label: string; color: "text.secondary" | "warning.main" | "success.main" | "error.main"; hint: string }
> = {
	queued: { label: "Queued", color: "text.secondary", hint: "Waiting in the outbox" },
	sent: { label: "Sent", color: "text.secondary", hint: "Accepted by Resend" },
	delayed: { label: "Delayed", color: "warning.main", hint: "The recipient's server is deferring delivery" },
	delivered: { label: "Delivered", color: "success.main", hint: "Accepted by the recipient's server" },
	bounced: { label: "Bounced", color: "error.main", hint: "The recipient's server rejected it" },
	complained: { label: "Spam report", color: "error.main", hint: "The recipient marked it as spam" },
	failed: { label: "Failed", color: "error.main", hint: "Could not be sent" },
	suppressed: {
		label: "Suppressed",
		color: "error.main",
		hint: "Recipient is on the suppression list; not sent",
	},
};

/** Outbound delivery state for messages in Sent (fed by Resend webhooks). */
export function DeliveryBadge({ status }: { status?: string | null }) {
	if (!status) return null;
	const info = LABELS[status];
	if (!info) return null;
	return (
		<Tooltip title={info.hint}>
			<Typography variant="caption" sx={{ flexShrink: 0, fontWeight: 500, color: info.color }}>
				{info.label}
			</Typography>
		</Tooltip>
	);
}
