import { emitDataChanged } from '$lib/app/data-events';
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

		const club = await this.clubRepo.getById(student.clubId);
		if (!club || club.deletedAt) throw new Error('Club does not exist.');

		const clubWeekdays = new Set(
			(await this.clubScheduleRepo.listByClub(student.clubId)).filter((row) => row.isActive).map((row) => row.weekday)
		);
		const normalizedWeekdays = sortWeekdays(weekdays);

		if (mode === 'custom') {
			for (const weekday of normalizedWeekdays) {
				if (!clubWeekdays.has(weekday)) {
					throw new Error('Student custom schedule must stay within the selected club schedule.');
				}
			}
		}

		await this.profileRepo.saveForStudent(studentId, mode);
		await this.scheduleRepo.replaceForStudent(studentId, mode === 'custom' ? normalizedWeekdays : []);
		emitDataChanged();
	}
}
