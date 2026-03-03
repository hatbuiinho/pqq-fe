import type { ClubGroup } from '$lib/domain/models';
import { getDB } from '$lib/data/local/app-db';
import type { ClubGroupRepository, CreateEntity } from '$lib/data/repositories/interfaces';

export class DexieClubGroupRepository implements ClubGroupRepository {
	async getById(id: string): Promise<ClubGroup | undefined> {
		return getDB().clubGroups.get(id);
	}

	async list(): Promise<ClubGroup[]> {
		const rows = await getDB().clubGroups.toArray();
		return rows.sort((a, b) => {
			if (a.clubId === b.clubId) return a.name.localeCompare(b.name);
			return a.clubId.localeCompare(b.clubId);
		});
	}

	async create(entity: CreateEntity<ClubGroup, string>): Promise<string> {
		return getDB().clubGroups.add(entity as ClubGroup);
	}

	async update(id: string, patch: Partial<ClubGroup>): Promise<number> {
		return getDB().clubGroups.update(id, patch);
	}

	async softDelete(id: string, deletedAt: string): Promise<number> {
		return getDB().clubGroups.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt
		});
	}

	async restore(id: string, restoredAt: string): Promise<number> {
		return getDB().clubGroups.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt
		});
	}

	async listByClub(clubId: string): Promise<ClubGroup[]> {
		const rows = await getDB().clubGroups.where('clubId').equals(clubId).toArray();
		return rows.sort((a, b) => a.name.localeCompare(b.name));
	}

	async getByClubAndName(clubId: string, name: string): Promise<ClubGroup | undefined> {
		return getDB().clubGroups.where('[clubId+name]').equals([clubId, name]).first();
	}
}
