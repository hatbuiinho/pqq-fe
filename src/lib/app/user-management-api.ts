import { withAuthHeaders } from '$lib/app/auth';
import { getApiBaseUrl } from '$lib/app/sync/sync-config';
import type {
	CreateUserMembershipPayload,
	CreateUserPayload,
	ResetUserPasswordPayload,
	UpdateUserStatusPayload,
	UserAccount,
	UserClubMembership
} from '$lib/domain/models';

type ListUsersResponse = {
	items: UserAccount[];
};

type UserMembershipsResponse = {
	user: UserAccount;
	memberships: UserClubMembership[];
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

export const userManagementApi = {
	async listUsers(): Promise<UserAccount[]> {
		const response = await fetch(buildUrl('/api/v1/auth/users'), {
			headers: withAuthHeaders()
		});
		const payload = await parseJson<ListUsersResponse>(response);
		return payload.items ?? [];
	},

	async createUser(payload: CreateUserPayload): Promise<UserAccount> {
		const response = await fetch(buildUrl('/api/v1/auth/users'), {
			method: 'POST',
			headers: withAuthHeaders({
				'Content-Type': 'application/json'
			}),
			body: JSON.stringify(payload)
		});
		return parseJson<UserAccount>(response);
	},

	async updateUserStatus(userId: string, payload: UpdateUserStatusPayload): Promise<UserAccount> {
		const response = await fetch(buildUrl(`/api/v1/auth/users/${userId}/status`), {
			method: 'POST',
			headers: withAuthHeaders({
				'Content-Type': 'application/json'
			}),
			body: JSON.stringify(payload)
		});
		return parseJson<UserAccount>(response);
	},

	async resetUserPassword(userId: string, payload: ResetUserPasswordPayload): Promise<UserAccount> {
		const response = await fetch(buildUrl(`/api/v1/auth/users/${userId}/reset-password`), {
			method: 'POST',
			headers: withAuthHeaders({
				'Content-Type': 'application/json'
			}),
			body: JSON.stringify(payload)
		});
		return parseJson<UserAccount>(response);
	},

	async getUserMemberships(userId: string): Promise<UserMembershipsResponse> {
		const response = await fetch(buildUrl(`/api/v1/auth/users/${userId}/memberships`), {
			headers: withAuthHeaders()
		});
		return parseJson<UserMembershipsResponse>(response);
	},

	async addMembership(
		userId: string,
		payload: CreateUserMembershipPayload
	): Promise<UserClubMembership> {
		const response = await fetch(buildUrl(`/api/v1/auth/users/${userId}/memberships`), {
			method: 'POST',
			headers: withAuthHeaders({
				'Content-Type': 'application/json'
			}),
			body: JSON.stringify(payload)
		});
		return parseJson<UserClubMembership>(response);
	},

	async removeMembership(membershipId: string): Promise<UserClubMembership> {
		const response = await fetch(buildUrl(`/api/v1/auth/memberships/${membershipId}/delete`), {
			method: 'POST',
			headers: withAuthHeaders()
		});
		return parseJson<UserClubMembership>(response);
	}
};
