import type { Club } from '$lib/domain/models';
import { getDB } from '$lib/data/local/app-db';
import type { ClubRepository, CreateEntity } from '$lib/data/repositories/interfaces';

export class DexieClubRepository implements ClubRepository {
	private isVisible(club: Club): boolean {
		return !club.deletedAt || club.syncStatus !== 'synced';
	}

	async getById(id: string): Promise<Club | undefined> {
		return getDB().clubs.get(id);
	}

	async list(): Promise<Club[]> {
		const rows = await getDB().clubs.toArray();
		return rows.filter((club) => this.isVisible(club)).sort((a, b) => a.name.localeCompare(b.name));
	}

	async create(entity: CreateEntity<Club, string>): Promise<string> {
		return getDB().clubs.add(entity as Club);
	}

	async update(id: string, patch: Partial<Club>): Promise<number> {
		return getDB().clubs.update(id, patch);
	}

	async softDelete(id: string, deletedAt: string): Promise<number> {
		return getDB().clubs.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async restore(id: string, restoredAt: string): Promise<number> {
		return getDB().clubs.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async searchByName(query: string): Promise<Club[]> {
		const q = query.trim().toLowerCase();
		if (!q) return this.list();

		const rows = await this.list();
		return rows.filter((club) => club.name.toLowerCase().includes(q));
	}
}
