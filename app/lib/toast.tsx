import { ToastCard, ToastStack } from "~/shell/Toast";
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

export function addToast(input: ToastInput): string {
	const id = `toast-${++seq}`;
	// At most three on screen; the oldest goes first.
	toasts = [...toasts.slice(-2), { ...input, id }];
	emit();
	return id;
}

export function closeToast(id: string) {
	toasts = toasts.filter((t) => t.id !== id);
	emit();
}

/** Same shape as the Kumo manager this replaced: { add, close }. */
export function useToast() {
	const current = useSyncExternalStore(subscribe, snapshot, snapshot);
	return { toasts: current, add: addToast, close: closeToast };
}

/** Mounted once in the root layout. Toasts close themselves (hover pauses); ones with an action (Undo) stay longer. */
export function Toaster() {
	const current = useSyncExternalStore(subscribe, snapshot, snapshot);
	if (current.length === 0) return null;
	return (
		<ToastStack>
			{current.map((toast) => (
				<ToastCard
					key={toast.id}
					message={toast.title}
					variant={toast.variant ?? (toast.actions?.length ? "info" : "success")}
					timeout={toast.timeout ?? (toast.actions?.length ? 8000 : 5000)}
					actions={toast.actions?.map((a) => ({ label: a.children, onClick: () => void a.onClick() }))}
					onClose={() => closeToast(toast.id)}
				/>
			))}
		</ToastStack>
	);
}
