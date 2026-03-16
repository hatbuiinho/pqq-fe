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

export type StudentMediaType = 'avatar' | 'certificate' | 'exam_document' | 'photo' | 'other';

export interface StudentAvatar {
	id: string;
	studentId: string;
	mediaType: 'avatar';
	originalFilename: string;
	mimeType: string;
	fileSize: number;
	isPrimary: boolean;
	uploadedAt: string;
	downloadUrl?: string;
	thumbnailUrl?: string;
}

export interface AvatarImportBatch {
	id: string;
	status: string;
	sourceType: string;
	originalFilename?: string;
	totalItems: number;
	matchedItems: number;
	ambiguousItems: number;
	unmatchedItems: number;
	failedItems: number;
	importedItems: number;
	createdAt: string;
	updatedAt: string;
	processedAt?: string;
}

export interface AvatarImportBatchItem {
	id: string;
	batchId: string;
	originalFilename: string;
	mimeType: string;
	fileSize: number;
	guessedStudentId?: string;
	guessedStudentName?: string;
	matchMethod?: string;
	matchScore?: number;
	confirmedStudentId?: string;
	status: string;
	errorMessage?: string;
	previewUrl?: string;
	finalMediaId?: string;
}

export type StudentAvatarQueueStatus = 'pending' | 'uploading' | 'failed';

export interface StudentAvatarQueueItem {
	id: string;
	studentId: string;
	fileName: string;
	mimeType: string;
	fileSize: number;
	blob: Blob;
	status: StudentAvatarQueueStatus;
	error?: string;
	createdAt: string;
	updatedAt: string;
}

export interface StudentAvatarCache {
	studentId: string;
	mediaId: string;
	blob: Blob;
	mimeType: string;
	updatedAt: string;
}

export type AttendanceSessionStatus = 'draft' | 'completed';
export type AttendanceStatus =
	| 'unmarked'
	| 'present'
	| 'late'
	| 'excused'
	| 'left_early'
	| 'absent';

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
