import { DexieBeltRankRepository } from '$lib/data/repositories/dexie/dexie-belt-rank-repository';
import { DexieClubRepository } from '$lib/data/repositories/dexie/dexie-club-repository';
import { DexieStudentRepository } from '$lib/data/repositories/dexie/dexie-student-repository';
import { BeltRankUseCases } from '$lib/app/use-cases/belt-rank-use-cases';
import { ClubUseCases } from '$lib/app/use-cases/club-use-cases';
import { StudentUseCases } from '$lib/app/use-cases/student-use-cases';

const clubRepository = new DexieClubRepository();
const beltRankRepository = new DexieBeltRankRepository();
const studentRepository = new DexieStudentRepository();

export const clubUseCases = new ClubUseCases(clubRepository);
export const beltRankUseCases = new BeltRankUseCases(beltRankRepository);
export const studentUseCases = new StudentUseCases(studentRepository, clubRepository, beltRankRepository);
