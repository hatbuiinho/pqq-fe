import { getApiBaseUrl } from '$lib/app/sync/sync-config';
import { withAuthHeaders } from '$lib/app/auth';
import type { AttendanceRecord, AttendanceSession } from '$lib/domain/models';

type CreateAttendanceSessionPayload = {
	clubId: string;
	sessionDate: string;
	notes?: string;
};

type CreateAttendanceSessionResponse = {
	serverTime: string;
	session: AttendanceSession;
	records: AttendanceRecord[];
};

async function parseJson<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { error?: string } | null;
		throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
	}

	return (await response.json()) as T;
}

export const attendanceApi = {
	async createSession(payload: CreateAttendanceSessionPayload): Promise<CreateAttendanceSessionResponse> {
		const response = await fetch(`${getApiBaseUrl()}/api/v1/attendance/sessions`, {
			method: 'POST',
			headers: withAuthHeaders({
				'Content-Type': 'application/json'
			}),
			body: JSON.stringify(payload)
		});

		return parseJson<CreateAttendanceSessionResponse>(response);
	}
};
