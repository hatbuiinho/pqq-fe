import { getApiBaseUrl } from '$lib/app/sync/sync-config';
import type { AvatarImportBatch, AvatarImportBatchItem, StudentAvatar } from '$lib/domain/models';

type ListStudentAvatarsResponse = {
	items: StudentAvatar[];
};

type UploadStudentAvatarResponse = {
	avatar: StudentAvatar;
};

type SetPrimaryStudentAvatarResponse = {
	avatar: StudentAvatar;
};

type AnalyzeAvatarImportResponse = {
	batch: AvatarImportBatch;
	items: AvatarImportBatchItem[];
};

type ConfirmAvatarImportResponse = {
	batch: AvatarImportBatch;
	importedCount: number;
	items: AvatarImportBatchItem[];
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

export const studentMediaApi = {
	async listAvatars(studentId: string): Promise<StudentAvatar[]> {
		const response = await fetch(buildUrl(`/api/v1/students/${studentId}/avatars`));
		const payload = await parseJson<ListStudentAvatarsResponse>(response);
		return payload.items ?? [];
	},

	async uploadAvatar(studentId: string, file: File): Promise<StudentAvatar> {
		const formData = new FormData();
		formData.append('file', file);

		const response = await fetch(buildUrl(`/api/v1/students/${studentId}/avatars`), {
			method: 'POST',
			body: formData
		});

		const payload = await parseJson<UploadStudentAvatarResponse>(response);
		return payload.avatar;
	},

	async setPrimaryAvatar(studentId: string, mediaId: string): Promise<StudentAvatar> {
		const response = await fetch(buildUrl(`/api/v1/students/${studentId}/avatars/${mediaId}/primary`), {
			method: 'POST'
		});

		const payload = await parseJson<SetPrimaryStudentAvatarResponse>(response);
		return payload.avatar;
	},

	async deleteAvatar(studentId: string, mediaId: string): Promise<void> {
		const response = await fetch(buildUrl(`/api/v1/students/${studentId}/avatars/${mediaId}/delete`), {
			method: 'POST'
		});

		await parseJson<{ success: boolean }>(response);
	},

	async getPrimaryAvatar(studentId: string): Promise<StudentAvatar | null> {
		const items = await this.listAvatars(studentId);
		return items.find((item) => item.isPrimary) ?? items[0] ?? null;
	},

	async analyzeAvatarImport(files: File[]): Promise<AnalyzeAvatarImportResponse> {
		const formData = new FormData();
		for (const file of files) {
			formData.append('files', file);
		}

		const response = await fetch(buildUrl('/api/v1/media/avatar-imports/analyze'), {
			method: 'POST',
			body: formData
		});

		return parseJson<AnalyzeAvatarImportResponse>(response);
	},

	async getAvatarImportBatch(batchId: string): Promise<AnalyzeAvatarImportResponse> {
		const response = await fetch(buildUrl(`/api/v1/media/avatar-imports/${batchId}`));
		return parseJson<AnalyzeAvatarImportResponse>(response);
	},

	async confirmAvatarImport(
		batchId: string,
		items: Array<{ itemId: string; studentId: string }>,
		replaceStrategy: 'replace' | 'keep'
	): Promise<ConfirmAvatarImportResponse> {
		const response = await fetch(buildUrl(`/api/v1/media/avatar-imports/${batchId}/confirm`), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ items, replaceStrategy })
		});

		return parseJson<ConfirmAvatarImportResponse>(response);
	}
};
