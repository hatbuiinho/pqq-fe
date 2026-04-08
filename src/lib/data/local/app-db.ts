import { browser } from '$app/environment';
import type {
	AttendanceRecord,
	AttendanceSession,
	AttendanceActionQueueItem,
	BeltRank,
	Club,
	ClubGroup,
	ClubSchedule,
	Student,
	StudentMessage,
	StudentAvatarCache,
	StudentAvatarQueueItem,
	StudentSchedule,
	StudentScheduleProfile
} from '$lib/domain/models';
import Dexie, { type EntityTable } from 'dexie';

export class AppDB extends Dexie {
	clubs!: EntityTable<Club, 'id'>;
	clubGroups!: EntityTable<ClubGroup, 'id'>;
	clubSchedules!: EntityTable<ClubSchedule, 'id'>;
	beltRanks!: EntityTable<BeltRank, 'id'>;
	students!: EntityTable<Student, 'id'>;
	studentMessages!: EntityTable<StudentMessage, 'id'>;
	studentAvatarQueue!: EntityTable<StudentAvatarQueueItem, 'id'>;
	studentAvatarCache!: EntityTable<StudentAvatarCache, 'studentId'>;
	studentScheduleProfiles!: EntityTable<StudentScheduleProfile, 'id'>;
	studentSchedules!: EntityTable<StudentSchedule, 'id'>;
	attendanceSessions!: EntityTable<AttendanceSession, 'id'>;
	attendanceRecords!: EntityTable<AttendanceRecord, 'id'>;
	attendanceActionQueue!: EntityTable<AttendanceActionQueueItem, 'id'>;

	constructor() {
		super('martial-arts-club-db');

		this.version(9).stores({
			clubs: 'id, code, name, isActive, updatedAt, syncStatus, deletedAt',
			clubGroups: 'id, clubId, name, isActive, updatedAt, syncStatus, deletedAt, [clubId+name]',
			clubSchedules:
				'id, clubId, weekday, isActive, updatedAt, syncStatus, deletedAt, [clubId+weekday]',
			beltRanks: 'id, name, order, isActive, updatedAt, syncStatus, deletedAt',
			students:
				'id, studentCode, fullName, clubId, groupId, beltRankId, status, updatedAt, syncStatus, deletedAt, [clubId+status], [clubId+beltRankId], [clubId+groupId]',
			studentAvatarQueue: 'id, studentId, status, updatedAt, [studentId+status]',
			studentAvatarCache: 'studentId, mediaId, updatedAt',
			studentScheduleProfiles:
				'id, studentId, mode, updatedAt, syncStatus, deletedAt, [studentId+mode]',
			studentSchedules:
				'id, studentId, weekday, isActive, updatedAt, syncStatus, deletedAt, [studentId+weekday]',
			attendanceSessions:
				'id, clubId, sessionDate, status, updatedAt, syncStatus, deletedAt, [clubId+sessionDate]',
			attendanceRecords:
				'id, sessionId, studentId, attendanceStatus, updatedAt, syncStatus, deletedAt, [sessionId+studentId], [sessionId+attendanceStatus]'
		});

		this.version(10).stores({
			clubs: 'id, code, name, isActive, updatedAt, syncStatus, deletedAt',
			clubGroups: 'id, clubId, name, isActive, updatedAt, syncStatus, deletedAt, [clubId+name]',
			clubSchedules:
				'id, clubId, weekday, isActive, updatedAt, syncStatus, deletedAt, [clubId+weekday]',
			beltRanks: 'id, name, order, isActive, updatedAt, syncStatus, deletedAt',
			students:
				'id, studentCode, fullName, clubId, groupId, beltRankId, status, updatedAt, syncStatus, deletedAt, [clubId+status], [clubId+beltRankId], [clubId+groupId]',
			studentAvatarQueue: 'id, studentId, status, updatedAt, [studentId+status]',
			studentAvatarCache: 'studentId, mediaId, updatedAt',
			studentScheduleProfiles:
				'id, studentId, mode, updatedAt, syncStatus, deletedAt, [studentId+mode]',
			studentSchedules:
				'id, studentId, weekday, isActive, updatedAt, syncStatus, deletedAt, [studentId+weekday]',
			attendanceSessions:
				'id, clubId, sessionDate, status, updatedAt, syncStatus, deletedAt, [clubId+sessionDate]',
			attendanceRecords:
				'id, sessionId, studentId, attendanceStatus, updatedAt, syncStatus, deletedAt, [sessionId+studentId], [sessionId+attendanceStatus]',
			attendanceActionQueue:
				'id, actionType, clubId, sessionId, recordId, studentId, status, updatedAt, clientOccurredAt, [status+updatedAt], [sessionId+status], [recordId+status]'
		});

		this.version(11).stores({
			clubs: 'id, code, name, isActive, updatedAt, syncStatus, deletedAt',
			clubGroups: 'id, clubId, name, isActive, updatedAt, syncStatus, deletedAt, [clubId+name]',
			clubSchedules:
				'id, clubId, weekday, isActive, updatedAt, syncStatus, deletedAt, [clubId+weekday]',
			beltRanks: 'id, name, order, isActive, updatedAt, syncStatus, deletedAt',
			students:
				'id, studentCode, fullName, clubId, groupId, beltRankId, status, updatedAt, syncStatus, deletedAt, [clubId+status], [clubId+beltRankId], [clubId+groupId]',
			studentMessages:
				'id, studentId, clubId, messageType, authorUserId, attendanceSessionId, attendanceRecordId, updatedAt, syncStatus, deletedAt, [studentId+updatedAt], [studentId+messageType]',
			studentAvatarQueue: 'id, studentId, status, updatedAt, [studentId+status]',
			studentAvatarCache: 'studentId, mediaId, updatedAt',
			studentScheduleProfiles:
				'id, studentId, mode, updatedAt, syncStatus, deletedAt, [studentId+mode]',
			studentSchedules:
				'id, studentId, weekday, isActive, updatedAt, syncStatus, deletedAt, [studentId+weekday]',
			attendanceSessions:
				'id, clubId, sessionDate, status, updatedAt, syncStatus, deletedAt, [clubId+sessionDate]',
			attendanceRecords:
				'id, sessionId, studentId, attendanceStatus, updatedAt, syncStatus, deletedAt, [sessionId+studentId], [sessionId+attendanceStatus]',
			attendanceActionQueue:
				'id, actionType, clubId, sessionId, recordId, studentId, status, updatedAt, clientOccurredAt, [status+updatedAt], [sessionId+status], [recordId+status]'
		});
	}
}

let db: AppDB | null = null;

export function getDB(): AppDB {
	if (!browser) {
		throw new Error('IndexedDB is only available in the browser.');
	}

	if (!db) {
		db = new AppDB();
	}

	return db;
}

export async function clearAppData(): Promise<void> {
	if (!browser) return;

	const database = getDB();
	await database.transaction(
		'rw',
		[
			database.clubs,
			database.clubGroups,
			database.clubSchedules,
			database.beltRanks,
			database.students,
			database.studentMessages,
			database.studentAvatarQueue,
			database.studentAvatarCache,
			database.studentScheduleProfiles,
			database.studentSchedules,
			database.attendanceSessions,
			database.attendanceRecords,
			database.attendanceActionQueue
		],
		async () => {
			await Promise.all([
				database.clubs.clear(),
				database.clubGroups.clear(),
				database.clubSchedules.clear(),
				database.beltRanks.clear(),
				database.students.clear(),
				database.studentMessages.clear(),
				database.studentAvatarQueue.clear(),
				database.studentAvatarCache.clear(),
				database.studentScheduleProfiles.clear(),
				database.studentSchedules.clear(),
				database.attendanceSessions.clear(),
				database.attendanceRecords.clear(),
				database.attendanceActionQueue.clear()
			]);
		}
	);
}
