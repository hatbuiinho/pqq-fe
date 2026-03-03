import type { Gender, StudentScheduleMode, StudentStatus } from '$lib/domain/models';

export type StudentFormValue = {
	fullName: string;
	studentCode: string;
	dateOfBirth: string;
	gender: Gender | '';
	phone: string;
	email: string;
	address: string;
	clubId: string;
	groupId: string;
	beltRankId: string;
	scheduleMode: StudentScheduleMode;
	joinedAt: string;
	status: StudentStatus;
	notes: string;
};

export type StudentFormErrors = Partial<
	Record<
		'fullName' | 'clubId' | 'groupId' | 'beltRankId' | 'dateOfBirth' | 'joinedAt' | 'phone' | 'email' | 'scheduleDays',
		string
	>
>;
