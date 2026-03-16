import { emitDataChanged } from '$lib/app/data-events';
import type {
	AttendanceRecord,
	AttendanceSession,
	AttendanceSessionStatus,
	AttendanceStatus,
	Club,
	Student
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

		const activeStudents = (await this.studentRepo.listByClub(input.clubId)).filter(
			(student) => !student.deletedAt && student.status === 'active'
		);
		const sessionWeekday = getWeekdayFromIsoDate(input.sessionDate);
		const clubScheduleRows = await this.clubScheduleRepo.listByClub(input.clubId);
		const clubScheduleSet = new Set(
			clubScheduleRows.filter((row) => row.isActive).map((row) => row.weekday)
		);
		const expectedStudents =
			clubScheduleSet.size === 0 || !sessionWeekday
				? activeStudents
				: (
						await Promise.all(
							activeStudents.map(async (student) => ({
								student,
								expected: await this.isStudentExpectedOnWeekday(
									student.id,
									sessionWeekday,
									clubScheduleSet
								)
							}))
						)
					)
						.filter((item) => item.expected)
						.map((item) => item.student);

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

		await this.sessionRepo.create(session);

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
			await this.recordRepo.create(record);
		}

		emitDataChanged('attendance');
		return session;
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

		const now = new Date().toISOString();
		await this.recordRepo.update(record.id, {
			attendanceStatus: input.attendanceStatus,
			notes: input.notes?.trim() || undefined,
			checkInAt:
				input.attendanceStatus === 'present' || input.attendanceStatus === 'late' ? now : undefined,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus: 'pending',
			syncError: undefined
		});

		emitDataChanged('attendance');
	}

	async markAllPresent(sessionId: string): Promise<void> {
		const records = await this.recordRepo.listBySession(sessionId);
		const now = new Date().toISOString();

		for (const record of records) {
			await this.recordRepo.update(record.id, {
				attendanceStatus: 'present',
				checkInAt: now,
				updatedAt: now,
				lastModifiedAt: now,
				syncStatus: 'pending',
				syncError: undefined
			});
		}

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
		const now = new Date().toISOString();
		const updated = await this.sessionRepo.update(sessionId, {
			notes: notes?.trim() || undefined,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus: 'pending',
			syncError: undefined
		});
		if (!updated) throw new Error('Attendance session does not exist.');
		emitDataChanged('attendance');
	}

	async deleteSession(sessionId: string): Promise<void> {
		const session = await this.sessionRepo.getById(sessionId);
		if (!session || session.deletedAt) throw new Error('Attendance session does not exist.');

		const deletedAt = new Date().toISOString();
		const records = await this.recordRepo.listBySession(sessionId);

		for (const record of records) {
			await this.recordRepo.softDelete(record.id, deletedAt);
		}

		const deleted = await this.sessionRepo.softDelete(sessionId, deletedAt);
		if (!deleted) throw new Error('Attendance session does not exist.');
		emitDataChanged('attendance');
	}

	private async setSessionStatus(
		sessionId: string,
		status: AttendanceSessionStatus
	): Promise<void> {
		const now = new Date().toISOString();
		const updated = await this.sessionRepo.update(sessionId, {
			status,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus: 'pending',
			syncError: undefined
		});
		if (!updated) throw new Error('Attendance session does not exist.');
		emitDataChanged('attendance');
	}

	private async isStudentExpectedOnWeekday(
		studentId: string,
		weekday: NonNullable<ReturnType<typeof getWeekdayFromIsoDate>>,
		clubScheduleSet: Set<string>
	): Promise<boolean> {
		const profile = await this.studentScheduleProfileRepo.getByStudent(studentId);
		const mode = profile?.mode ?? 'inherit';

		if (mode === 'inherit') {
			return clubScheduleSet.has(weekday);
		}

		const customSchedules = await this.studentScheduleRepo.listByStudent(studentId);
		return customSchedules.some((row) => row.isActive && row.weekday === weekday);
	}
}
