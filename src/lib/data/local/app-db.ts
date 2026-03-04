import { browser } from '$app/environment';
import type {
	AttendanceRecord,
	AttendanceSession,
	BeltRank,
	Club,
	ClubGroup,
	ClubSchedule,
	Student,
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
	studentAvatarQueue!: EntityTable<StudentAvatarQueueItem, 'id'>;
	studentAvatarCache!: EntityTable<StudentAvatarCache, 'studentId'>;
	studentScheduleProfiles!: EntityTable<StudentScheduleProfile, 'id'>;
	studentSchedules!: EntityTable<StudentSchedule, 'id'>;
	attendanceSessions!: EntityTable<AttendanceSession, 'id'>;
	attendanceRecords!: EntityTable<AttendanceRecord, 'id'>;

	constructor() {
		super('martial-arts-club-db');

		this.version(9).stores({
			clubs: 'id, code, name, isActive, updatedAt, syncStatus, deletedAt',
			clubGroups: 'id, clubId, name, isActive, updatedAt, syncStatus, deletedAt, [clubId+name]',
			clubSchedules: 'id, clubId, weekday, isActive, updatedAt, syncStatus, deletedAt, [clubId+weekday]',
			beltRanks: 'id, name, order, isActive, updatedAt, syncStatus, deletedAt',
			students:
				'id, studentCode, fullName, clubId, groupId, beltRankId, status, updatedAt, syncStatus, deletedAt, [clubId+status], [clubId+beltRankId], [clubId+groupId]',
			studentAvatarQueue: 'id, studentId, status, updatedAt, [studentId+status]',
			studentAvatarCache: 'studentId, mediaId, updatedAt',
			studentScheduleProfiles: 'id, studentId, mode, updatedAt, syncStatus, deletedAt, [studentId+mode]',
			studentSchedules: 'id, studentId, weekday, isActive, updatedAt, syncStatus, deletedAt, [studentId+weekday]',
			attendanceSessions:
				'id, clubId, sessionDate, status, updatedAt, syncStatus, deletedAt, [clubId+sessionDate]',
			attendanceRecords:
				'id, sessionId, studentId, attendanceStatus, updatedAt, syncStatus, deletedAt, [sessionId+studentId], [sessionId+attendanceStatus]'
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
