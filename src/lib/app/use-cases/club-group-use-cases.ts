import { emitDataChanged } from '$lib/app/data-events';
import type { Club, ClubGroup } from '$lib/domain/models';
import type { ClubGroupRepository, ClubRepository } from '$lib/data/repositories/interfaces';

type CreateClubGroupInput = {
	clubId: string;
	name: string;
	description?: string;
	isActive: boolean;
};

export class ClubGroupUseCases {
	constructor(
		private readonly repo: ClubGroupRepository,
		private readonly clubRepo: ClubRepository
	) {}

	async list(): Promise<ClubGroup[]> {
		return this.repo.list();
	}

	async listByClub(clubId: string): Promise<ClubGroup[]> {
		return this.repo.listByClub(clubId);
	}

	async create(input: CreateClubGroupInput): Promise<string> {
		const club = await this.assertClubExists(input.clubId);
		const normalizedName = input.name.trim();
		if (!normalizedName) throw new Error('Group name is required.');

		const existingGroups = await this.repo.listByClub(club.id);
		const hasDuplicate = existingGroups.some(
			(group) =>
				group.id !== undefined &&
				!group.deletedAt &&
				group.name.trim().toLowerCase() === normalizedName.toLowerCase()
		);
		if (hasDuplicate) throw new Error('Group name already exists in this club.');

		const now = new Date().toISOString();
		const entity: ClubGroup = {
			id: crypto.randomUUID(),
			clubId: club.id,
			name: normalizedName,
			description: input.description?.trim() || undefined,
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

	async update(id: string, patch: Partial<Omit<CreateClubGroupInput, 'clubId'>>): Promise<number> {
		const existing = await this.repo.getById(id);
		if (!existing || existing.deletedAt) throw new Error('Group does not exist.');

		const normalizedName = patch.name?.trim();
		if (normalizedName !== undefined && !normalizedName) throw new Error('Group name is required.');

		if (normalizedName) {
			const existingGroups = await this.repo.listByClub(existing.clubId);
			const hasDuplicate = existingGroups.some(
				(group) =>
					group.id !== id &&
					!group.deletedAt &&
					group.name.trim().toLowerCase() === normalizedName.toLowerCase()
			);
			if (hasDuplicate) throw new Error('Group name already exists in this club.');
		}

		const now = new Date().toISOString();
		const updated = await this.repo.update(id, {
			name: normalizedName,
			description: patch.description?.trim() || undefined,
			isActive: patch.isActive,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus: 'pending',
			syncError: undefined
		});

		emitDataChanged();
		return updated;
	}

	async softDelete(id: string): Promise<number> {
		const deletedAt = new Date().toISOString();
		const deleted = await this.repo.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt,
			syncStatus: 'pending',
			syncError: undefined
		});
		emitDataChanged();
		return deleted;
	}

	async restore(id: string): Promise<number> {
		const existing = await this.repo.getById(id);
		if (!existing) throw new Error('Group does not exist.');

		const existingGroups = await this.repo.listByClub(existing.clubId);
		const hasDuplicate = existingGroups.some(
			(group) =>
				group.id !== id &&
				!group.deletedAt &&
				group.name.trim().toLowerCase() === existing.name.trim().toLowerCase()
		);
		if (hasDuplicate) throw new Error('Cannot restore because another active group already uses this name.');

		const restoredAt = new Date().toISOString();
		const restored = await this.repo.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt,
			syncStatus: 'pending',
			syncError: undefined
		});
		emitDataChanged();
		return restored;
	}

	private async assertClubExists(clubId: string): Promise<Club> {
		const club = await this.clubRepo.getById(clubId);
		if (!club || club.deletedAt) throw new Error('Club does not exist.');
		return club;
	}
}
