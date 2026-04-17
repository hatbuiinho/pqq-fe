import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { getApiBaseUrl } from '$lib/app/sync/sync-config';
import { clearAppData } from '$lib/data/local/app-db';
import { writable, get } from 'svelte/store';

const AUTH_STORAGE_KEY = 'pqq-auth-session';
const LAST_SYNC_AT_KEY = 'pqq-last-sync-at';

export type AuthUser = {
	id: string;
	email: string;
	fullName: string;
	systemRole: string;
	isActive: boolean;
	lastLoginAt?: string;
	createdAt: string;
	updatedAt: string;
};

export type AuthClubMembership = {
	id: string;
	userId: string;
	clubId: string;
	clubName: string;
	clubRole: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
};

export type AuthClubPermissionKey =
	| 'club:read'
	| 'club:manage'
	| 'membership:manage'
	| 'students:read'
	| 'students:write'
	| 'students:delete'
	| 'attendance:read'
	| 'attendance:write'
	| 'attendance:reopen'
	| 'belt_ranks:read'
	| 'belt_ranks:write'
	| 'club_groups:read'
	| 'club_groups:write'
	| 'imports:manage'
	| 'media:manage'
	| 'audit_logs:read';

export type AuthSystemPermissionKey = 'users:manage';

export type AuthClubPermissions = {
	clubId: string;
	systemRole: string;
	clubRole?: string;
	isSystemRole: boolean;
	permissions: Record<AuthClubPermissionKey, boolean>;
};

export type AuthSession = {
	token: string;
	user: AuthUser;
	memberships: AuthClubMembership[];
	activeClubId?: string;
	clubPermissionsByClubId: Record<string, AuthClubPermissions>;
};

type AuthMeResponse = {
	user: AuthUser;
	memberships: AuthClubMembership[];
};

type AuthLoginPayload = AuthMeResponse & {
	token: string;
};

export const authSession = writable<AuthSession | null>(null);

const ALL_PERMISSION_KEYS: AuthClubPermissionKey[] = [
	'club:read',
	'club:manage',
	'membership:manage',
	'students:read',
	'students:write',
	'students:delete',
	'attendance:read',
	'attendance:write',
	'attendance:reopen',
	'belt_ranks:read',
	'belt_ranks:write',
	'club_groups:read',
	'club_groups:write',
	'imports:manage',
	'media:manage',
	'audit_logs:read'
];

const ALL_SYSTEM_PERMISSION_KEYS: AuthSystemPermissionKey[] = ['users:manage'];

function persistSession(session: AuthSession | null) {
	if (typeof window === 'undefined') return;
	if (!session) {
		window.localStorage.removeItem(AUTH_STORAGE_KEY);
		return;
	}
	window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function loadStoredSession(): AuthSession | null {
	if (typeof window === 'undefined') return null;
	const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
	if (!raw) return null;
	return parseJson<AuthSession>(raw);
}

function parseJson<T>(value: string): T | null {
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

function ensureActiveClubId(
	activeClubId: string | undefined,
	memberships: AuthClubMembership[]
): string | undefined {
	if (activeClubId && memberships.some((membership) => membership.clubId === activeClubId)) {
		return activeClubId;
	}
	return memberships[0]?.clubId;
}

export function loadAuthSession() {
	const parsed = loadStoredSession();
	if (!parsed) {
		authSession.set(null);
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(AUTH_STORAGE_KEY);
		}
		return;
	}
	if (!parsed?.token || !parsed.user) {
		authSession.set(null);
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem(AUTH_STORAGE_KEY);
		}
		return;
	}

	authSession.set({
		...parsed,
		activeClubId: ensureActiveClubId(parsed.activeClubId, parsed.memberships ?? []),
		memberships: parsed.memberships ?? [],
		clubPermissionsByClubId: parsed.clubPermissionsByClubId ?? {}
	});
}

export async function login(email: string, password: string): Promise<AuthSession> {
	const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/login`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ email, password })
	});
	const payload = (await response.json().catch(() => null)) as
		| AuthLoginPayload
		| { error?: string }
		| null;

	if (!response.ok || !payload || !('token' in payload)) {
		throw new Error(
			payload && 'error' in payload && payload.error ? payload.error : 'Đăng nhập thất bại.'
		);
	}

	return establishAuthenticatedSession(payload);
}

export async function refreshAuthSession(): Promise<AuthSession | null> {
	const session = get(authSession);
	if (!session?.token) return null;
	const requestedToken = session.token;

	let response: Response;
	try {
		response = await fetch(`${getApiBaseUrl()}/api/v1/auth/me`, {
			headers: {
				Authorization: `Bearer ${requestedToken}`
			}
		});
	} catch (error) {
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			return session;
		}
		throw error;
	}
	const payload = (await response.json().catch(() => null)) as AuthMeResponse | { error?: string } | null;
	const latestSession = get(authSession);
	if (latestSession?.token !== requestedToken) {
		return latestSession ?? null;
	}

	if (!response.ok || !payload || !('user' in payload)) {
		if (response.status === 401 || response.status === 403) {
			clearAuthSession();
		}
		throw new Error(
			payload && 'error' in payload && payload.error ? payload.error : 'Phiên đăng nhập đã hết hạn.'
		);
	}

	const nextSession: AuthSession = {
		token: requestedToken,
		user: payload.user,
		memberships: payload.memberships,
		activeClubId: ensureActiveClubId(session.activeClubId, payload.memberships),
		clubPermissionsByClubId: filterPermissionCache(
			session.clubPermissionsByClubId,
			payload.memberships,
			payload.user.systemRole
		)
	};
	authSession.set(nextSession);
	persistSession(nextSession);
	return nextSession;
}

export function clearAuthSession() {
	authSession.set(null);
	persistSession(null);
}

export function getAuthToken(): string | undefined {
	const session = get(authSession);
	if (session?.token) {
		return session.token;
	}

	return loadStoredSession()?.token;
}

export function withAuthHeaders(headers?: HeadersInit): Headers {
	const nextHeaders = new Headers(headers);
	const token = getAuthToken();
	if (token) {
		nextHeaders.set('Authorization', `Bearer ${token}`);
	}
	return nextHeaders;
}

export async function logout(redirectTo: '/login' | '/' = '/login') {
	clearAuthSession();
	await resetLocalStateForAuthenticatedUser();
	await goto(resolve(redirectTo));
}

export async function establishAuthenticatedSession(
	payload: AuthLoginPayload
): Promise<AuthSession> {
	const session: AuthSession = {
		token: payload.token,
		user: payload.user,
		memberships: payload.memberships,
		activeClubId: ensureActiveClubId(undefined, payload.memberships),
		clubPermissionsByClubId: {}
	};
	await resetLocalStateForAuthenticatedUser();
	authSession.set(session);
	persistSession(session);
	return session;
}

export function setActiveClubId(clubId: string) {
	const session = get(authSession);
	if (!session) return;
	const nextSession: AuthSession = {
		...session,
		activeClubId: ensureActiveClubId(clubId, session.memberships)
	};
	authSession.set(nextSession);
	persistSession(nextSession);
}

export function getClubPermissionsForSession(
	session: AuthSession | null,
	clubId?: string
): AuthClubPermissions | null {
	if (!session) return null;

	const targetClubId = clubId ?? session.activeClubId;
	if (!targetClubId) return null;

	return (
		session.clubPermissionsByClubId[targetClubId] ??
		buildFallbackClubPermissions(session, targetClubId)
	);
}

export function getClubPermissions(clubId?: string): AuthClubPermissions | null {
	return getClubPermissionsForSession(get(authSession), clubId);
}

export function hasClubPermissionForSession(
	session: AuthSession | null,
	permission: AuthClubPermissionKey,
	options?: { clubId?: string }
): boolean {
	const permissions = getClubPermissionsForSession(session, options?.clubId);
	return permissions?.permissions[permission] === true;
}

export function hasClubPermission(
	permission: AuthClubPermissionKey,
	options?: { clubId?: string }
): boolean {
	return hasClubPermissionForSession(get(authSession), permission, options);
}

export function isSystemAdminSession(session: AuthSession | null): boolean {
	return session?.user.systemRole === 'sys_admin';
}

export function isSystemAdmin(): boolean {
	return isSystemAdminSession(get(authSession));
}

export function hasSystemPermissionForSession(
	session: AuthSession | null,
	permission: AuthSystemPermissionKey
): boolean {
	if (!isSystemAdminSession(session)) return false;
	return ALL_SYSTEM_PERMISSION_KEYS.includes(permission);
}

export function hasSystemPermission(permission: AuthSystemPermissionKey): boolean {
	return hasSystemPermissionForSession(get(authSession), permission);
}

export async function fetchClubPermissions(clubId: string): Promise<AuthClubPermissions> {
	const session = get(authSession);
	if (!session?.token) {
		throw new Error('Phiên đăng nhập đã hết hạn.');
	}

	const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/clubs/${clubId}/permissions`, {
		headers: {
			Authorization: `Bearer ${session.token}`
		}
	});
	const payload = (await response.json().catch(() => null)) as
		| AuthClubPermissions
		| { error?: string }
		| null;

	if (!response.ok || !payload || !('permissions' in payload)) {
		throw new Error(
			payload && 'error' in payload && payload.error
				? payload.error
				: 'Không thể tải quyền của câu lạc bộ.'
		);
	}

	const nextSession: AuthSession = {
		...session,
		clubPermissionsByClubId: {
			...session.clubPermissionsByClubId,
			[clubId]: payload
		}
	};
	authSession.set(nextSession);
	persistSession(nextSession);
	return payload;
}

export async function ensureClubPermissions(clubId?: string): Promise<AuthClubPermissions | null> {
	const session = get(authSession);
	if (!session) return null;

	const targetClubId = clubId ?? session.activeClubId;
	if (!targetClubId) return null;

	const cachedPermissions = session.clubPermissionsByClubId[targetClubId];
	if (cachedPermissions) {
		return cachedPermissions;
	}

	return fetchClubPermissions(targetClubId);
}

function filterPermissionCache(
	cache: Record<string, AuthClubPermissions> | undefined,
	memberships: AuthClubMembership[],
	systemRole: string
): Record<string, AuthClubPermissions> {
	if (!cache) return {};
	if (systemRole === 'sys_admin') return cache;

	const allowedClubIds = new Set(memberships.map((membership) => membership.clubId));
	return Object.fromEntries(
		Object.entries(cache).filter(([clubId]) => allowedClubIds.has(clubId))
	);
}

function buildFallbackClubPermissions(
	session: AuthSession,
	clubId: string
): AuthClubPermissions | null {
	const systemRole = session.user.systemRole;
	if (systemRole === 'sys_admin') {
		return {
			clubId,
			systemRole,
			isSystemRole: true,
			permissions: buildPermissionMap(ALL_PERMISSION_KEYS)
		};
	}

	const membership = session.memberships.find(
		(candidate) => candidate.clubId === clubId && candidate.isActive
	);
	if (!membership) return null;

	return {
		clubId,
		systemRole,
		clubRole: membership.clubRole,
		isSystemRole: false,
		permissions: evaluatePermissionsForClubRole(membership.clubRole)
	};
}

function evaluatePermissionsForClubRole(
	clubRole: string
): Record<AuthClubPermissionKey, boolean> {
	if (clubRole === 'owner') {
		return buildPermissionMap(ALL_PERMISSION_KEYS);
	}

	if (clubRole === 'assistant') {
		return buildPermissionMap([
			'club:read',
			'students:read',
			'students:write',
			'attendance:read',
			'attendance:write',
			'belt_ranks:read',
			'belt_ranks:write',
			'club_groups:read',
			'club_groups:write',
			'imports:manage',
			'media:manage'
		]);
	}

	return buildPermissionMap([]);
}

function buildPermissionMap(
	enabledPermissions: AuthClubPermissionKey[]
): Record<AuthClubPermissionKey, boolean> {
	const enabled = new Set<AuthClubPermissionKey>(enabledPermissions);
	return Object.fromEntries(
		ALL_PERMISSION_KEYS.map((permission) => [permission, enabled.has(permission)])
	) as Record<AuthClubPermissionKey, boolean>;
}

async function resetLocalStateForAuthenticatedUser(): Promise<void> {
	if (typeof window === 'undefined') return;

	await clearAppData();
	window.localStorage.removeItem(LAST_SYNC_AT_KEY);
}
