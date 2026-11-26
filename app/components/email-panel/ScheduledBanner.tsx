import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "~/services/api";

/** Shown on a message that is still waiting in the outbox (send later), with a way to cancel it. */
export default function ScheduledBanner({ mailboxId, emailId }: { mailboxId: string; emailId: string }) {
	const qc = useQueryClient();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { data } = useQuery({
		queryKey: ["outbox", mailboxId, emailId],
		queryFn: () => api.getOutboxEntry(mailboxId, emailId),
		retry: false,
	});
	if (!data || data.status !== "queued" || data.send_at - Date.now() < 15_000) return null;

	const when = new Date(data.send_at).toLocaleString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
	const cancel = async () => {
		setBusy(true);
		setError(null);
		try {
			await api.cancelSend(mailboxId, emailId);
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["emails", mailboxId] }),
				qc.invalidateQueries({ queryKey: ["folders", mailboxId] }),
				qc.invalidateQueries({ queryKey: ["outbox", mailboxId, emailId] }),
			]);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not cancel");
		} finally {
			setBusy(false);
		}
	};

	return (
		<Alert
			severity="info"
			icon={false}
			sx={{ mx: { xs: 2, md: 3 }, mt: 1.5 }}
			action={
				<Button color="inherit" size="small" disabled={busy} onClick={cancel}>
					{busy ? <CircularProgress size={14} color="inherit" /> : "Cancel send"}
				</Button>
			}
		>
			Scheduled to send {when}
			{error && (
				<Box component="span" sx={{ ml: 1, color: "error.main" }}>
					{error}
				</Box>
			)}
		</Alert>
	);
}
