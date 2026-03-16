import type { Student } from '$lib/domain/models';
import { getDB } from '$lib/data/local/app-db';
import type { StudentRepository } from '$lib/data/repositories/interfaces';

export class DexieStudentRepository implements StudentRepository {
	private isVisible(student: Student): boolean {
		return !student.deletedAt || student.syncStatus !== 'synced';
	}

	async getById(id: string): Promise<Student | undefined> {
		return getDB().students.get(id);
	}

	async list(): Promise<Student[]> {
		const rows = await getDB().students.toArray();
		return rows
			.filter((student) => this.isVisible(student))
			.sort((a, b) => a.fullName.localeCompare(b.fullName));
	}

	async create(entity: Student): Promise<string> {
		return getDB().students.add(entity);
	}

	async update(id: string, patch: Partial<Student>): Promise<number> {
		return getDB().students.update(id, patch);
	}

	async softDelete(id: string, deletedAt: string): Promise<number> {
		return getDB().students.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async restore(id: string, restoredAt: string): Promise<number> {
		return getDB().students.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async listByClub(clubId: string): Promise<Student[]> {
		const rows = await getDB().students.where('clubId').equals(clubId).toArray();
		return rows.filter((student) => this.isVisible(student));
	}

	async listByGroup(groupId: string): Promise<Student[]> {
		const rows = await getDB().students.where('groupId').equals(groupId).toArray();
		return rows.filter((student) => this.isVisible(student));
	}

	async listByBeltRank(beltRankId: string): Promise<Student[]> {
		const rows = await getDB().students.where('beltRankId').equals(beltRankId).toArray();
		return rows.filter((student) => this.isVisible(student));
	}
}
