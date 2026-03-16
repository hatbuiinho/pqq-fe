import type { StudentSchedule, Weekday } from '$lib/domain/models';
import { getDB } from '$lib/data/local/app-db';
import type { CreateEntity, StudentScheduleRepository } from '$lib/data/repositories/interfaces';

export class DexieStudentScheduleRepository implements StudentScheduleRepository {
	async getById(id: string): Promise<StudentSchedule | undefined> {
		return getDB().studentSchedules.get(id);
	}

	async list(): Promise<StudentSchedule[]> {
		return (await getDB().studentSchedules.toArray()).filter((row) => !row.deletedAt);
	}

	async listByStudent(studentId: string): Promise<StudentSchedule[]> {
		const rows = await getDB().studentSchedules.where('studentId').equals(studentId).toArray();
		return rows.filter((row) => !row.deletedAt).sort((a, b) => a.weekday.localeCompare(b.weekday));
	}

	async create(entity: CreateEntity<StudentSchedule, string>): Promise<string> {
		return getDB().studentSchedules.add(entity as StudentSchedule);
	}

	async update(id: string, patch: Partial<StudentSchedule>): Promise<number> {
		return getDB().studentSchedules.update(id, patch);
	}

	async softDelete(id: string, deletedAt: string): Promise<number> {
		return getDB().studentSchedules.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt
		});
	}

	async restore(id: string, restoredAt: string): Promise<number> {
		return getDB().studentSchedules.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt
		});
	}

	async replaceForStudent(studentId: string, weekdays: Weekday[]): Promise<void> {
		const db = getDB();
		const normalizedWeekdays = [...new Set(weekdays)];
		const now = new Date().toISOString();

		await db.transaction('rw', db.studentSchedules, async () => {
			const existing = await db.studentSchedules.where('studentId').equals(studentId).toArray();
			const incoming = new Set(normalizedWeekdays);

			for (const row of existing) {
				if (!incoming.has(row.weekday)) {
					await db.studentSchedules.delete(row.id);
				}
			}

			for (const weekday of normalizedWeekdays) {
				const existingRow = existing.find((row) => row.weekday === weekday);
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
		});
	}
}
