import type { Club, SyncStatus } from '$lib/domain/models';
import { emitDataChanged } from '$lib/app/data-events';
import type { ClubRepository } from '$lib/data/repositories/interfaces';
import { generateClubId, generateUniqueClubCode } from '$lib/domain/string-utils';

type CreateClubInput = Omit<
	Club,
	'id' | 'createdAt' | 'updatedAt' | 'lastModifiedAt' | 'syncStatus' | 'deletedAt'
>;

export class ClubUseCases {
	constructor(private readonly repo: ClubRepository) {}

	async list(): Promise<Club[]> {
		return this.repo.list();
	}

	async create(input: CreateClubInput): Promise<string> {
		if (!input.name.trim()) throw new Error('Club name is required.');

		const existingClubs = await this.repo.list();
		const now = new Date().toISOString();
		const normalizedName = input.name.trim();
		const entity: Club = {
			id: generateClubId(normalizedName),
			name: normalizedName,
			code: generateUniqueClubCode(
				normalizedName,
				existingClubs.map((club) => club.code ?? '')
			),
			phone: input.phone?.trim(),
			email: input.email?.trim(),
			address: input.address?.trim(),
			notes: input.notes?.trim(),
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

	async update(id: string, patch: Partial<CreateClubInput>, syncStatus: SyncStatus = 'pending'): Promise<number> {
		const now = new Date().toISOString();
		const existingClubs = await this.repo.list();
		const normalizedName = patch.name?.trim();
		const updated = await this.repo.update(id, {
			...patch,
			name: normalizedName,
			code: normalizedName
				? generateUniqueClubCode(
						normalizedName,
						existingClubs.filter((club) => club.id !== id).map((club) => club.code ?? '')
					)
				: undefined,
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
