import { Button } from "@cloudflare/kumo";
import { ClockIcon } from "@phosphor-icons/react";
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

	const when = new Date(data.send_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
		<div className="mx-4 mt-3 flex items-center gap-3 rounded-md border border-kumo-line bg-kumo-elevated px-3 py-2 text-sm md:mx-6">
			<ClockIcon size={16} className="shrink-0 text-kumo-subtle" />
			<span className="flex-1 text-kumo-default">
				Scheduled to send {when}
				{error && <span className="ml-2 text-kumo-danger">{error}</span>}
			</span>
			<Button size="xs" variant="secondary" loading={busy} onClick={cancel}>
				Cancel send
			</Button>
		</div>
	);
}
