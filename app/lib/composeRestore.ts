/**
 * An unsent message survives a refresh: while composing, the fields are kept
 * in this tab's sessionStorage, and the mailbox reopens compose with them on
 * load. Cleared when compose closes (sent, discarded or closed). Attachments
 * aren't kept (they're uploads in flight); the restored message says so.
 */
import type { ComposeMode } from "~/hooks/useUIStore";

const KEY = "mail-compose";

export interface SavedCompose {
	mailboxId: string;
	mode: ComposeMode;
	/** The message replied to or forwarded, refetched on restore. */
	originalId?: string | null;
	/** The draft being edited, refetched on restore. */
	draftId?: string | null;
	to: string;
	cc: string;
	bcc: string;
	subject: string;
	body: string;
	hadAttachments?: boolean;
	/** Finished uploads (attachments and Drive links), restored as they were. */
	files?: { key: string; filename: string; size: number; status: "done"; uploadId?: string }[];
	driveLinks?: { key: string; filename: string; size: number; status: "done"; sent: number; url?: string; expiresAt?: number | null }[];
}

export function saveCompose(state: SavedCompose) {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(state));
	} catch {
		// Private mode or full storage: nothing to keep.
	}
}

export function clearCompose() {
	try {
		sessionStorage.removeItem(KEY);
	} catch {}
}

export function loadCompose(mailboxId: string): SavedCompose | null {
	try {
		const raw = sessionStorage.getItem(KEY);
		if (!raw) return null;
		const saved = JSON.parse(raw) as SavedCompose;
		return saved.mailboxId === mailboxId ? saved : null;
	} catch {
		return null;
	}
}
