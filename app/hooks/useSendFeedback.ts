import { useQueryClient } from "@tanstack/react-query";
import { confirmDialog } from "~/lib/confirm";
import { useToast } from "~/lib/toast";
import api from "~/services/api";
import type { QueuedSend } from "~/types";

/**
 * Shared send UX: the compose-time suppression warning and the
 * "Sending… Undo" toast that cancels a queued message within its window.
 */
export function useSendFeedback() {
	const toast = useToast();
	const qc = useQueryClient();

	const refresh = (mailboxId: string) => {
		qc.invalidateQueries({ queryKey: ["emails", mailboxId] });
		qc.invalidateQueries({ queryKey: ["folders", mailboxId] });
	};

	/** Resolves false if a recipient is suppressed and the user declines to send. */
	async function confirmSuppressed(mailboxId: string, recipients: string[]): Promise<boolean> {
		if (recipients.length === 0) return true;
		let suppressed: Array<{ email: string; origin: string | null }> = [];
		try {
			({ suppressed } = await api.checkSuppressions(mailboxId, recipients));
		} catch {
			return true; // The warning is advisory; never block a send on it.
		}
		if (suppressed.length === 0) return true;
		const lines = suppressed.map((s) => `• ${s.email}${s.origin ? ` (${s.origin})` : ""}`).join("\n");
		return confirmDialog({
			title: "Some recipients can't receive mail",
			body: `These addresses are on the suppression list, so Resend will not deliver to them:\n\n${lines}`,
			confirmLabel: "Send anyway",
			cancelLabel: "Cancel",
		});
	}

	function notifyQueued(mailboxId: string, result: QueuedSend | undefined) {
		refresh(mailboxId);
		if (!result?.id || !result.send_at) {
			toast.add({ title: "Email queued" });
			return;
		}
		const windowMs = Math.max(result.send_at - Date.now(), 0);
		if (windowMs > 60_000) {
			// Scheduled: it waits in the outbox and can be cancelled from here until it goes out.
			const when = new Date(result.send_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
			toast.add({
				title: `Scheduled for ${when}`,
				actions: [
					{
						children: "Cancel",
						onClick: async () => {
							try {
								await api.cancelSend(mailboxId, result.id);
								toast.add({ title: "Schedule cancelled. Message moved to Drafts." });
							} catch (err) {
								toast.add({ title: err instanceof Error ? err.message : "Could not cancel", variant: "error" });
							} finally {
								refresh(mailboxId);
							}
						},
					},
				],
			});
			return;
		}
		if (windowMs < 1000) {
			toast.add({ title: "Sending…" });
			return;
		}
		toast.add({
			title: "Sending…",
			timeout: windowMs,
			actions: [
				{
					children: "Undo",
					onClick: async () => {
						try {
							await api.cancelSend(mailboxId, result.id);
							toast.add({ title: "Send cancelled. Message moved to Drafts." });
						} catch (err) {
							const msg = err instanceof Error ? err.message : "";
							toast.add({ title: msg ? `Too late to undo: ${msg}` : "Too late to undo", variant: "error" });
						} finally {
							refresh(mailboxId);
						}
					},
				},
			],
		});
		// Refresh once the window closes so Sent shows the delivery state.
		setTimeout(() => refresh(mailboxId), windowMs + 2000);
	}

	return { confirmSuppressed, notifyQueued };
}
