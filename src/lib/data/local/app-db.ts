import { browser } from '$app/environment';
import type { BeltRank, Club, Student } from '$lib/domain/models';
import Dexie, { type EntityTable } from 'dexie';

export class AppDB extends Dexie {
	clubs!: EntityTable<Club, 'id'>;
	beltRanks!: EntityTable<BeltRank, 'id'>;
	students!: EntityTable<Student, 'id'>;

	constructor() {
		super('martial-arts-club-db');

		this.version(2).stores({
			clubs: 'id, code, name, isActive, updatedAt, syncStatus, deletedAt',
			beltRanks: 'id, name, order, isActive, updatedAt, syncStatus, deletedAt',
			students:
				'id, studentCode, fullName, clubId, beltRankId, status, updatedAt, syncStatus, deletedAt, [clubId+status], [clubId+beltRankId]'
		});
	}
}

let db: AppDB | null = null;

export function getDB(): AppDB {
	if (!browser) {
		throw new Error('IndexedDB is only available in the browser.');
	}

	if (!db) {
		db = new AppDB();
	}

	return db;
}
