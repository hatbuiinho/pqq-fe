import type {
	AttendanceActionPushRequest,
	AttendanceActionPushResponse,
	SyncPullRequest,
	SyncPullResponse,
	SyncPushRequest,
	SyncPushResponse,
	SyncRebaseResponse
} from '$lib/domain/sync';
import { withAuthHeaders } from '$lib/app/auth';

export interface SyncApiClient {
	pushAttendanceActions(request: AttendanceActionPushRequest): Promise<AttendanceActionPushResponse>;
	push(request: SyncPushRequest): Promise<SyncPushResponse>;
	pull(request: SyncPullRequest): Promise<SyncPullResponse>;
	rebase(): Promise<SyncRebaseResponse>;
}

type FetchLike = typeof fetch;

async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
	try {
		const payload = (await response.json()) as { error?: string; message?: string };
		return payload.error || payload.message || fallback;
	} catch {
		try {
			const text = await response.text();
			return text || fallback;
		} catch {
			return fallback;
		}
	}
}

export class HttpSyncApiClient implements SyncApiClient {
	constructor(
		private readonly baseUrl: string,
		private readonly fetchImpl: FetchLike = fetch
	) {}

	async pushAttendanceActions(
		request: AttendanceActionPushRequest
	): Promise<AttendanceActionPushResponse> {
		const response = await this.fetchImpl(`${this.baseUrl}/api/v1/sync/attendance-actions`, {
			method: 'POST',
			headers: withAuthHeaders({
				'content-type': 'application/json'
			}),
			body: JSON.stringify(request)
		});

		if (!response.ok) {
			throw new Error(
				await extractErrorMessage(
					response,
					`Attendance sync failed with status ${response.status}.`
				)
			);
		}

		return response.json() as Promise<AttendanceActionPushResponse>;
	}

	async push(request: SyncPushRequest): Promise<SyncPushResponse> {
		const response = await this.fetchImpl(`${this.baseUrl}/api/v1/sync/push`, {
			method: 'POST',
			headers: withAuthHeaders({
				'content-type': 'application/json'
			}),
			body: JSON.stringify(request)
		});

		if (!response.ok) {
			throw new Error(
				await extractErrorMessage(response, `Sync push failed with status ${response.status}.`)
			);
		}

		return response.json() as Promise<SyncPushResponse>;
	}

	async pull(request: SyncPullRequest): Promise<SyncPullResponse> {
		const searchParams = new URLSearchParams();
		searchParams.set('deviceId', request.deviceId);
		if (request.since) searchParams.set('since', request.since);
		if (request.limit) searchParams.set('limit', String(request.limit));

		const response = await this.fetchImpl(
			`${this.baseUrl}/api/v1/sync/pull?${searchParams.toString()}`,
			{
				method: 'GET',
				headers: withAuthHeaders({
					accept: 'application/json'
				})
			}
		);

		if (!response.ok) {
			throw new Error(
				await extractErrorMessage(response, `Sync pull failed with status ${response.status}.`)
			);
		}

		return response.json() as Promise<SyncPullResponse>;
	}

	async rebase(): Promise<SyncRebaseResponse> {
		const response = await this.fetchImpl(`${this.baseUrl}/api/v1/sync/rebase`, {
			method: 'GET',
			headers: withAuthHeaders({
				accept: 'application/json'
			})
		});

		if (!response.ok) {
			throw new Error(
				await extractErrorMessage(response, `Sync rebase failed with status ${response.status}.`)
			);
		}

		return response.json() as Promise<SyncRebaseResponse>;
	}
}
