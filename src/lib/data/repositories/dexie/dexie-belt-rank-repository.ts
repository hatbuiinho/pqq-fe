import type { BeltRank } from '$lib/domain/models';
import { getDB } from '$lib/data/local/app-db';
import type { BeltRankRepository, CreateEntity } from '$lib/data/repositories/interfaces';

export class DexieBeltRankRepository implements BeltRankRepository {
	private isVisible(beltRank: BeltRank): boolean {
		return !beltRank.deletedAt || beltRank.syncStatus !== 'synced';
	}

	async getById(id: string): Promise<BeltRank | undefined> {
		return getDB().beltRanks.get(id);
	}

	async list(): Promise<BeltRank[]> {
		const rows = await getDB().beltRanks.toArray();
		return rows.filter((beltRank) => this.isVisible(beltRank)).sort((a, b) => a.order - b.order);
	}

	async create(entity: CreateEntity<BeltRank, string>): Promise<string> {
		return getDB().beltRanks.add(entity as BeltRank);
	}

	async update(id: string, patch: Partial<BeltRank>): Promise<number> {
		return getDB().beltRanks.update(id, patch);
	}

	async softDelete(id: string, deletedAt: string): Promise<number> {
		return getDB().beltRanks.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async restore(id: string, restoredAt: string): Promise<number> {
		return getDB().beltRanks.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async getByOrder(order: number): Promise<BeltRank | undefined> {
		const row = await getDB().beltRanks.where('order').equals(order).first();
		if (!row || row.deletedAt) return undefined;
		return row;
	}
}
