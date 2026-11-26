import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import { useSyncExternalStore } from "react";

export interface ToastAction {
	children: React.ReactNode;
	onClick: () => void | Promise<void>;
}

export interface ToastInput {
	title: string;
	variant?: "error" | "success" | "info";
	actions?: ToastAction[];
	/** Milliseconds the toast stays; omitted means 6 seconds. */
	timeout?: number;
}

interface Toast extends ToastInput {
	id: string;
}

let toasts: Toast[] = [];
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
	return toasts;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function addToast(input: ToastInput): string {
	const id = `toast-${++seq}`;
	toasts = [...toasts, { ...input, id }];
	emit();
	// Toasts close themselves; ones with an action (Undo) get a little longer.
	const ms = input.timeout ?? (input.actions?.length ? 8000 : 6000);
	timers.set(id, setTimeout(() => closeToast(id), ms));
	return id;
}

export function closeToast(id: string) {
	const timer = timers.get(id);
	if (timer) clearTimeout(timer);
	timers.delete(id);
	toasts = toasts.filter((t) => t.id !== id);
	emit();
}

/** Same shape as the Kumo manager this replaced: { add, close }. */
export function useToast() {
	const current = useSyncExternalStore(subscribe, snapshot, snapshot);
	return { toasts: current, add: addToast, close: closeToast };
}

/** Mounted once in the root layout. */
export function Toaster() {
	const current = useSyncExternalStore(subscribe, snapshot, snapshot);
	if (current.length === 0) return null;
	return (
		<Stack
			spacing={1}
			sx={{
				position: "fixed",
				bottom: 16,
				left: 16,
				zIndex: (t) => t.zIndex.snackbar,
				maxWidth: 420,
			}}
		>
			{current.map((toast) => (
				<Snackbar
					key={toast.id}
					open
					anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
					sx={{ position: "static", transform: "none" }}
				>
					<Alert
						severity={toast.variant === "error" ? "error" : "info"}
						variant="filled"
						// Same look as Drive's snackbar: dark for everything but errors, no icon.
						icon={toast.variant === "error" ? undefined : false}
						sx={{ alignItems: "center", ...(toast.variant !== "error" && { bgcolor: "#323232", color: "#fff" }) }}
						onClose={() => closeToast(toast.id)}
						action={
							toast.actions?.map((action, i) => (
								<Button
									key={i}
									color="inherit"
									size="small"
									onClick={() => {
										closeToast(toast.id);
										void action.onClick();
									}}
								>
									{action.children}
								</Button>
							)) ?? undefined
						}
					>
						{toast.title}
					</Alert>
				</Snackbar>
			))}
		</Stack>
	);
}
