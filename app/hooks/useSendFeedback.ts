import { useKumoToastManager } from "@cloudflare/kumo";
import { useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { QueuedSend } from "~/types";

/**
 * Shared send UX: the compose-time suppression warning and the
 * "Sending… Undo" toast that cancels a queued message within its window.
 */
export function useSendFeedback() {
	const toastManager = useKumoToastManager();
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
		return window.confirm(
			`These recipients are on the suppression list. Resend will not deliver to them:\n\n${lines}\n\nSend anyway?`,
		);
	}

	function notifyQueued(mailboxId: string, result: QueuedSend | undefined) {
		refresh(mailboxId);
		if (!result?.id || !result.send_at) {
			toastManager.add({ title: "Email queued" });
			return;
		}
		const windowMs = Math.max(result.send_at - Date.now(), 0);
		if (windowMs < 1000) {
			toastManager.add({ title: "Sending…" });
			return;
		}
		const toastId = toastManager.add({
			title: "Sending…",
			timeout: windowMs,
			actions: [
				{
					children: "Undo",
					onClick: async () => {
						toastManager.close(toastId);
						try {
							await api.cancelSend(mailboxId, result.id);
							toastManager.add({ title: "Send cancelled. Message moved to Drafts." });
						} catch (err) {
							const msg = err instanceof Error ? err.message : "";
							toastManager.add({ title: msg ? `Too late to undo: ${msg}` : "Too late to undo", variant: "error" });
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
