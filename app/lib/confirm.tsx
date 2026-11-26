import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { useSyncExternalStore } from "react";

export interface ConfirmOptions {
	title: string;
	body?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
	id: number;
	resolve: (ok: boolean) => void;
}

let pending: PendingConfirm | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function snapshot() {
	return pending;
}

/** Ask the user to confirm; resolves true when they accept. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => {
		if (pending) {
			// Only one prompt at a time: the previous one resolves false.
			pending.resolve(false);
		}
		pending = { id: ++seq, ...options, resolve };
		emit();
	});
}

function settle(ok: boolean) {
	const current = pending;
	pending = null;
	emit();
	current?.resolve(ok);
}

/** Mounted once in the root layout. */
export function ConfirmHost() {
	const current = useSyncExternalStore(subscribe, snapshot, snapshot);
	if (!current) return null;
	return (
		<Dialog
			open
			onClose={() => settle(false)}
			fullWidth
			maxWidth="xs"
			aria-labelledby="confirm-title"
		>
			<DialogTitle id="confirm-title">{current.title}</DialogTitle>
			{current.body && (
				<DialogContent>
					<DialogContentText sx={{ whiteSpace: "pre-line" }}>{current.body}</DialogContentText>
				</DialogContent>
			)}
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={() => settle(false)}>{current.cancelLabel ?? "Cancel"}</Button>
				<Button
					autoFocus
					variant="contained"
					color={current.destructive ? "error" : "primary"}
					onClick={() => settle(true)}
				>
					{current.confirmLabel ?? "Confirm"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
