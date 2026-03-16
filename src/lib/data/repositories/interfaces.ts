import type {
	AttendanceRecord,
	AttendanceSession,
	BeltRank,
	Club,
	ClubGroup,
	ClubSchedule,
	Student,
	StudentSchedule,
	StudentScheduleProfile,
	Weekday
} from '$lib/domain/models';

export type CreateEntity<T, TId> = Omit<T, 'id'> & { id?: TId };

export interface BaseRepository<T extends { id: TId }, TId> {
	getById(id: TId): Promise<T | undefined>;
	list(): Promise<T[]>;
	create(entity: CreateEntity<T, TId>): Promise<TId>;
	update(id: TId, patch: Partial<T>): Promise<number>;
	softDelete(id: TId, deletedAt: string): Promise<number>;
	restore(id: TId, restoredAt: string): Promise<number>;
}

export interface ClubRepository extends BaseRepository<Club, string> {
	searchByName(query: string): Promise<Club[]>;
}

export interface ClubGroupRepository extends BaseRepository<ClubGroup, string> {
	listByClub(clubId: string): Promise<ClubGroup[]>;
	getByClubAndName(clubId: string, name: string): Promise<ClubGroup | undefined>;
}

export interface BeltRankRepository extends BaseRepository<BeltRank, string> {
	getByOrder(order: number): Promise<BeltRank | undefined>;
}

export interface StudentRepository extends BaseRepository<Student, string> {
	listByClub(clubId: string): Promise<Student[]>;
	listByGroup(groupId: string): Promise<Student[]>;
	listByBeltRank(beltRankId: string): Promise<Student[]>;
}

export interface AttendanceSessionRepository extends BaseRepository<AttendanceSession, string> {
	getByClubAndDate(clubId: string, sessionDate: string): Promise<AttendanceSession | undefined>;
}

export interface AttendanceRecordRepository extends BaseRepository<AttendanceRecord, string> {
	listBySession(sessionId: string): Promise<AttendanceRecord[]>;
	getBySessionAndStudent(
		sessionId: string,
		studentId: string
	): Promise<AttendanceRecord | undefined>;
}

export interface ClubScheduleRepository extends BaseRepository<ClubSchedule, string> {
	listByClub(clubId: string): Promise<ClubSchedule[]>;
	replaceForClub(clubId: string, weekdays: Weekday[]): Promise<void>;
}

export interface StudentScheduleProfileRepository extends BaseRepository<
	StudentScheduleProfile,
	string
> {
	getByStudent(studentId: string): Promise<StudentScheduleProfile | undefined>;
	saveForStudent(studentId: string, mode: StudentScheduleProfile['mode']): Promise<void>;
}

export interface StudentScheduleRepository extends BaseRepository<StudentSchedule, string> {
	listByStudent(studentId: string): Promise<StudentSchedule[]>;
	replaceForStudent(studentId: string, weekdays: Weekday[]): Promise<void>;
}
