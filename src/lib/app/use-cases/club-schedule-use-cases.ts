import { emitDataChanged } from '$lib/app/data-events';
import type { ClubSchedule, Weekday } from '$lib/domain/models';
import type { ClubRepository, ClubScheduleRepository } from '$lib/data/repositories/interfaces';
import { sortWeekdays } from '$lib/domain/schedule-utils';

export class ClubScheduleUseCases {
	constructor(
		private readonly scheduleRepo: ClubScheduleRepository,
		private readonly clubRepo: ClubRepository
	) {}

	async listByClub(clubId: string): Promise<ClubSchedule[]> {
		return this.scheduleRepo.listByClub(clubId);
	}

	async getWeekdays(clubId: string): Promise<Weekday[]> {
		const rows = await this.scheduleRepo.listByClub(clubId);
		return sortWeekdays(rows.filter((row) => row.isActive).map((row) => row.weekday));
	}

	async saveWeekdays(clubId: string, weekdays: Weekday[]): Promise<void> {
		const club = await this.clubRepo.getById(clubId);
		if (!club || club.deletedAt) throw new Error('Club does not exist.');
		await this.scheduleRepo.replaceForClub(clubId, sortWeekdays(weekdays));
		emitDataChanged();
	}
}
