import type { BeltRank, SyncStatus } from '$lib/domain/models';
import { emitDataChanged } from '$lib/app/data-events';
import type { BeltRankRepository } from '$lib/data/repositories/interfaces';
import { generateBeltRankId } from '$lib/domain/string-utils';

type CreateBeltRankInput = Omit<
	BeltRank,
	'id' | 'createdAt' | 'updatedAt' | 'lastModifiedAt' | 'syncStatus' | 'deletedAt'
>;

export class BeltRankUseCases {
	constructor(private readonly repo: BeltRankRepository) {}

	async list(): Promise<BeltRank[]> {
		return this.repo.list();
	}

	async create(input: CreateBeltRankInput): Promise<string> {
		if (!input.name.trim()) throw new Error('Belt rank name is required.');
		if (!Number.isInteger(input.order) || input.order < 1) throw new Error('Belt rank order must be >= 1.');

		const duplicated = await this.repo.getByOrder(input.order);
		if (duplicated) throw new Error('Belt rank order already exists.');

		const normalizedName = input.name.trim();
		const generatedID = generateBeltRankId(normalizedName);
		const duplicatedID = await this.repo.getById(generatedID);
		if (duplicatedID) throw new Error('Belt rank name already exists.');

		const now = new Date().toISOString();
		const entity: BeltRank = {
			id: generatedID,
			name: normalizedName,
			order: input.order,
			description: input.description?.trim(),
			isActive: input.isActive,
			createdAt: now,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus: 'pending',
			syncError: undefined
		};

		const id = await this.repo.create(entity);
		emitDataChanged();
		return id;
	}

	async update(
		id: string,
		patch: Partial<CreateBeltRankInput>,
		syncStatus: SyncStatus = 'pending'
	): Promise<number> {
		const current = await this.repo.getById(id);
		if (!current) throw new Error('Belt rank does not exist.');

		const nextOrder = patch.order ?? current.order;
		const nextName = patch.name?.trim() ?? current.name;
		if (!Number.isInteger(nextOrder) || nextOrder < 1) throw new Error('Belt rank order must be >= 1.');

		const duplicated = await this.repo.getByOrder(nextOrder);
		if (duplicated && duplicated.id !== id) throw new Error('Belt rank order already exists.');

		const now = new Date().toISOString();
		const updated = await this.repo.update(id, {
			...patch,
			name: nextName,
			order: nextOrder,
			description: patch.description?.trim(),
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus,
			syncError: undefined
		});
		emitDataChanged();
		return updated;
	}

	async softDelete(id: string): Promise<number> {
		const deleted = await this.repo.softDelete(id, new Date().toISOString());
		emitDataChanged();
		return deleted;
	}

	async restore(id: string): Promise<number> {
		const restored = await this.repo.restore(id, new Date().toISOString());
		emitDataChanged();
		return restored;
	}
}
