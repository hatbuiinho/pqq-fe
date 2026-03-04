import type { Student, SyncStatus } from '$lib/domain/models';
import { emitDataChanged } from '$lib/app/data-events';
import { getDB } from '$lib/data/local/app-db';
import type {
	BeltRankRepository,
	ClubGroupRepository,
	ClubRepository,
	StudentRepository
} from '$lib/data/repositories/interfaces';

type CreateStudentInput = Omit<
	Student,
	'id' | 'createdAt' | 'updatedAt' | 'lastModifiedAt' | 'syncStatus' | 'deletedAt'
>;

export class StudentUseCases {
	constructor(
		private readonly studentRepo: StudentRepository,
		private readonly clubRepo: ClubRepository,
		private readonly clubGroupRepo: ClubGroupRepository,
		private readonly beltRankRepo: BeltRankRepository
	) {}

	async list(): Promise<Student[]> {
		return this.studentRepo.list();
	}

	async create(input: CreateStudentInput): Promise<string> {
		if (!input.fullName.trim()) throw new Error('Student full name is required.');
		if (!input.clubId) throw new Error('Student club is required.');
		if (!input.beltRankId) throw new Error('Student belt rank is required.');

		const club = await this.clubRepo.getById(input.clubId);
		if (!club || club.deletedAt) throw new Error('Club does not exist.');
		if (club.syncStatus !== 'synced') throw new Error('Club is not synced yet.');
		if (!club.isActive) throw new Error('Club is inactive.');

		if (input.groupId) {
			const group = await this.clubGroupRepo.getById(input.groupId);
			if (!group || group.deletedAt) throw new Error('Group does not exist.');
			if (group.clubId !== input.clubId) throw new Error('Group does not belong to the selected club.');
			if (group.syncStatus !== 'synced') throw new Error('Group is not synced yet.');
			if (!group.isActive) throw new Error('Group is inactive.');
		}

		const beltRank = await this.beltRankRepo.getById(input.beltRankId);
		if (!beltRank || beltRank.deletedAt) throw new Error('Belt rank does not exist.');
		if (beltRank.syncStatus !== 'synced') throw new Error('Belt rank is not synced yet.');
		if (!beltRank.isActive) throw new Error('Belt rank is inactive.');

		const studentCode = input.studentCode?.trim() || undefined;
		const phone = input.phone?.trim() || undefined;
		const email = input.email?.trim() || undefined;
		const address = input.address?.trim() || undefined;
		const notes = input.notes?.trim() || undefined;

		const now = new Date().toISOString();
		const entity: Student = {
			id: crypto.randomUUID(),
			fullName: input.fullName.trim(),
			studentCode,
			dateOfBirth: input.dateOfBirth,
			gender: input.gender,
			phone,
			email,
			address,
			clubId: input.clubId,
			groupId: input.groupId,
			beltRankId: input.beltRankId,
			joinedAt: input.joinedAt,
			status: input.status,
			notes,
			createdAt: now,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus: 'pending',
			syncError: undefined
		};

		const id = await this.studentRepo.create(entity);
		emitDataChanged();
		return id;
	}

	async update(id: string, patch: Partial<CreateStudentInput>, syncStatus: SyncStatus = 'pending'): Promise<number> {
		const existingStudent = await this.studentRepo.getById(id);
		if (!existingStudent || existingStudent.deletedAt) throw new Error('Student does not exist.');
		const normalizedPatch = await this.prepareUpdatePatch(existingStudent, patch, syncStatus);
		const updated = await this.studentRepo.update(id, normalizedPatch);
		emitDataChanged();
		return updated;
	}

	async bulkUpdate(
		ids: string[],
		patch: Partial<CreateStudentInput>,
		syncStatus: SyncStatus = 'pending',
		emitChange = true
	): Promise<number> {
		const uniqueIDs = [...new Set(ids)];
		if (uniqueIDs.length === 0) return 0;

		const existingStudents = await Promise.all(uniqueIDs.map((id) => this.studentRepo.getById(id)));
		if (existingStudents.some((student) => !student || student.deletedAt)) {
			throw new Error('One or more students do not exist.');
		}

		const normalizedPatches = await Promise.all(
			existingStudents.map((student) =>
				this.prepareUpdatePatch(student as Student, { ...patch }, syncStatus)
			)
		);

		let updatedCount = 0;
		const db = getDB();
		await db.transaction('rw', db.students, async () => {
			for (const [index, studentID] of uniqueIDs.entries()) {
				updatedCount += await db.students.update(studentID, normalizedPatches[index]);
			}
		});

		if (emitChange) {
			emitDataChanged();
		}

		return updatedCount;
	}

	async softDelete(id: string): Promise<number> {
		const deleted = await this.studentRepo.softDelete(id, new Date().toISOString());
		emitDataChanged();
		return deleted;
	}

	async bulkSoftDelete(ids: string[], emitChange = true): Promise<number> {
		const uniqueIDs = [...new Set(ids)];
		if (uniqueIDs.length === 0) return 0;

		const deletedAt = new Date().toISOString();
		const db = getDB();
		let deletedCount = 0;

		await db.transaction('rw', db.students, async () => {
			for (const studentID of uniqueIDs) {
				deletedCount += await db.students.update(studentID, {
					deletedAt,
					updatedAt: deletedAt,
					lastModifiedAt: deletedAt,
					syncStatus: 'pending',
					syncError: undefined
				});
			}
		});

		if (emitChange) {
			emitDataChanged();
		}

		return deletedCount;
	}

	async restore(id: string): Promise<number> {
		const restored = await this.studentRepo.restore(id, new Date().toISOString());
		emitDataChanged();
		return restored;
	}

	private async prepareUpdatePatch(
		existingStudent: Student,
		patch: Partial<CreateStudentInput>,
		syncStatus: SyncStatus
	): Promise<Partial<Student>> {
		if (patch.clubId) {
			const club = await this.clubRepo.getById(patch.clubId);
			if (!club || club.deletedAt) throw new Error('Club does not exist.');
			if (club.syncStatus !== 'synced') throw new Error('Club is not synced yet.');
			if (!club.isActive) throw new Error('Club is inactive.');
		}

		const resolvedClubId = patch.clubId ?? existingStudent.clubId;
		if (patch.groupId) {
			const group = await this.clubGroupRepo.getById(patch.groupId);
			if (!group || group.deletedAt) throw new Error('Group does not exist.');
			if (group.clubId !== resolvedClubId) throw new Error('Group does not belong to the selected club.');
			if (group.syncStatus !== 'synced') throw new Error('Group is not synced yet.');
			if (!group.isActive) throw new Error('Group is inactive.');
		}

		const normalizedGroupId = patch.groupId === '' ? undefined : patch.groupId;

		if (patch.beltRankId) {
			const beltRank = await this.beltRankRepo.getById(patch.beltRankId);
			if (!beltRank || beltRank.deletedAt) throw new Error('Belt rank does not exist.');
			if (beltRank.syncStatus !== 'synced') throw new Error('Belt rank is not synced yet.');
			if (!beltRank.isActive) throw new Error('Belt rank is inactive.');
		}

		const studentCode = patch.studentCode === undefined ? undefined : patch.studentCode.trim() || undefined;
		const phone = patch.phone === undefined ? undefined : patch.phone.trim() || undefined;
		const email = patch.email === undefined ? undefined : patch.email.trim() || undefined;
		const address = patch.address === undefined ? undefined : patch.address.trim() || undefined;
		const notes = patch.notes === undefined ? undefined : patch.notes.trim() || undefined;
		const now = new Date().toISOString();

		return {
			...patch,
			fullName: patch.fullName?.trim(),
			studentCode,
			phone,
			email,
			address,
			groupId: normalizedGroupId,
			notes,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus,
			syncError: undefined
		};
	}
}
