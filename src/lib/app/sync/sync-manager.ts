import { browser } from '$app/environment';
import { getDB } from '$lib/data/local/app-db';
import type { BeltRank, Club, Student } from '$lib/domain/models';
import type { SyncEntityMap, SyncEntityName, SyncMutation, SyncRealtimeEvent } from '$lib/domain/sync';
import { emitDataChanged, subscribeDataChanged } from '$lib/app/data-events';
import { toastError, toastSuccess } from '$lib/app/toast';
import { updateSyncStatus } from '$lib/app/sync/sync-status';
import { getApiBaseUrl, getWebSocketUrl } from '$lib/app/sync/sync-config';
import { HttpSyncApiClient } from '$lib/app/sync/sync-api-client';
import { WebSocketSyncClient } from '$lib/app/sync/websocket-sync-client';

const DEVICE_ID_KEY = 'pqq-device-id';
const LAST_SYNC_AT_KEY = 'pqq-last-sync-at';
const PULL_LIMIT = 200;
const POLL_INTERVAL_MS = 15000;
const RECONNECT_DELAY_MS = 2000;

type SyncRecordMap = {
	clubs: Club;
	belt_ranks: BeltRank;
	students: Student;
};

class SyncManager {
	private readonly apiClient = new HttpSyncApiClient(getApiBaseUrl());
	private readonly realtimeClient = new WebSocketSyncClient(getWebSocketUrl());
	private isStarted = false;
	private isSyncing = false;
	private pullDebounceTimer: number | null = null;
	private reconnectTimer: number | null = null;
	private pollTimer: number | null = null;
	private unsubscribeDataChanged: (() => void) | null = null;
	private lastReportedError: string | null = null;

	start(): void {
		if (!browser || this.isStarted) return;
		this.isStarted = true;

		void this.refreshPendingCount();
		void this.syncNow();
		this.connectRealtime();
		this.unsubscribeDataChanged = subscribeDataChanged((source) => {
			if (source !== 'local') return;
			void this.refreshPendingCount();
			this.scheduleSync(250);
		});
		this.startPolling();

		window.addEventListener('online', this.handleOnline);
		window.addEventListener('offline', this.handleOffline);
	}

	stop(): void {
		if (!browser || !this.isStarted) return;
		this.isStarted = false;
		this.realtimeClient.disconnect();

		if (this.pullDebounceTimer) {
			window.clearTimeout(this.pullDebounceTimer);
			this.pullDebounceTimer = null;
		}
		if (this.reconnectTimer) {
			window.clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.pollTimer) {
			window.clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		if (this.unsubscribeDataChanged) {
			this.unsubscribeDataChanged();
			this.unsubscribeDataChanged = null;
		}

		window.removeEventListener('online', this.handleOnline);
		window.removeEventListener('offline', this.handleOffline);
	}

	async syncNow(): Promise<void> {
		if (!browser || this.isSyncing || !navigator.onLine) {
			await this.refreshPendingCount();
			updateSyncStatus({ online: browser ? navigator.onLine : true });
			return;
		}

		this.isSyncing = true;
		updateSyncStatus({ isSyncing: true, lastError: undefined, online: navigator.onLine });

		try {
			await this.pushPendingMutations();
			await this.pullLatestChanges();
			await this.refreshPendingCount();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Sync failed.';
			if (message !== this.lastReportedError) {
				this.lastReportedError = message;
				toastError(message);
			}
			updateSyncStatus({
				lastError: message
			});
		} finally {
			this.isSyncing = false;
			updateSyncStatus({ isSyncing: false, online: navigator.onLine });
		}
	}

	async rebaseFromServer(): Promise<void> {
		if (!browser || !navigator.onLine) {
			updateSyncStatus({ online: browser ? navigator.onLine : true, lastError: 'Cannot rebase while offline.' });
			toastError('Cannot rebase while offline.');
			return;
		}

		updateSyncStatus({ isSyncing: true, lastError: undefined, online: navigator.onLine });
		try {
			const response = await this.apiClient.rebase();
			const db = getDB();
			let addedCount = 0;

			await db.transaction('rw', db.clubs, db.beltRanks, db.students, async () => {
				for (const club of response.clubs) {
					const existing = await db.clubs.get(club.id);
					if (!existing || existing.deletedAt) {
						await db.clubs.put({ ...club, syncStatus: 'synced' });
						addedCount += 1;
					}
				}

				for (const beltRank of response.beltRanks) {
					const existing = await db.beltRanks.get(beltRank.id);
					if (!existing || existing.deletedAt) {
						await db.beltRanks.put({ ...beltRank, syncStatus: 'synced' });
						addedCount += 1;
					}
				}

				for (const student of response.students) {
					const existing = await db.students.get(student.id);
					if (!existing || existing.deletedAt) {
						await db.students.put({ ...student, syncStatus: 'synced' });
						addedCount += 1;
					}
				}
			});

			if (response.serverTime) {
				localStorage.setItem(LAST_SYNC_AT_KEY, response.serverTime);
				updateSyncStatus({ lastSyncAt: response.serverTime });
			}

			await this.refreshPendingCount();
			emitDataChanged('sync');
			toastSuccess(addedCount > 0 ? `Rebase completed. Imported ${addedCount} record(s).` : 'Rebase completed. No missing records found.');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Rebase failed.';
			updateSyncStatus({ lastError: message });
			toastError(message);
		} finally {
			updateSyncStatus({ isSyncing: false, online: navigator.onLine });
		}
	}

	private readonly handleOnline = () => {
		updateSyncStatus({ online: true });
		this.connectRealtime();
		this.startPolling();
		void this.syncNow();
	};

	private readonly handleOffline = () => {
		updateSyncStatus({ online: false, connectionState: 'disconnected' });
		this.realtimeClient.disconnect();
		if (this.pollTimer) {
			window.clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	};

	private connectRealtime(): void {
		if (!browser || !navigator.onLine) return;

		updateSyncStatus({ connectionState: 'connecting' });
		this.realtimeClient.connect({
			onEvent: (event) => this.handleRealtimeEvent(event),
			onDisconnected: () => this.handleRealtimeDisconnect()
		});
	}

	private handleRealtimeEvent(event: SyncRealtimeEvent): void {
		if (event.type === 'connected') {
			updateSyncStatus({ connectionState: 'connected' });
			return;
		}

		if (event.type === 'ping') return;

		if (event.type === 'sync.changed') {
			this.scheduleSync(400);
		}
	}

	private handleRealtimeDisconnect(): void {
		if (!browser || !this.isStarted) return;
		updateSyncStatus({ connectionState: 'disconnected' });

		if (!navigator.onLine) return;
		if (this.reconnectTimer) return;

		this.reconnectTimer = window.setTimeout(() => {
			this.reconnectTimer = null;
			this.connectRealtime();
		}, RECONNECT_DELAY_MS);
	}

	private async pushPendingMutations(): Promise<void> {
		const mutations = await this.collectPendingMutations();
		if (mutations.length === 0) return;

		const response = await this.apiClient.push({
			deviceId: this.getDeviceID(),
			mutations
		});

		await getDB().transaction('rw', getDB().clubs, getDB().beltRanks, getDB().students, async () => {
			for (const applied of response.applied) {
				await this.saveRemoteRecord(applied.entityName, applied.record);
			}

			for (const conflict of response.conflicts) {
				if (conflict.serverRecord) {
					await this.saveRemoteRecord(conflict.entityName, conflict.serverRecord);
					continue;
				}

				await this.markConflictFailed(conflict.entityName, conflict.recordId, conflict.message);
			}
		});

		if (response.applied.length > 0 || response.conflicts.length > 0) {
			emitDataChanged('sync');
		}
	}

	private async pullLatestChanges(): Promise<void> {
		let since = this.getLastSyncAt();
		let hasMore = true;
		let didChange = false;

		while (hasMore) {
			const response = await this.apiClient.pull({
				deviceId: this.getDeviceID(),
				since,
				limit: PULL_LIMIT
			});

			if (response.changes.length === 0) {
				since = response.nextSince;
				hasMore = false;
				break;
			}

			await getDB().transaction('rw', getDB().clubs, getDB().beltRanks, getDB().students, async () => {
				for (const change of response.changes) {
					await this.saveRemoteRecord(change.entityName, change.record);
				}
			});

			didChange = true;
			since = response.nextSince;
			hasMore = response.hasMore;
		}

		if (since) {
			localStorage.setItem(LAST_SYNC_AT_KEY, since);
			updateSyncStatus({ lastSyncAt: since });
		}

		if (didChange) {
			emitDataChanged('sync');
		}
	}

	private async collectPendingMutations(): Promise<SyncMutation[]> {
		const db = getDB();
		const [clubs, beltRanks, students] = await Promise.all([
			db.clubs.where('syncStatus').anyOf(['pending', 'failed']).toArray(),
			db.beltRanks.where('syncStatus').anyOf(['pending', 'failed']).toArray(),
			db.students.where('syncStatus').anyOf(['pending', 'failed']).toArray()
		]);

		return [
			...clubs.map((record) => this.toMutation('clubs', record)),
			...beltRanks.map((record) => this.toMutation('belt_ranks', record)),
			...students.map((record) => this.toMutation('students', record))
		];
	}

	private toMutation<TEntityName extends SyncEntityName>(
		entityName: TEntityName,
		record: SyncEntityMap[TEntityName]
	): SyncMutation<TEntityName> {
		const operation = record.deletedAt ? 'delete' : 'upsert';
		return {
			mutationId: `${entityName}:${record.id}:${record.lastModifiedAt}:${operation}`,
			entityName,
			operation,
			recordId: record.id,
			record,
			clientModifiedAt: record.lastModifiedAt
		};
	}

	private async saveRemoteRecord<TEntityName extends SyncEntityName>(
		entityName: TEntityName,
		record: SyncEntityMap[TEntityName]
	): Promise<void> {
		const db = getDB();
		switch (entityName) {
			case 'clubs':
				await db.clubs.put({
					...(record as Club),
					syncStatus: 'synced',
					syncError: undefined
				});
				return;
			case 'belt_ranks':
				await db.beltRanks.put({
					...(record as BeltRank),
					syncStatus: 'synced',
					syncError: undefined
				});
				return;
			case 'students':
				await db.students.put({
					...(record as Student),
					syncStatus: 'synced',
					syncError: undefined
				});
				return;
		}
	}

	private async markConflictFailed(entityName: SyncEntityName, recordID: string, message?: string): Promise<void> {
		const db = getDB();
		switch (entityName) {
			case 'clubs':
				await db.clubs.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'belt_ranks':
				await db.beltRanks.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'students':
				await db.students.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
		}
	}

	private getDeviceID(): string {
		const existing = localStorage.getItem(DEVICE_ID_KEY);
		if (existing) return existing;

		const nextValue = crypto.randomUUID();
		localStorage.setItem(DEVICE_ID_KEY, nextValue);
		return nextValue;
	}

	private getLastSyncAt(): string | undefined {
		return localStorage.getItem(LAST_SYNC_AT_KEY) || undefined;
	}

	private scheduleSync(delayMs: number): void {
		if (!browser) return;
		if (this.pullDebounceTimer) {
			window.clearTimeout(this.pullDebounceTimer);
		}

		this.pullDebounceTimer = window.setTimeout(() => {
			this.pullDebounceTimer = null;
			void this.syncNow();
		}, delayMs);
	}

	private startPolling(): void {
		if (!browser || this.pollTimer) return;

		this.pollTimer = window.setInterval(() => {
			if (!navigator.onLine) return;
			void this.syncNow();
		}, POLL_INTERVAL_MS);
	}

	private async refreshPendingCount(): Promise<void> {
		if (!browser) return;

		const db = getDB();
		const [pendingClubCount, pendingBeltRankCount, pendingStudentCount, failedClubCount, failedBeltRankCount, failedStudentCount] =
			await Promise.all([
				db.clubs.where('syncStatus').equals('pending').count(),
				db.beltRanks.where('syncStatus').equals('pending').count(),
				db.students.where('syncStatus').equals('pending').count(),
				db.clubs.where('syncStatus').equals('failed').count(),
				db.beltRanks.where('syncStatus').equals('failed').count(),
				db.students.where('syncStatus').equals('failed').count()
			]);

		const pendingCount = pendingClubCount + pendingBeltRankCount + pendingStudentCount;
		const failedCount = failedClubCount + failedBeltRankCount + failedStudentCount;

		updateSyncStatus({
			pendingCount,
			failedCount,
			lastSyncAt: this.getLastSyncAt(),
			online: navigator.onLine
		});
	}
}

export const syncManager = new SyncManager();
