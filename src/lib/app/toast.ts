import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export type ToastItem = {
	id: string;
	type: ToastType;
	message: string;
	durationMs: number;
};

const defaultDurationMs = 3000;
export const toasts = writable<ToastItem[]>([]);

function pushToast(type: ToastType, message: string, durationMs = defaultDurationMs) {
	const id = crypto.randomUUID();
	const toast: ToastItem = { id, type, message, durationMs };

	toasts.update((items) => [...items, toast]);

	setTimeout(() => {
		removeToast(id);
	}, durationMs);

	return id;
}

export function toastSuccess(message: string, durationMs?: number) {
	return pushToast('success', message, durationMs);
}

export function toastError(message: string, durationMs?: number) {
	return pushToast('error', message, durationMs);
}

export function toastInfo(message: string, durationMs?: number) {
	return pushToast('info', message, durationMs);
}

export function removeToast(id: string) {
	toasts.update((items) => items.filter((item) => item.id !== id));
}
