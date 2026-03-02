import type { BeltRank, Club, Student } from '$lib/domain/models';

export type CreateEntity<T, TId> = Omit<T, 'id'> & { id?: TId };

export interface BaseRepository<T extends { id: TId }, TId> {
	getById(id: TId): Promise<T | undefined>;
	list(): Promise<T[]>;
	create(entity: CreateEntity<T, TId>): Promise<TId>;
	update(id: TId, patch: Partial<T>): Promise<number>;
	softDelete(id: TId, deletedAt: string): Promise<number>;
	restore(id: TId, restoredAt: string): Promise<number>;
}

export interface ClubRepository extends BaseRepository<Club, string> {
	searchByName(query: string): Promise<Club[]>;
}

export interface BeltRankRepository extends BaseRepository<BeltRank, string> {
	getByOrder(order: number): Promise<BeltRank | undefined>;
}

export interface StudentRepository extends BaseRepository<Student, string> {
	listByClub(clubId: string): Promise<Student[]>;
	listByBeltRank(beltRankId: string): Promise<Student[]>;
}
