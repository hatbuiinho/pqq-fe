import { DexieAttendanceRecordRepository } from '$lib/data/repositories/dexie/dexie-attendance-record-repository';
import { DexieAttendanceSessionRepository } from '$lib/data/repositories/dexie/dexie-attendance-session-repository';
import { DexieBeltRankRepository } from '$lib/data/repositories/dexie/dexie-belt-rank-repository';
import { DexieClubGroupRepository } from '$lib/data/repositories/dexie/dexie-club-group-repository';
import { DexieClubRepository } from '$lib/data/repositories/dexie/dexie-club-repository';
import { DexieClubScheduleRepository } from '$lib/data/repositories/dexie/dexie-club-schedule-repository';
import { DexieStudentRepository } from '$lib/data/repositories/dexie/dexie-student-repository';
import { DexieStudentScheduleProfileRepository } from '$lib/data/repositories/dexie/dexie-student-schedule-profile-repository';
import { DexieStudentScheduleRepository } from '$lib/data/repositories/dexie/dexie-student-schedule-repository';
import { AttendanceUseCases } from '$lib/app/use-cases/attendance-use-cases';
import { BeltRankUseCases } from '$lib/app/use-cases/belt-rank-use-cases';
import { ClubGroupUseCases } from '$lib/app/use-cases/club-group-use-cases';
import { ClubUseCases } from '$lib/app/use-cases/club-use-cases';
import { ClubScheduleUseCases } from '$lib/app/use-cases/club-schedule-use-cases';
import { StudentUseCases } from '$lib/app/use-cases/student-use-cases';
import { StudentScheduleUseCases } from '$lib/app/use-cases/student-schedule-use-cases';

const attendanceSessionRepository = new DexieAttendanceSessionRepository();
const attendanceRecordRepository = new DexieAttendanceRecordRepository();
const clubRepository = new DexieClubRepository();
const clubGroupRepository = new DexieClubGroupRepository();
const clubScheduleRepository = new DexieClubScheduleRepository();
const beltRankRepository = new DexieBeltRankRepository();
const studentRepository = new DexieStudentRepository();
const studentScheduleProfileRepository = new DexieStudentScheduleProfileRepository();
const studentScheduleRepository = new DexieStudentScheduleRepository();

export const attendanceUseCases = new AttendanceUseCases(
	attendanceSessionRepository,
	attendanceRecordRepository,
	clubRepository,
	studentRepository,
	clubScheduleRepository,
	studentScheduleProfileRepository,
	studentScheduleRepository
);
export const clubGroupUseCases = new ClubGroupUseCases(clubGroupRepository, clubRepository);
export const clubUseCases = new ClubUseCases(clubRepository);
export const clubScheduleUseCases = new ClubScheduleUseCases(
	clubScheduleRepository,
	clubRepository
);
export const beltRankUseCases = new BeltRankUseCases(beltRankRepository);
export const studentUseCases = new StudentUseCases(
	studentRepository,
	clubRepository,
	clubGroupRepository,
	beltRankRepository
);
export const studentScheduleUseCases = new StudentScheduleUseCases(
	studentScheduleProfileRepository,
	studentScheduleRepository,
	studentRepository,
	clubRepository,
	clubScheduleRepository
);
