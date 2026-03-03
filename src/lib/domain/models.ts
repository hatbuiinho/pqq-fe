export type SyncStatus = 'synced' | 'pending' | 'failed';

export interface BaseEntity<TId = string> {
	id: TId;
	createdAt: string;
	updatedAt: string;
	lastModifiedAt: string;
	syncStatus: SyncStatus;
	syncError?: string;
	deletedAt?: string;
}

export interface Club extends BaseEntity<string> {
	code?: string;
	name: string;
	phone?: string;
	email?: string;
	address?: string;
	notes?: string;
	isActive: boolean;
}

export interface ClubGroup extends BaseEntity<string> {
	clubId: string;
	name: string;
	description?: string;
	isActive: boolean;
}

export interface BeltRank extends BaseEntity<string> {
	name: string;
	order: number;
	description?: string;
	isActive: boolean;
}

export type StudentStatus = 'active' | 'inactive' | 'suspended';
export type Gender = 'male' | 'female';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type StudentScheduleMode = 'inherit' | 'custom';

export interface Student extends BaseEntity<string> {
	studentCode?: string;
	fullName: string;
	dateOfBirth?: string;
	gender?: Gender;
	phone?: string;
	email?: string;
	address?: string;
	clubId: string;
	groupId?: string;
	beltRankId: string;
	joinedAt?: string;
	status: StudentStatus;
	notes?: string;
}

export type AttendanceSessionStatus = 'draft' | 'completed';
export type AttendanceStatus = 'unmarked' | 'present' | 'late' | 'excused' | 'absent';

export interface AttendanceSession extends BaseEntity<string> {
	clubId: string;
	sessionDate: string;
	status: AttendanceSessionStatus;
	notes?: string;
}

export interface AttendanceRecord extends BaseEntity<string> {
	sessionId: string;
	studentId: string;
	attendanceStatus: AttendanceStatus;
	checkInAt?: string;
	notes?: string;
}

export interface ClubSchedule extends BaseEntity<string> {
	clubId: string;
	weekday: Weekday;
	isActive: boolean;
}

export interface StudentScheduleProfile extends BaseEntity<string> {
	studentId: string;
	mode: StudentScheduleMode;
}

export interface StudentSchedule extends BaseEntity<string> {
	studentId: string;
	weekday: Weekday;
	isActive: boolean;
}
