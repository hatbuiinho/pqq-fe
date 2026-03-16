import type { AttendanceRecord } from '$lib/domain/models';
import { getDB } from '$lib/data/local/app-db';
import type { AttendanceRecordRepository, CreateEntity } from '$lib/data/repositories/interfaces';

export class DexieAttendanceRecordRepository implements AttendanceRecordRepository {
	private isVisible(record: AttendanceRecord): boolean {
		return !record.deletedAt || record.syncStatus !== 'synced';
	}

	async getById(id: string): Promise<AttendanceRecord | undefined> {
		return getDB().attendanceRecords.get(id);
	}

	async list(): Promise<AttendanceRecord[]> {
		const rows = await getDB().attendanceRecords.toArray();
		return rows.filter((record) => this.isVisible(record));
	}

	async create(entity: CreateEntity<AttendanceRecord, string>): Promise<string> {
		return getDB().attendanceRecords.add(entity as AttendanceRecord);
	}

	async update(id: string, patch: Partial<AttendanceRecord>): Promise<number> {
		return getDB().attendanceRecords.update(id, patch);
	}

	async softDelete(id: string, deletedAt: string): Promise<number> {
		return getDB().attendanceRecords.update(id, {
			deletedAt,
			updatedAt: deletedAt,
			lastModifiedAt: deletedAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async restore(id: string, restoredAt: string): Promise<number> {
		return getDB().attendanceRecords.update(id, {
			deletedAt: undefined,
			updatedAt: restoredAt,
			lastModifiedAt: restoredAt,
			syncStatus: 'pending',
			syncError: undefined
		});
	}

	async listBySession(sessionId: string): Promise<AttendanceRecord[]> {
		const rows = await getDB().attendanceRecords.where('sessionId').equals(sessionId).toArray();
		return rows.filter((row) => this.isVisible(row));
	}

	async getBySessionAndStudent(
		sessionId: string,
		studentId: string
	): Promise<AttendanceRecord | undefined> {
		const row = await getDB()
			.attendanceRecords.where('[sessionId+studentId]')
			.equals([sessionId, studentId])
			.first();
		if (!row || row.deletedAt) return undefined;
		return row;
	}
}
