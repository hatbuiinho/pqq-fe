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

export interface BeltRank extends BaseEntity<string> {
	name: string;
	order: number;
	description?: string;
	isActive: boolean;
}

export type StudentStatus = 'active' | 'inactive' | 'suspended';
export type Gender = 'male' | 'female';

export interface Student extends BaseEntity<string> {
	studentCode?: string;
	fullName: string;
	dateOfBirth?: string;
	gender?: Gender;
	phone?: string;
	email?: string;
	address?: string;
	clubId: string;
	beltRankId: string;
	joinedAt?: string;
	status: StudentStatus;
	notes?: string;
}
