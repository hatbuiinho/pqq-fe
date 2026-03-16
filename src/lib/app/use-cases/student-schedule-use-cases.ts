import { emitDataChanged } from '$lib/app/data-events';
import { getDB } from '$lib/data/local/app-db';
import type { StudentScheduleMode, Weekday } from '$lib/domain/models';
import {
	type ClubRepository,
	type ClubScheduleRepository,
	type StudentRepository,
	type StudentScheduleProfileRepository,
	type StudentScheduleRepository
} from '$lib/data/repositories/interfaces';
import { sortWeekdays } from '$lib/domain/schedule-utils';

export class StudentScheduleUseCases {
	constructor(
		private readonly profileRepo: StudentScheduleProfileRepository,
		private readonly scheduleRepo: StudentScheduleRepository,
		private readonly studentRepo: StudentRepository,
		private readonly clubRepo: ClubRepository,
		private readonly clubScheduleRepo: ClubScheduleRepository
	) {}

	async getMode(studentId: string): Promise<StudentScheduleMode> {
		const profile = await this.profileRepo.getByStudent(studentId);
		return profile?.mode ?? 'inherit';
	}

	async getWeekdays(studentId: string): Promise<Weekday[]> {
		const rows = await this.scheduleRepo.listByStudent(studentId);
		return sortWeekdays(rows.filter((row) => row.isActive).map((row) => row.weekday));
	}

	async getResolvedWeekdays(studentId: string): Promise<Weekday[]> {
		const student = await this.studentRepo.getById(studentId);
		if (!student || student.deletedAt) return [];

		const mode = await this.getMode(studentId);
		if (mode === 'inherit') {
			const clubScheduleRows = await this.clubScheduleRepo.listByClub(student.clubId);
			return sortWeekdays(clubScheduleRows.filter((row) => row.isActive).map((row) => row.weekday));
		}

		return this.getWeekdays(studentId);
	}

	async save(studentId: string, mode: StudentScheduleMode, weekdays: Weekday[]): Promise<void> {
		const student = await this.studentRepo.getById(studentId);
		if (!student || student.deletedAt) throw new Error('Student does not exist.');
		await this.validateScheduleInput(student.clubId, mode, weekdays);
		await this.saveForStudentsInternal([studentId], mode, weekdays);
		emitDataChanged();
	}

	async bulkSave(
		studentIds: string[],
		mode: StudentScheduleMode,
		weekdays: Weekday[],
		emitChange = true
	): Promise<void> {
		const uniqueIDs = [...new Set(studentIds)];
		if (uniqueIDs.length === 0) return;

		const students = await Promise.all(
			uniqueIDs.map((studentId) => this.studentRepo.getById(studentId))
		);
		if (students.some((student) => !student || student.deletedAt)) {
			throw new Error('One or more students do not exist.');
		}

		for (const student of students) {
			await this.validateScheduleInput(
				(student as NonNullable<typeof student>).clubId,
				mode,
				weekdays
			);
		}

		await this.saveForStudentsInternal(uniqueIDs, mode, weekdays);

		if (emitChange) {
			emitDataChanged();
		}
	}

	private async validateScheduleInput(
		clubId: string,
		mode: StudentScheduleMode,
		weekdays: Weekday[]
	): Promise<Weekday[]> {
		const club = await this.clubRepo.getById(clubId);
		if (!club || club.deletedAt) throw new Error('Club does not exist.');

		const clubWeekdays = new Set(
			(await this.clubScheduleRepo.listByClub(clubId))
				.filter((row) => row.isActive)
				.map((row) => row.weekday)
		);
		const normalizedWeekdays = sortWeekdays(weekdays);

		if (mode === 'custom') {
			for (const weekday of normalizedWeekdays) {
				if (!clubWeekdays.has(weekday)) {
					throw new Error('Student custom schedule must stay within the selected club schedule.');
				}
			}
		}

		return normalizedWeekdays;
	}

	private async saveForStudentsInternal(
		studentIds: string[],
		mode: StudentScheduleMode,
		weekdays: Weekday[]
	): Promise<void> {
		const normalizedWeekdays = sortWeekdays(weekdays);
		const targetWeekdays = mode === 'custom' ? normalizedWeekdays : [];
		const db = getDB();
		const now = new Date().toISOString();

		await db.transaction('rw', db.studentScheduleProfiles, db.studentSchedules, async () => {
			for (const studentId of studentIds) {
				const existingProfile = await db.studentScheduleProfiles
					.where('studentId')
					.equals(studentId)
					.first();
				if (existingProfile) {
					await db.studentScheduleProfiles.update(existingProfile.id, {
						mode,
						deletedAt: undefined,
						updatedAt: now,
						lastModifiedAt: now,
						syncStatus: 'pending',
						syncError: undefined
					});
				} else {
					await db.studentScheduleProfiles.add({
						id: studentId,
						studentId,
						mode,
						createdAt: now,
						updatedAt: now,
						lastModifiedAt: now,
						syncStatus: 'pending',
						syncError: undefined
					});
				}

				const existingSchedules = await db.studentSchedules
					.where('studentId')
					.equals(studentId)
					.toArray();
				const incomingWeekdays = new Set(targetWeekdays);

				for (const row of existingSchedules) {
					if (!incomingWeekdays.has(row.weekday)) {
						await db.studentSchedules.delete(row.id);
					}
				}

				for (const weekday of targetWeekdays) {
					const existingRow = existingSchedules.find((row) => row.weekday === weekday);
					if (existingRow) {
						await db.studentSchedules.update(existingRow.id, {
							isActive: true,
							deletedAt: undefined,
							updatedAt: now,
							lastModifiedAt: now,
							syncStatus: 'pending',
							syncError: undefined
						});
						continue;
					}

					await db.studentSchedules.add({
						id: `${studentId}:${weekday}`,
						studentId,
						weekday,
						isActive: true,
						createdAt: now,
						updatedAt: now,
						lastModifiedAt: now,
						syncStatus: 'pending',
						syncError: undefined
					});
				}
			}
		});
	}
}
