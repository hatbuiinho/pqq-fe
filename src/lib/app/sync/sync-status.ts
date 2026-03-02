import { writable } from 'svelte/store';

export type SyncConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

export type SyncStatusSnapshot = {
	online: boolean;
	isSyncing: boolean;
	connectionState: SyncConnectionState;
	pendingCount: number;
	failedCount: number;
	lastSyncAt?: string;
	lastError?: string;
};

const initialState: SyncStatusSnapshot = {
	online: typeof navigator === 'undefined' ? true : navigator.onLine,
	isSyncing: false,
	connectionState: 'idle',
	pendingCount: 0,
	failedCount: 0
};

export const syncStatus = writable<SyncStatusSnapshot>(initialState);

export function updateSyncStatus(patch: Partial<SyncStatusSnapshot>): void {
	syncStatus.update((current) => ({ ...current, ...patch }));
}
