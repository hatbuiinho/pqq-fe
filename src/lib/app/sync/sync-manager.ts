import { browser } from '$app/environment';
import { getDB } from '$lib/data/local/app-db';
import type {
	AttendanceRecord,
	AttendanceSession,
	BeltRank,
	Club,
	ClubGroup,
	ClubSchedule,
	Student,
	StudentMessage,
	StudentSchedule,
	StudentScheduleProfile
} from '$lib/domain/models';
import type {
	AttendanceActionMutation,
	SyncEntityMap,
	SyncEntityName,
	SyncMutation,
	SyncRealtimeEvent
} from '$lib/domain/sync';
import { emitDataChanged, subscribeDataChanged } from '$lib/app/data-events';
import { getAuthToken } from '$lib/app/auth';
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
const ATTENDANCE_SYNC_DELAY_MS = 1500;

class SyncManager {
	private readonly apiClient = new HttpSyncApiClient(getApiBaseUrl());
	private realtimeClient: WebSocketSyncClient | null = null;
	private isStarted = false;
	private isSyncing = false;
	private hasQueuedSync = false;
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
			if (source !== 'local' && source !== 'attendance') return;
			void this.refreshPendingCount();
			this.scheduleSync(source === 'attendance' ? ATTENDANCE_SYNC_DELAY_MS : 250);
		});
		this.startPolling();

		window.addEventListener('online', this.handleOnline);
		window.addEventListener('offline', this.handleOffline);
	}

	stop(): void {
		if (!browser || !this.isStarted) return;
		this.isStarted = false;
		this.realtimeClient?.disconnect();
		this.realtimeClient = null;

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
		if (!browser || !navigator.onLine) {
			await this.refreshPendingCount();
			updateSyncStatus({ online: browser ? navigator.onLine : true });
			return;
		}

		if (this.isSyncing) {
			this.hasQueuedSync = true;
			await this.refreshPendingCount();
			updateSyncStatus({ online: navigator.onLine });
			return;
		}

		this.isSyncing = true;
		updateSyncStatus({ isSyncing: true, lastError: undefined, online: navigator.onLine });

		try {
			await this.pushPendingAttendanceActions();
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
			if (this.hasQueuedSync && navigator.onLine) {
				this.hasQueuedSync = false;
				this.scheduleSync(0);
			}
		}
	}

	async rebaseFromServer(): Promise<void> {
		await this.rebaseFromServerInternal({ silent: false });
	}

	async hydrateCurrentSession(): Promise<void> {
		await this.rebaseFromServerInternal({ silent: true });
	}

	async shouldHydrateCurrentSession(): Promise<boolean> {
		if (!browser) return false;
		if (!navigator.onLine) return false;
		if (!this.getLastSyncAt()) return true;

		const db = getDB();
		const [clubCount, studentCount, sessionCount] = await Promise.all([
			db.clubs.count(),
			db.students.count(),
			db.attendanceSessions.count()
		]);

		return clubCount === 0 && studentCount === 0 && sessionCount === 0;
	}

	private async rebaseFromServerInternal(options: { silent: boolean }): Promise<void> {
		if (!browser || !navigator.onLine) {
			updateSyncStatus({
				online: browser ? navigator.onLine : true,
				lastError: 'Cannot rebase while offline.'
			});
			if (!options.silent) {
				toastError('Cannot rebase while offline.');
			}
			return;
		}

		updateSyncStatus({ isSyncing: true, lastError: undefined, online: navigator.onLine });
		try {
			const response = await this.apiClient.rebase();
			const db = getDB();
			let addedCount = 0;

			await db.transaction(
				'rw',
				[
					db.clubs,
					db.clubGroups,
					db.clubSchedules,
					db.beltRanks,
					db.students,
					db.studentMessages,
					db.studentScheduleProfiles,
					db.studentSchedules,
					db.attendanceSessions,
					db.attendanceRecords
				],
				async () => {
					for (const club of response.clubs) {
						const existing = await db.clubs.get(club.id);
						if (!existing || existing.deletedAt) {
							await db.clubs.put({ ...club, syncStatus: 'synced' });
							addedCount += 1;
						}
					}

					for (const clubGroup of response.clubGroups) {
						const existing = await db.clubGroups.get(clubGroup.id);
						if (!existing || existing.deletedAt) {
							await db.clubGroups.put({ ...clubGroup, syncStatus: 'synced' });
							addedCount += 1;
						}
					}

					for (const clubSchedule of response.clubSchedules) {
						const existing = await db.clubSchedules.get(clubSchedule.id);
						if (!existing || existing.deletedAt) {
							await db.clubSchedules.put({ ...clubSchedule, syncStatus: 'synced' });
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

					for (const studentMessage of response.studentMessages) {
						const existing = await db.studentMessages.get(studentMessage.id);
						if (!existing || existing.deletedAt) {
							await db.studentMessages.put({ ...studentMessage, syncStatus: 'synced' });
							addedCount += 1;
						}
					}

					for (const studentScheduleProfile of response.studentScheduleProfiles) {
						const existing = await db.studentScheduleProfiles.get(studentScheduleProfile.id);
						if (!existing || existing.deletedAt) {
							await db.studentScheduleProfiles.put({
								...studentScheduleProfile,
								syncStatus: 'synced'
							});
							addedCount += 1;
						}
					}

					for (const studentSchedule of response.studentSchedules) {
						const existing = await db.studentSchedules.get(studentSchedule.id);
						if (!existing || existing.deletedAt) {
							await db.studentSchedules.put({ ...studentSchedule, syncStatus: 'synced' });
							addedCount += 1;
						}
					}

					for (const attendanceSession of response.attendanceSessions) {
						const existing = await db.attendanceSessions.get(attendanceSession.id);
						if (!existing || existing.deletedAt) {
							await db.attendanceSessions.put({ ...attendanceSession, syncStatus: 'synced' });
							addedCount += 1;
						}
					}

					for (const attendanceRecord of response.attendanceRecords) {
						const existing = await db.attendanceRecords.get(attendanceRecord.id);
						if (!existing || existing.deletedAt) {
							await db.attendanceRecords.put({ ...attendanceRecord, syncStatus: 'synced' });
							addedCount += 1;
						}
					}
				}
			);

			if (response.serverTime) {
				localStorage.setItem(LAST_SYNC_AT_KEY, response.serverTime);
				updateSyncStatus({ lastSyncAt: response.serverTime });
			}

			await this.refreshPendingCount();
			emitDataChanged('sync');
			if (!options.silent) {
				toastSuccess(
					addedCount > 0
						? `Rebase completed. Imported ${addedCount} record(s).`
						: 'Rebase completed. No missing records found.'
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Rebase failed.';
			updateSyncStatus({ lastError: message });
			if (!options.silent) {
				toastError(message);
			}
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
		this.realtimeClient?.disconnect();
		this.realtimeClient = null;
		if (this.pollTimer) {
			window.clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	};

	private connectRealtime(): void {
		if (!browser || !navigator.onLine) return;

		const realtimeUrl = new URL(getWebSocketUrl());
		const accessToken = getAuthToken();
		if (accessToken) {
			realtimeUrl.searchParams.set('access_token', accessToken);
		}

		this.realtimeClient?.disconnect();
		this.realtimeClient = new WebSocketSyncClient(realtimeUrl.toString());
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

		await getDB().transaction(
			'rw',
			[
				getDB().clubs,
				getDB().clubGroups,
				getDB().clubSchedules,
				getDB().beltRanks,
				getDB().students,
				getDB().studentMessages,
				getDB().studentScheduleProfiles,
				getDB().studentSchedules,
				getDB().attendanceSessions,
				getDB().attendanceRecords
			],
			async () => {
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
			}
		);

		if (response.applied.length > 0 || response.conflicts.length > 0) {
			emitDataChanged('sync');
		}
	}

	private async pushPendingAttendanceActions(): Promise<void> {
		const actions = await this.collectPendingAttendanceActions();
		if (actions.length === 0) return;

		const db = getDB();
		const actionsById = new Map(actions.map((action) => [action.actionId, action]));
		const response = await this.apiClient.pushAttendanceActions({
			deviceId: this.getDeviceID(),
			actions
		});

		await db.transaction(
			'rw',
			[
				db.attendanceActionQueue,
				db.attendanceSessions,
				db.attendanceRecords
			],
			async () => {
				const skippedRemoteRecordKeys = new Set<string>();

				for (const appliedActionID of response.appliedActionIds) {
					await db.attendanceActionQueue.delete(appliedActionID);
					const appliedAction = actionsById.get(appliedActionID);
					if (!appliedAction || appliedAction.actionType !== 'create_session') continue;

					await db.attendanceSessions.update(appliedAction.sessionId, {
						syncStatus: 'synced',
						syncError: undefined
					});
					await db.attendanceRecords
						.where('sessionId')
						.equals(appliedAction.sessionId)
						.modify({
							syncStatus: 'synced',
							syncError: undefined
						});

					skippedRemoteRecordKeys.add(`attendance_sessions:${appliedAction.sessionId}`);

					const recordIDs = this.getCreateSessionRecordIDs(appliedAction.payload);
					for (const recordID of recordIDs) {
						skippedRemoteRecordKeys.add(`attendance_records:${recordID}`);
					}
				}

				for (const change of response.changes) {
					const key = `${change.entityName}:${change.record.id}`;
					if (skippedRemoteRecordKeys.has(key)) {
						continue;
					}
					await this.saveRemoteRecord(change.entityName, change.record);
				}

				for (const error of response.errors) {
					await db.attendanceActionQueue.update(error.actionId, {
						status: 'failed',
						error: error.message,
						updatedAt: response.serverTime
					});

					let hasServerSnapshot = false;
					if (error.serverSession) {
						await this.saveRemoteRecord('attendance_sessions', error.serverSession);
						hasServerSnapshot = true;
					}
					if (error.serverRecord) {
						await this.saveRemoteRecord('attendance_records', error.serverRecord);
						hasServerSnapshot = true;
					}

					if (hasServerSnapshot) {
						continue;
					}

					if (error.recordId) {
						await db.attendanceRecords.update(error.recordId, {
							syncStatus: 'failed',
							syncError: error.message
						});
					} else {
						await db.attendanceSessions.update(error.sessionId, {
							syncStatus: 'failed',
							syncError: error.message
						});
					}
				}
			}
		);

		if (response.appliedActionIds.length > 0 || response.errors.length > 0) {
			emitDataChanged('sync');
		}
	}

	private getCreateSessionRecordIDs(payload: AttendanceActionMutation['payload']): string[] {
		const records = payload.records;
		if (!Array.isArray(records)) return [];

		return records
			.map((record) =>
				record &&
				typeof record === 'object' &&
				'id' in record &&
				typeof record.id === 'string'
					? record.id
					: null
			)
			.filter((recordID): recordID is string => Boolean(recordID));
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

			await getDB().transaction(
				'rw',
				[
					getDB().clubs,
					getDB().clubGroups,
					getDB().clubSchedules,
					getDB().beltRanks,
					getDB().students,
					getDB().studentMessages,
					getDB().studentScheduleProfiles,
					getDB().studentSchedules,
					getDB().attendanceSessions,
					getDB().attendanceRecords
				],
				async () => {
					for (const change of response.changes) {
						await this.saveRemoteRecord(change.entityName, change.record);
					}
				}
			);

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
		const [
			clubs,
			clubGroups,
			clubSchedules,
			beltRanks,
			students,
			studentMessages,
			studentScheduleProfiles,
			studentSchedules
		] = await Promise.all([
			db.clubs.where('syncStatus').anyOf(['pending', 'failed']).toArray(),
			db.clubGroups.where('syncStatus').anyOf(['pending', 'failed']).toArray(),
			db.clubSchedules.where('syncStatus').anyOf(['pending', 'failed']).toArray(),
			db.beltRanks.where('syncStatus').anyOf(['pending', 'failed']).toArray(),
			db.students.where('syncStatus').anyOf(['pending', 'failed']).toArray(),
			db.studentMessages.where('syncStatus').anyOf(['pending', 'failed']).toArray(),
			db.studentScheduleProfiles.where('syncStatus').anyOf(['pending', 'failed']).toArray(),
			db.studentSchedules.where('syncStatus').anyOf(['pending', 'failed']).toArray()
		]);

		return [
			...clubs.map((record) => this.toMutation('clubs', record)),
			...clubGroups.map((record) => this.toMutation('club_groups', record)),
			...clubSchedules.map((record) => this.toMutation('club_schedules', record)),
			...beltRanks.map((record) => this.toMutation('belt_ranks', record)),
			...students.map((record) => this.toMutation('students', record)),
			...studentMessages.map((record) => this.toMutation('student_messages', record)),
			...studentScheduleProfiles.map((record) =>
				this.toMutation('student_schedule_profiles', record)
			),
			...studentSchedules.map((record) => this.toMutation('student_schedules', record))
		];
	}

	private async collectPendingAttendanceActions(): Promise<AttendanceActionMutation[]> {
		const items = await getDB()
			.attendanceActionQueue
			.where('status')
			.anyOf(['pending', 'failed'])
			.sortBy('clientOccurredAt');

		return items.map((item) => ({
			actionId: item.id,
			actionType: item.actionType,
			clubId: item.clubId,
			sessionId: item.sessionId,
			recordId: item.recordId,
			studentId: item.studentId,
			payload: item.payload,
			clientOccurredAt: item.clientOccurredAt
		}));
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
			case 'club_groups':
				await db.clubGroups.put({
					...(record as ClubGroup),
					syncStatus: 'synced',
					syncError: undefined
				});
				return;
			case 'club_schedules':
				await db.clubSchedules.put({
					...(record as ClubSchedule),
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
			case 'student_messages':
				await db.studentMessages.put({
					...(record as StudentMessage),
					syncStatus: 'synced',
					syncError: undefined
				});
				return;
			case 'student_schedule_profiles':
				await db.studentScheduleProfiles.put({
					...(record as StudentScheduleProfile),
					syncStatus: 'synced',
					syncError: undefined
				});
				return;
			case 'student_schedules':
				await db.studentSchedules.put({
					...(record as StudentSchedule),
					syncStatus: 'synced',
					syncError: undefined
				});
				return;
			case 'attendance_sessions':
				await db.attendanceSessions.put({
					...(record as AttendanceSession),
					syncStatus: 'synced',
					syncError: undefined
				});
				return;
			case 'attendance_records':
				await db.attendanceRecords.put({
					...(record as AttendanceRecord),
					syncStatus: 'synced',
					syncError: undefined
				});
				return;
		}
	}

	private async markConflictFailed(
		entityName: SyncEntityName,
		recordID: string,
		message?: string
	): Promise<void> {
		const db = getDB();
		switch (entityName) {
			case 'clubs':
				await db.clubs.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'club_groups':
				await db.clubGroups.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'club_schedules':
				await db.clubSchedules.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'belt_ranks':
				await db.beltRanks.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'students':
				await db.students.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'student_messages':
				await db.studentMessages.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'student_schedule_profiles':
				await db.studentScheduleProfiles.update(recordID, {
					syncStatus: 'failed',
					syncError: message
				});
				return;
			case 'student_schedules':
				await db.studentSchedules.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'attendance_sessions':
				await db.attendanceSessions.update(recordID, { syncStatus: 'failed', syncError: message });
				return;
			case 'attendance_records':
				await db.attendanceRecords.update(recordID, { syncStatus: 'failed', syncError: message });
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
		const [
			pendingClubCount,
			pendingClubGroupCount,
			pendingClubScheduleCount,
			pendingBeltRankCount,
			pendingStudentCount,
			pendingStudentMessageCount,
			pendingStudentScheduleProfileCount,
			pendingStudentScheduleCount,
			pendingAttendanceActionCount,
			failedClubCount,
			failedClubGroupCount,
			failedClubScheduleCount,
			failedBeltRankCount,
			failedStudentCount,
			failedStudentMessageCount,
			failedStudentScheduleProfileCount,
			failedStudentScheduleCount,
			failedAttendanceActionCount
		] = await Promise.all([
			db.clubs.where('syncStatus').equals('pending').count(),
			db.clubGroups.where('syncStatus').equals('pending').count(),
			db.clubSchedules.where('syncStatus').equals('pending').count(),
			db.beltRanks.where('syncStatus').equals('pending').count(),
			db.students.where('syncStatus').equals('pending').count(),
			db.studentMessages.where('syncStatus').equals('pending').count(),
			db.studentScheduleProfiles.where('syncStatus').equals('pending').count(),
			db.studentSchedules.where('syncStatus').equals('pending').count(),
			db.attendanceActionQueue.where('status').equals('pending').count(),
			db.clubs.where('syncStatus').equals('failed').count(),
			db.clubGroups.where('syncStatus').equals('failed').count(),
			db.clubSchedules.where('syncStatus').equals('failed').count(),
			db.beltRanks.where('syncStatus').equals('failed').count(),
			db.students.where('syncStatus').equals('failed').count(),
			db.studentMessages.where('syncStatus').equals('failed').count(),
			db.studentScheduleProfiles.where('syncStatus').equals('failed').count(),
			db.studentSchedules.where('syncStatus').equals('failed').count(),
			db.attendanceActionQueue.where('status').equals('failed').count()
		]);

		const pendingCount =
			pendingClubCount +
			pendingClubGroupCount +
			pendingClubScheduleCount +
			pendingBeltRankCount +
			pendingStudentCount +
			pendingStudentMessageCount +
			pendingStudentScheduleProfileCount +
			pendingStudentScheduleCount +
			pendingAttendanceActionCount;
		const failedCount =
			failedClubCount +
			failedClubGroupCount +
			failedClubScheduleCount +
			failedBeltRankCount +
			failedStudentCount +
			failedStudentMessageCount +
			failedStudentScheduleProfileCount +
			failedStudentScheduleCount +
			failedAttendanceActionCount;

		updateSyncStatus({
			pendingCount,
			failedCount,
			lastSyncAt: this.getLastSyncAt(),
			online: navigator.onLine
		});
	}
}

export const syncManager = new SyncManager();
