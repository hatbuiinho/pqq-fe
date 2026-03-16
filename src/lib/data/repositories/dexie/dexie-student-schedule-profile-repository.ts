import type { StudentScheduleMode, StudentScheduleProfile } from '$lib/domain/models';
import { getDB } from '$lib/data/local/app-db';
import type {
	CreateEntity,
	StudentScheduleProfileRepository
} from '$lib/data/repositories/interfaces';

export class DexieStudentScheduleProfileRepository implements StudentScheduleProfileRepository {
	async getById(id: string): Promise<StudentScheduleProfile | undefined> {
		return getDB().studentScheduleProfiles.get(id);
	}

	async getByStudent(studentId: string): Promise<StudentScheduleProfile | undefined> {
		return getDB().studentScheduleProfiles.where('studentId').equals(studentId).first();
	}

	async list(): Promise<StudentScheduleProfile[]> {
		return (await getDB().studentScheduleProfiles.toArray()).filter((row) => !row.deletedAt);
	}

	async create(entity: CreateEntity<StudentScheduleProfile, string>): Promise<string> {
		return getDB().studentScheduleProfiles.add(entity as StudentScheduleProfile);
	}

	async update(id: string, patch: Partial<StudentScheduleProfile>): Promise<number> {
		return getDB().studentScheduleProfiles.update(id, patch);
	}

	async softDelete(id: string, deletedAt: string): Promise<number> {
		return getDB().studentScheduleProfiles.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt
		});
	}

	async restore(id: string, restoredAt: string): Promise<number> {
		return getDB().studentScheduleProfiles.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt
		});
	}

	async saveForStudent(studentId: string, mode: StudentScheduleMode): Promise<void> {
		const db = getDB();
		const existing = await this.getByStudent(studentId);
		const now = new Date().toISOString();

		if (existing) {
			await db.studentScheduleProfiles.update(existing.id, {
				mode,
				deletedAt: undefined,
				updatedAt: now,
				lastModifiedAt: now,
				syncStatus: 'pending',
				syncError: undefined
			});
			return;
		}

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
}
