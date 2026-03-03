import type {
	AttendanceRecord,
	AttendanceSession,
	BeltRank,
	Club,
	ClubGroup,
	ClubSchedule,
	Student,
	StudentSchedule,
	StudentScheduleProfile
} from '$lib/domain/models';

export type SyncEntityName =
	| 'clubs'
	| 'club_groups'
	| 'club_schedules'
	| 'belt_ranks'
	| 'students'
	| 'student_schedule_profiles'
	| 'student_schedules'
	| 'attendance_sessions'
	| 'attendance_records';
export type SyncOperation = 'upsert' | 'delete';

export interface SyncEntityMap {
	clubs: Club;
	club_groups: ClubGroup;
	club_schedules: ClubSchedule;
	belt_ranks: BeltRank;
	students: Student;
	student_schedule_profiles: StudentScheduleProfile;
	student_schedules: StudentSchedule;
	attendance_sessions: AttendanceSession;
	attendance_records: AttendanceRecord;
}

export type SyncEntityRecord = SyncEntityMap[keyof SyncEntityMap];

export interface SyncMutation<TEntityName extends SyncEntityName = SyncEntityName> {
	mutationId: string;
	entityName: TEntityName;
	operation: SyncOperation;
	recordId: SyncEntityMap[TEntityName]['id'];
	record: SyncEntityMap[TEntityName];
	clientModifiedAt: string;
}

export interface SyncPushRequest {
	deviceId: string;
	mutations: SyncMutation[];
}

export interface SyncAppliedRecord<TEntityName extends SyncEntityName = SyncEntityName> {
	entityName: TEntityName;
	record: SyncEntityMap[TEntityName];
	serverModifiedAt: string;
}

export interface SyncConflict<TEntityName extends SyncEntityName = SyncEntityName> {
	mutationId: string;
	entityName: TEntityName;
	recordId: SyncEntityMap[TEntityName]['id'];
	reason: 'stale_write' | 'duplicate_value' | 'foreign_key_missing' | 'validation_failed';
	message: string;
	serverRecord?: SyncEntityMap[TEntityName];
}

export interface SyncPushResponse {
	serverTime: string;
	applied: SyncAppliedRecord[];
	conflicts: SyncConflict[];
}

export interface SyncPullRequest {
	deviceId: string;
	since?: string;
	limit?: number;
}

export interface SyncPullChange<TEntityName extends SyncEntityName = SyncEntityName> {
	entityName: TEntityName;
	record: SyncEntityMap[TEntityName];
	serverModifiedAt: string;
}

export interface SyncPullResponse {
	serverTime: string;
	nextSince: string;
	hasMore: boolean;
	changes: SyncPullChange[];
}

export interface SyncRebaseResponse {
	serverTime: string;
	clubs: Club[];
	clubGroups: ClubGroup[];
	clubSchedules: ClubSchedule[];
	beltRanks: BeltRank[];
	students: Student[];
	studentScheduleProfiles: StudentScheduleProfile[];
	studentSchedules: StudentSchedule[];
	attendanceSessions: AttendanceSession[];
	attendanceRecords: AttendanceRecord[];
}

export type SyncRealtimeEventType = 'connected' | 'sync.changed' | 'ping';

export interface SyncRealtimeConnectedEvent {
	type: 'connected';
	connectionId: string;
	serverTime: string;
}

export interface SyncRealtimeChangedEvent {
	type: 'sync.changed';
	serverTime: string;
	entityNames: SyncEntityName[];
	recordIds: string[];
}

export interface SyncRealtimePingEvent {
	type: 'ping';
	serverTime: string;
}

export type SyncRealtimeEvent =
	| SyncRealtimeConnectedEvent
	| SyncRealtimeChangedEvent
	| SyncRealtimePingEvent;
