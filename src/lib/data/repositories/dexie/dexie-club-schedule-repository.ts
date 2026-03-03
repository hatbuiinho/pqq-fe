import type { ClubSchedule, Weekday } from '$lib/domain/models';
import { getDB } from '$lib/data/local/app-db';
import type { ClubScheduleRepository, CreateEntity } from '$lib/data/repositories/interfaces';

export class DexieClubScheduleRepository implements ClubScheduleRepository {
	async getById(id: string): Promise<ClubSchedule | undefined> {
		return getDB().clubSchedules.get(id);
	}

	async list(): Promise<ClubSchedule[]> {
		return (await getDB().clubSchedules.toArray()).filter((row) => !row.deletedAt);
	}

	async listByClub(clubId: string): Promise<ClubSchedule[]> {
		const rows = await getDB().clubSchedules.where('clubId').equals(clubId).toArray();
		return rows.filter((row) => !row.deletedAt).sort((a, b) => a.weekday.localeCompare(b.weekday));
	}

	async create(entity: CreateEntity<ClubSchedule, string>): Promise<string> {
		return getDB().clubSchedules.add(entity as ClubSchedule);
	}

	async update(id: string, patch: Partial<ClubSchedule>): Promise<number> {
		return getDB().clubSchedules.update(id, patch);
	}

	async softDelete(id: string, deletedAt: string): Promise<number> {
		return getDB().clubSchedules.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt
		});
	}

	async restore(id: string, restoredAt: string): Promise<number> {
		return getDB().clubSchedules.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt
		});
	}

	async replaceForClub(clubId: string, weekdays: Weekday[]): Promise<void> {
		const db = getDB();
		const normalizedWeekdays = [...new Set(weekdays)];
		const now = new Date().toISOString();

		await db.transaction('rw', db.clubSchedules, async () => {
			const existing = await db.clubSchedules.where('clubId').equals(clubId).toArray();
			const incoming = new Set(normalizedWeekdays);

			for (const row of existing) {
				if (!incoming.has(row.weekday)) {
					await db.clubSchedules.delete(row.id);
				}
			}

			for (const weekday of normalizedWeekdays) {
				const existingRow = existing.find((row) => row.weekday === weekday);
				if (existingRow) {
				await db.clubSchedules.update(existingRow.id, {
					isActive: true,
					deletedAt: undefined,
					updatedAt: now,
					lastModifiedAt: now,
					syncStatus: 'pending',
					syncError: undefined
				});
					continue;
				}

				await db.clubSchedules.add({
					id: `${clubId}:${weekday}`,
					clubId,
					weekday,
					isActive: true,
					createdAt: now,
					updatedAt: now,
					lastModifiedAt: now,
					syncStatus: 'pending',
					syncError: undefined
				});
			}
		});
	}
}
