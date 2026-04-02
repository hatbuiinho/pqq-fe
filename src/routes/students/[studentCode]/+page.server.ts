import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getApiBaseUrl } from '$lib/app/sync/sync-config';

type StudentPublicProfile = {
	id: string;
	studentCode?: string;
	fullName: string;
	dateOfBirth?: string;
	gender?: string;
	phone?: string;
	email?: string;
	address?: string;
	status: string;
	joinedAt?: string;
	notes?: string;
	clubId: string;
	clubName: string;
	groupId?: string;
	groupName?: string;
	beltRankId: string;
	beltRankName: string;
};

type StudentAvatar = {
	id: string;
	isPrimary: boolean;
	downloadUrl?: string;
	thumbnailUrl?: string;
};

const statusLabelMap: Record<string, string> = {
	active: 'Đang học',
	inactive: 'Ngưng học',
	suspended: 'Tạm dừng'
};

export const load: PageServerLoad = async ({ params, fetch, url }) => {
	const studentCode = decodeURIComponent(params.studentCode ?? '').trim();
	if (!studentCode) {
		throw error(404, 'Không tìm thấy võ sinh.');
	}

	const apiBaseUrl = getApiBaseUrl();
	const profileResponse = await fetch(
		`${apiBaseUrl}/api/v1/students/public-profile/${encodeURIComponent(studentCode)}`
	);

	if (profileResponse.status === 404) {
		throw error(404, 'Không tìm thấy võ sinh.');
	}
	if (!profileResponse.ok) {
		throw error(500, 'Không thể tải hồ sơ võ sinh.');
	}

	const profile = (await profileResponse.json()) as StudentPublicProfile;

	let avatarUrl = '';
	let avatarThumbUrl = '';
	const avatarResponse = await fetch(`${apiBaseUrl}/api/v1/students/${profile.id}/avatars`);
	if (avatarResponse.ok) {
		const avatarPayload = (await avatarResponse.json()) as { items?: StudentAvatar[] };
		const items = avatarPayload.items ?? [];
		const primaryAvatar = items.find((item) => item.isPrimary) ?? items[0];
		if (primaryAvatar) {
			avatarThumbUrl = primaryAvatar.thumbnailUrl ?? '';
			avatarUrl = primaryAvatar.downloadUrl ?? '';
		}
	}

	const statusLabel = statusLabelMap[profile.status] ?? profile.status;
	const pageTitle = `${profile.fullName} | Hồ sơ võ sinh`;
	const pageDescription = `${profile.fullName}${
		profile.studentCode ? ` (${profile.studentCode})` : ''
	} - ${profile.clubName} - ${profile.beltRankName} - ${statusLabel}.`;
	const canonicalUrl = `${url.origin}/students/${encodeURIComponent(studentCode)}`;
	const ogImage = avatarThumbUrl || avatarUrl;

	return {
		profile,
		avatarUrl,
		avatarThumbUrl,
		seo: {
			title: pageTitle,
			description: pageDescription,
			canonicalUrl,
			ogImage
		}
	};
};
