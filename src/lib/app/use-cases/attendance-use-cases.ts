import { emitDataChanged } from '$lib/app/data-events';
import { browser } from '$app/environment';
import { attendanceApi } from '$lib/app/attendance-api';
import { getDB } from '$lib/data/local/app-db';
import type {
	AttendanceActionQueueItem,
	AttendanceRecord,
	AttendanceSession,
	AttendanceSessionStatus,
	AttendanceStatus,
	Club,
	Student,
	StudentMessage
} from '$lib/domain/models';
import type {
	AttendanceRecordRepository,
	AttendanceSessionRepository,
	ClubScheduleRepository,
	ClubRepository,
	StudentScheduleProfileRepository,
	StudentScheduleRepository,
	StudentRepository
} from '$lib/data/repositories/interfaces';
import { getWeekdayFromIsoDate } from '$lib/domain/schedule-utils';
import { getTodayIsoDate } from '$lib/domain/student-form-validation';

type AttendanceViewItem = {
	student: Student;
	record: AttendanceRecord;
};

type CreateSessionInput = {
	clubId: string;
	sessionDate: string;
	notes?: string;
};

type UpdateAttendanceInput = {
	sessionId: string;
	studentId: string;
	attendanceStatus: AttendanceStatus;
	notes?: string;
};

type AttendanceActionTarget = Pick<
	AttendanceActionQueueItem,
	'actionType' | 'clubId' | 'sessionId' | 'recordId' | 'studentId'
>;

function attendanceMessageId(attendanceRecordId: string): string {
	return `attendance-note-${attendanceRecordId}`;
}

export class AttendanceUseCases {
	constructor(
		private readonly sessionRepo: AttendanceSessionRepository,
		private readonly recordRepo: AttendanceRecordRepository,
		private readonly clubRepo: ClubRepository,
		private readonly studentRepo: StudentRepository,
		private readonly clubScheduleRepo: ClubScheduleRepository,
		private readonly studentScheduleProfileRepo: StudentScheduleProfileRepository,
		private readonly studentScheduleRepo: StudentScheduleRepository
	) {}

	async listSessions(): Promise<AttendanceSession[]> {
		return this.sessionRepo.list();
	}

	async listRecords(): Promise<AttendanceRecord[]> {
		return this.recordRepo.list();
	}

	async getSessionByClubAndDate(
		clubId: string,
		sessionDate: string
	): Promise<AttendanceSession | undefined> {
		return this.sessionRepo.getByClubAndDate(clubId, sessionDate);
	}

	async createSession(input: CreateSessionInput): Promise<AttendanceSession> {
		if (!input.clubId) throw new Error('Club is required.');
		if (!input.sessionDate) throw new Error('Session date is required.');

		const club = await this.clubRepo.getById(input.clubId);
		if (!club || club.deletedAt) throw new Error('Club does not exist.');
		if (!club.isActive) throw new Error('Club is inactive.');

		if (browser && navigator.onLine) {
			try {
				return await this.createSessionOnline(input);
			} catch (error) {
				if (!this.isCreateSessionNetworkFallback(error)) {
					throw error;
				}
			}
		}

		return this.createSessionOffline(input);
	}

	private async createSessionOnline(input: CreateSessionInput): Promise<AttendanceSession> {
		const response = await attendanceApi.createSession({
			clubId: input.clubId,
			sessionDate: input.sessionDate,
			notes: input.notes?.trim() || undefined
		});

		const db = getDB();
		await db.transaction('rw', [db.attendanceSessions, db.attendanceRecords], async () => {
			await db.attendanceSessions.put({
				...response.session,
				syncStatus: 'synced',
				syncError: undefined
			});
			if (response.records.length > 0) {
				await db.attendanceRecords.bulkPut(
					response.records.map((record) => ({
						...record,
						syncStatus: 'synced',
						syncError: undefined
					}))
				);
			}
		});

		emitDataChanged('attendance');
		return {
			...response.session,
			syncStatus: 'synced',
			syncError: undefined
		};
	}

	private async createSessionOffline(input: CreateSessionInput): Promise<AttendanceSession> {
		const activeStudents = (await this.studentRepo.listByClub(input.clubId)).filter(
			(student) => !student.deletedAt && student.status === 'active'
		);
		const clubScheduleRows = await this.clubScheduleRepo.listByClub(input.clubId);
		const clubScheduleSet = new Set(
			clubScheduleRows.filter((row) => row.isActive).map((row) => row.weekday)
		);
		const expectedStudents = await this.listExpectedStudentsForSession(
			activeStudents,
			input.sessionDate,
			clubScheduleSet
		);

		const now = new Date().toISOString();
		const session: AttendanceSession = {
			id: crypto.randomUUID(),
			clubId: input.clubId,
			sessionDate: input.sessionDate,
			status: 'draft',
			notes: input.notes?.trim() || undefined,
			createdAt: now,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus: 'pending'
		};
		const records: AttendanceRecord[] = [];
		for (const student of expectedStudents) {
			const record: AttendanceRecord = {
				id: crypto.randomUUID(),
				sessionId: session.id,
				studentId: student.id,
				attendanceStatus: 'unmarked',
				createdAt: now,
				updatedAt: now,
				lastModifiedAt: now,
				syncStatus: 'pending'
			};
			records.push(record);
		}

		const db = getDB();
		await db.transaction(
			'rw',
			[db.attendanceSessions, db.attendanceRecords, db.attendanceActionQueue],
			async () => {
				await db.attendanceSessions.add(session);
				if (records.length > 0) {
					await db.attendanceRecords.bulkAdd(records);
				}
				await this.enqueueAttendanceAction(
					db,
					{
						actionType: 'create_session',
						clubId: input.clubId,
						sessionId: session.id
					},
					{
						session,
						records
					},
					now
				);
			}
		);

		emitDataChanged('attendance');
		return session;
	}

	private async listExpectedStudentsForSession(
		activeStudents: Student[],
		sessionDate: string,
		clubScheduleSet: Set<string>
	): Promise<Student[]> {
		const sessionWeekday = getWeekdayFromIsoDate(sessionDate);
		if (clubScheduleSet.size === 0 || !sessionWeekday) {
			return activeStudents;
		}

		const studentIDs = activeStudents.map((student) => student.id);
		const [profiles, customSchedules] = await Promise.all([
			this.studentScheduleProfileRepo.listByStudents(studentIDs),
			this.studentScheduleRepo.listByStudents(studentIDs)
		]);

		const profileModeByStudentId = new Map(profiles.map((profile) => [profile.studentId, profile.mode]));
		const customWeekdaysByStudentId = new Map<string, Set<string>>();
		for (const schedule of customSchedules) {
			if (!schedule.isActive) continue;

			const weekdaySet = customWeekdaysByStudentId.get(schedule.studentId) ?? new Set<string>();
			weekdaySet.add(schedule.weekday);
			customWeekdaysByStudentId.set(schedule.studentId, weekdaySet);
		}

		return activeStudents.filter((student) => {
			const mode = profileModeByStudentId.get(student.id) ?? 'inherit';
			if (mode === 'custom') {
				return customWeekdaysByStudentId.get(student.id)?.has(sessionWeekday) ?? false;
			}

			return clubScheduleSet.has(sessionWeekday);
		});
	}

	private isCreateSessionNetworkFallback(error: unknown): boolean {
		if (!browser) return false;
		return !navigator.onLine && error instanceof TypeError;
	}

	async getSessionDetails(
		sessionId: string
	): Promise<{ session: AttendanceSession; club: Club; items: AttendanceViewItem[] }> {
		const session = await this.sessionRepo.getById(sessionId);
		if (!session || session.deletedAt) throw new Error('Attendance session does not exist.');

		const club = await this.clubRepo.getById(session.clubId);
		if (!club || club.deletedAt) throw new Error('Club does not exist.');

		const [records, students] = await Promise.all([
			this.recordRepo.listBySession(sessionId),
			this.studentRepo.listByClub(session.clubId)
		]);

		const studentMap = new Map(
			students.filter((student) => !student.deletedAt).map((student) => [student.id, student])
		);
		const items = records
			.map((record) => {
				const student = studentMap.get(record.studentId);
				if (!student) return null;
				return { student, record };
			})
			.filter((item): item is AttendanceViewItem => item !== null)
			.sort((a, b) => a.student.fullName.localeCompare(b.student.fullName));

		return { session, club, items };
	}

	async updateAttendance(input: UpdateAttendanceInput): Promise<void> {
		const record = await this.recordRepo.getBySessionAndStudent(input.sessionId, input.studentId);
		if (!record) throw new Error('Attendance record does not exist.');
		const session = await this.sessionRepo.getById(input.sessionId);
		if (!session || session.deletedAt) throw new Error('Attendance session does not exist.');

		const now = new Date().toISOString();
		const normalizedNotes = input.notes?.trim() || undefined;
		const attendanceStatusChanged = record.attendanceStatus !== input.attendanceStatus;
		const nextCheckInAt = attendanceStatusChanged
			? input.attendanceStatus === 'present' || input.attendanceStatus === 'late'
				? record.checkInAt ?? now
				: undefined
			: record.checkInAt;
		const statusChanged = attendanceStatusChanged || record.checkInAt !== nextCheckInAt;
		const noteChanged = (record.notes ?? undefined) !== normalizedNotes;
		if (!statusChanged && !noteChanged) return;

		const db = getDB();
		await db.transaction(
			'rw',
			[db.attendanceRecords, db.attendanceActionQueue, db.studentMessages],
			async () => {
			await db.attendanceRecords.update(record.id, {
				attendanceStatus: input.attendanceStatus,
				notes: normalizedNotes,
				checkInAt: nextCheckInAt,
				updatedAt: now,
				lastModifiedAt: now,
				syncStatus: 'pending',
				syncError: undefined
			});

			if (statusChanged) {
				await this.enqueueAttendanceAction(
					db,
					{
						actionType: 'set_record_status',
						clubId: session.clubId,
						sessionId: input.sessionId,
						recordId: record.id,
						studentId: input.studentId
					},
					{
						attendanceStatus: input.attendanceStatus,
						checkInAt: nextCheckInAt
					},
					now
				);
			}

			if (noteChanged) {
				await this.syncLocalAttendanceMirrorMessage(
					db,
					{
						...record,
						attendanceStatus: input.attendanceStatus,
						notes: normalizedNotes,
						checkInAt: nextCheckInAt,
						updatedAt: now,
						lastModifiedAt: now,
						syncStatus: 'pending'
					},
					session,
					now
				);

				await this.enqueueAttendanceAction(
					db,
					{
						actionType: 'set_record_note',
						clubId: session.clubId,
						sessionId: input.sessionId,
						recordId: record.id,
						studentId: input.studentId
					},
					{
						notes: normalizedNotes
					},
					now
				);
			}
			}
		);

		emitDataChanged('attendance');
	}

	async markAllPresent(sessionId: string): Promise<void> {
		const records = await this.recordRepo.listBySession(sessionId);
		const session = await this.sessionRepo.getById(sessionId);
		if (!session || session.deletedAt) throw new Error('Attendance session does not exist.');
		const now = new Date().toISOString();
		const db = getDB();
		const changedRecords = records.filter(
			(record) => !(record.attendanceStatus === 'present' && Boolean(record.checkInAt))
		);
		if (changedRecords.length === 0) {
			return;
		}

		await db.transaction('rw', [db.attendanceRecords, db.attendanceActionQueue], async () => {
			await db.attendanceRecords.bulkPut(
				changedRecords.map((record) => ({
					...record,
					attendanceStatus: 'present',
					checkInAt: now,
					updatedAt: now,
					lastModifiedAt: now,
					syncStatus: 'pending' as const,
					syncError: undefined
				}))
			);
			await this.enqueueAttendanceAction(
				db,
				{
					actionType: 'mark_all_present',
					clubId: session.clubId,
					sessionId
				},
				{
					recordIds: changedRecords.map((record) => record.id),
					checkInAt: now
				},
				now
			);
		});

		emitDataChanged('attendance');
	}

	async completeSession(sessionId: string): Promise<void> {
		await this.setSessionStatus(sessionId, 'completed');
	}

	async reopenSession(sessionId: string): Promise<void> {
		const session = await this.sessionRepo.getById(sessionId);
		if (!session || session.deletedAt) throw new Error('Attendance session does not exist.');
		if (session.sessionDate !== getTodayIsoDate()) {
			throw new Error('Only sessions scheduled for today can be reopened.');
		}
		await this.setSessionStatus(sessionId, 'draft');
	}

	async updateSessionNotes(sessionId: string, notes?: string): Promise<void> {
		const session = await this.sessionRepo.getById(sessionId);
		if (!session || session.deletedAt) throw new Error('Attendance session does not exist.');
		const now = new Date().toISOString();
		const normalizedNotes = notes?.trim() || undefined;
		if ((session.notes ?? undefined) === normalizedNotes) return;
		const db = getDB();
		await db.transaction('rw', [db.attendanceSessions, db.attendanceActionQueue], async () => {
			const updated = await db.attendanceSessions.update(sessionId, {
				notes: normalizedNotes,
				updatedAt: now,
				lastModifiedAt: now,
				syncStatus: 'pending',
				syncError: undefined
			});
			if (!updated) throw new Error('Attendance session does not exist.');
			await this.enqueueAttendanceAction(
				db,
				{
					actionType: 'set_session_note',
					clubId: session.clubId,
					sessionId
				},
				{ notes: normalizedNotes },
				now
			);
		});
		emitDataChanged('attendance');
	}

	async deleteSession(sessionId: string): Promise<void> {
		const session = await this.sessionRepo.getById(sessionId);
		if (!session || session.deletedAt) throw new Error('Attendance session does not exist.');

		const deletedAt = new Date().toISOString();
		const records = await this.recordRepo.listBySession(sessionId);
		const db = getDB();
		await db.transaction(
			'rw',
			[db.attendanceSessions, db.attendanceRecords, db.attendanceActionQueue],
			async () => {
				for (const record of records) {
					await db.attendanceRecords.update(record.id, {
						deletedAt,
						updatedAt: deletedAt,
						lastModifiedAt: deletedAt,
						syncStatus: 'pending',
						syncError: undefined
					});
				}

				const deleted = await db.attendanceSessions.update(sessionId, {
					deletedAt,
					updatedAt: deletedAt,
					lastModifiedAt: deletedAt,
					syncStatus: 'pending',
					syncError: undefined
				});
				if (!deleted) throw new Error('Attendance session does not exist.');

				await this.enqueueAttendanceAction(
					db,
					{
						actionType: 'delete_session',
						clubId: session.clubId,
						sessionId
					},
					{ deletedAt },
					deletedAt
				);
			}
		);
		emitDataChanged('attendance');
	}

	private async setSessionStatus(
		sessionId: string,
		status: AttendanceSessionStatus
	): Promise<void> {
		const session = await this.sessionRepo.getById(sessionId);
		if (!session || session.deletedAt) throw new Error('Attendance session does not exist.');
		if (session.status === status) return;
		const now = new Date().toISOString();
		const db = getDB();
		await db.transaction('rw', [db.attendanceSessions, db.attendanceActionQueue], async () => {
			const updated = await db.attendanceSessions.update(sessionId, {
				status,
				updatedAt: now,
				lastModifiedAt: now,
				syncStatus: 'pending',
				syncError: undefined
			});
			if (!updated) throw new Error('Attendance session does not exist.');
			await this.enqueueAttendanceAction(
				db,
				{
					actionType: 'set_session_status',
					clubId: session.clubId,
					sessionId
				},
				{ status },
				now
			);
		});
		emitDataChanged('attendance');
	}

	private async enqueueAttendanceAction(
		db: ReturnType<typeof getDB>,
		target: AttendanceActionTarget,
		payload: Record<string, unknown>,
		clientOccurredAt: string
	): Promise<void> {
		const queue = db.attendanceActionQueue;
		const items = await queue.toArray();
		const existing = items.find(
			(item) =>
				item.actionType === target.actionType &&
				item.clubId === target.clubId &&
				item.sessionId === target.sessionId &&
				(item.recordId ?? '') === (target.recordId ?? '') &&
				(item.studentId ?? '') === (target.studentId ?? '')
		);

		if (existing) {
			await queue.update(existing.id, {
				payload,
				status: 'pending',
				error: undefined,
				updatedAt: clientOccurredAt,
				clientOccurredAt
			});
			return;
		}

		await queue.add({
			id: crypto.randomUUID(),
			actionType: target.actionType,
			clubId: target.clubId,
			sessionId: target.sessionId,
			recordId: target.recordId,
			studentId: target.studentId,
			payload,
			status: 'pending',
			createdAt: clientOccurredAt,
			updatedAt: clientOccurredAt,
			clientOccurredAt
		});
	}

	private async syncLocalAttendanceMirrorMessage(
		db: ReturnType<typeof getDB>,
		record: AttendanceRecord,
		session: AttendanceSession,
		now: string
	): Promise<void> {
		const messageId = attendanceMessageId(record.id);
		const existing = await db.studentMessages.get(messageId);
		const normalizedNotes = record.notes?.trim() || undefined;

		if (!normalizedNotes) {
			if (!existing || existing.deletedAt) return;
			await db.studentMessages.update(messageId, {
				deletedAt: now,
				updatedAt: now,
				lastModifiedAt: now,
				syncStatus: 'synced',
				syncError: undefined
			});
			return;
		}

		const nextMessage: StudentMessage = {
			id: messageId,
			studentId: record.studentId,
			clubId: session.clubId,
			messageType: 'attendance_note',
			content: normalizedNotes,
			authorName: existing?.authorName ?? 'Hệ thống',
			authorUserId: existing?.authorUserId,
			attendanceSessionId: session.id,
			attendanceRecordId: record.id,
			attendanceSessionDate: session.sessionDate,
			attendanceStatus: record.attendanceStatus,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus: 'synced'
		};

		await db.studentMessages.put(nextMessage);
	}

}
