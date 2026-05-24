import { withAuthHeaders } from '$lib/app/auth';
import { getApiBaseUrl } from '$lib/app/sync/sync-config';
import type { Student } from '$lib/domain/models';

type UpsertStudentsResponse = {
	serverTime: string;
	students: Student[];
};

type DeleteStudentsResponse = {
	serverTime: string;
	students: Student[];
};

function buildUrl(path: string) {
	return `${getApiBaseUrl()}${path}`;
}

async function parseJson<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { error?: string } | null;
		throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
	}

	return (await response.json()) as T;
}

export const studentApi = {
	async upsertStudent(student: Student): Promise<Student> {
		const payload = await this.upsertStudents([student]);
		return payload[0];
	},

	async upsertStudents(students: Student[]): Promise<Student[]> {
		const response = await fetch(buildUrl('/api/v1/students'), {
			method: 'POST',
			headers: withAuthHeaders({
				'Content-Type': 'application/json'
			}),
			body: JSON.stringify({ students })
		});
		const payload = await parseJson<UpsertStudentsResponse>(response);
		return payload.students ?? [];
	},

	async deleteStudent(studentId: string): Promise<Student> {
		const payload = await this.deleteStudents([studentId]);
		return payload[0];
	},

	async deleteStudents(studentIds: string[]): Promise<Student[]> {
		const response = await fetch(buildUrl('/api/v1/students/delete'), {
			method: 'POST',
			headers: withAuthHeaders({
				'Content-Type': 'application/json'
			}),
			body: JSON.stringify({ studentIds })
		});
		const payload = await parseJson<DeleteStudentsResponse>(response);
		return payload.students ?? [];
	}
};
