import type { AttendanceSession } from '$lib/domain/models';
import { getDB } from '$lib/data/local/app-db';
import type { AttendanceSessionRepository, CreateEntity } from '$lib/data/repositories/interfaces';

export class DexieAttendanceSessionRepository implements AttendanceSessionRepository {
	private isVisible(session: AttendanceSession): boolean {
		return !session.deletedAt || session.syncStatus !== 'synced';
	}

	async getById(id: string): Promise<AttendanceSession | undefined> {
		return getDB().attendanceSessions.get(id);
	}

	async list(): Promise<AttendanceSession[]> {
		const rows = (await getDB().attendanceSessions.toArray()).filter((row) => this.isVisible(row));
		return rows.sort((a, b) => {
			if (a.sessionDate === b.sessionDate) return b.updatedAt.localeCompare(a.updatedAt);
			return b.sessionDate.localeCompare(a.sessionDate);
		});
	}

	async create(entity: CreateEntity<AttendanceSession, string>): Promise<string> {
		return getDB().attendanceSessions.add(entity as AttendanceSession);
	}

	async update(id: string, patch: Partial<AttendanceSession>): Promise<number> {
		return getDB().attendanceSessions.update(id, patch);
	}

	async softDelete(id: string, deletedAt: string): Promise<number> {
		return getDB().attendanceSessions.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async restore(id: string, restoredAt: string): Promise<number> {
		return getDB().attendanceSessions.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async getByClubAndDate(
		clubId: string,
		sessionDate: string
	): Promise<AttendanceSession | undefined> {
		const row = await getDB()
			.attendanceSessions.where('[clubId+sessionDate]')
			.equals([clubId, sessionDate])
			.first();
		if (!row || row.deletedAt) return undefined;
		return row;
	}
}
