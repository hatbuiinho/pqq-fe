import { browser } from '$app/environment';
import { emitDataChanged, subscribeDataChanged } from '$lib/app/data-events';
import { getDB } from '$lib/data/local/app-db';
import type {
	StudentAvatar,
	StudentAvatarCache,
	StudentAvatarQueueItem,
	StudentAvatarQueueStatus
} from '$lib/domain/models';
import { studentMediaApi } from '$lib/app/student-media-api';
import { toastError } from '$lib/app/toast';

const AVATAR_SYNC_DELAY_MS = 250;

export type StudentAvatarDraft = StudentAvatarQueueItem & {
	previewUrl: string;
};

const objectUrlCache = new Map<string, string>();

function nowIso(): string {
	return new Date().toISOString();
}

function createId(): string {
	if (browser && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}

	return `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getObjectUrl(cacheKey: string, blob: Blob): string {
	const existing = objectUrlCache.get(cacheKey);
	if (existing) return existing;

	const next = URL.createObjectURL(blob);
	objectUrlCache.set(cacheKey, next);
	return next;
}

function revokeObjectUrl(cacheKey: string): void {
	const existing = objectUrlCache.get(cacheKey);
	if (!existing) return;

	URL.revokeObjectURL(existing);
	objectUrlCache.delete(cacheKey);
}

function getQueuePreviewKey(item: Pick<StudentAvatarQueueItem, 'id' | 'updatedAt'>): string {
	return `queue:${item.id}:${item.updatedAt}`;
}

function getCachePreviewKey(item: Pick<StudentAvatarCache, 'studentId' | 'mediaId' | 'updatedAt'>): string {
	return `cache:${item.studentId}:${item.mediaId}:${item.updatedAt}`;
}

async function fetchBlob(url: string): Promise<Blob | null> {
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		return await response.blob();
	} catch {
		return null;
	}
}

async function getRemotePrimaryAvatar(studentId: string): Promise<StudentAvatar | null> {
	if (!browser || !navigator.onLine) return null;
	try {
		return await studentMediaApi.getPrimaryAvatar(studentId);
	} catch {
		return null;
	}
}

export async function listStudentAvatarDrafts(studentId: string): Promise<StudentAvatarDraft[]> {
	if (!browser) return [];

	const items = await getDB()
		.studentAvatarQueue.where('studentId')
		.equals(studentId)
		.reverse()
		.sortBy('updatedAt');

	return items
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
		.map((item) => ({
			...item,
			previewUrl: getObjectUrl(getQueuePreviewKey(item), item.blob)
		}));
}

export async function enqueueStudentAvatarDraft(studentId: string, file: File): Promise<void> {
	if (!browser) return;

	const timestamp = nowIso();
	const queueItem: StudentAvatarQueueItem = {
		id: createId(),
		studentId,
		fileName: file.name,
		mimeType: file.type || 'application/octet-stream',
		fileSize: file.size,
		blob: file,
		status: 'pending',
		createdAt: timestamp,
		updatedAt: timestamp
	};

	await getDB().studentAvatarQueue.put(queueItem);
	emitDataChanged('avatar');
}

export async function removeStudentAvatarDraft(queueId: string): Promise<void> {
	if (!browser) return;

	const existing = await getDB().studentAvatarQueue.get(queueId);
	if (existing) {
		revokeObjectUrl(getQueuePreviewKey(existing));
	}
	await getDB().studentAvatarQueue.delete(queueId);
	emitDataChanged('avatar');
}

export async function retryStudentAvatarDraft(queueId: string): Promise<void> {
	if (!browser) return;

	const existing = await getDB().studentAvatarQueue.get(queueId);
	if (!existing) return;

	await getDB().studentAvatarQueue.put({
		...existing,
		status: 'pending',
		error: undefined,
		updatedAt: nowIso()
	});
	emitDataChanged('avatar');
}

async function setQueueStatus(
	queueItem: StudentAvatarQueueItem,
	status: StudentAvatarQueueStatus,
	error?: string
): Promise<StudentAvatarQueueItem> {
	const next: StudentAvatarQueueItem = {
		...queueItem,
		status,
		error,
		updatedAt: nowIso()
	};
	await getDB().studentAvatarQueue.put(next);
	return next;
}

export async function syncStudentAvatarCache(
	studentId: string,
	options: { emitEvent?: boolean } = {}
): Promise<void> {
	if (!browser) return;
	const { emitEvent = true } = options;

	const remoteAvatar = await getRemotePrimaryAvatar(studentId);
	if (!remoteAvatar) {
		const existing = await getDB().studentAvatarCache.get(studentId);
		if (existing) {
			revokeObjectUrl(getCachePreviewKey(existing));
		}
		await getDB().studentAvatarCache.delete(studentId);
		if (emitEvent) {
			emitDataChanged('avatar-sync');
		}
		return;
	}

	const sourceUrl = remoteAvatar.thumbnailUrl ?? remoteAvatar.downloadUrl;
	if (!sourceUrl) return;

	const blob = await fetchBlob(sourceUrl);
	if (!blob) return;

	const cacheItem: StudentAvatarCache = {
		studentId,
		mediaId: remoteAvatar.id,
		blob,
		mimeType: blob.type || remoteAvatar.mimeType,
		updatedAt: nowIso()
	};

	const existing = await getDB().studentAvatarCache.get(studentId);
	if (existing && existing.mediaId !== cacheItem.mediaId) {
		revokeObjectUrl(getCachePreviewKey(existing));
	}

	await getDB().studentAvatarCache.put(cacheItem);
	if (emitEvent) {
		emitDataChanged('avatar-sync');
	}
}

export async function getStudentAvatarPreviewUrl(studentId: string): Promise<string> {
	if (!browser) return '';

	const queueItems = await getDB().studentAvatarQueue.where('studentId').equals(studentId).toArray();
	const activeDraft = queueItems
		.filter((item) => item.status === 'pending' || item.status === 'uploading' || item.status === 'failed')
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

	if (activeDraft) {
		return getObjectUrl(getQueuePreviewKey(activeDraft), activeDraft.blob);
	}

	const cachedAvatar = await getDB().studentAvatarCache.get(studentId);
	if (cachedAvatar) {
		return getObjectUrl(getCachePreviewKey(cachedAvatar), cachedAvatar.blob);
	}

	const remoteAvatar = await getRemotePrimaryAvatar(studentId);
	if (!remoteAvatar) return '';

	const sourceUrl = remoteAvatar.thumbnailUrl ?? remoteAvatar.downloadUrl;
	if (!sourceUrl) return '';

	const blob = await fetchBlob(sourceUrl);
	if (blob) {
		const cacheItem: StudentAvatarCache = {
			studentId,
			mediaId: remoteAvatar.id,
			blob,
			mimeType: blob.type || remoteAvatar.mimeType,
			updatedAt: nowIso()
		};
		await getDB().studentAvatarCache.put(cacheItem);
		return getObjectUrl(getCachePreviewKey(cacheItem), cacheItem.blob);
	}

	return sourceUrl;
}

export async function loadStudentAvatarPreviewMap(
	studentIds: string[]
): Promise<Record<string, string>> {
	const uniqueStudentIds = [...new Set(studentIds.filter(Boolean))];
	const pairs = await Promise.all(
		uniqueStudentIds.map(async (studentId) => [studentId, await getStudentAvatarPreviewUrl(studentId)] as const)
	);

	return Object.fromEntries(pairs);
}

class AvatarUploadManager {
	private isStarted = false;
	private isUploading = false;
	private queueTimer: number | null = null;
	private unsubscribeDataChanged: (() => void) | null = null;
	private lastReportedError: string | null = null;

	start(): void {
		if (!browser || this.isStarted) return;
		this.isStarted = true;

		this.unsubscribeDataChanged = subscribeDataChanged((source) => {
			if (source !== 'avatar') return;
			this.scheduleFlush();
		});

		window.addEventListener('online', this.handleOnline);
		void this.flush();
	}

	stop(): void {
		if (!browser || !this.isStarted) return;
		this.isStarted = false;

		if (this.queueTimer) {
			window.clearTimeout(this.queueTimer);
			this.queueTimer = null;
		}
		if (this.unsubscribeDataChanged) {
			this.unsubscribeDataChanged();
			this.unsubscribeDataChanged = null;
		}

		window.removeEventListener('online', this.handleOnline);
	}

	scheduleFlush(delay = AVATAR_SYNC_DELAY_MS): void {
		if (!browser) return;
		if (this.queueTimer) {
			window.clearTimeout(this.queueTimer);
		}
		this.queueTimer = window.setTimeout(() => {
			this.queueTimer = null;
			void this.flush();
		}, delay);
	}

	async flush(): Promise<void> {
		if (!browser || this.isUploading || !navigator.onLine) return;

		this.isUploading = true;
		try {
			while (true) {
				const nextItem = await getDB()
					.studentAvatarQueue.where('status')
					.anyOf('pending', 'failed')
					.first();
				if (!nextItem) break;

				await this.uploadQueueItem(nextItem);
			}
		} finally {
			this.isUploading = false;
		}
	}

	private readonly handleOnline = () => {
		this.scheduleFlush(0);
	};

	private async uploadQueueItem(queueItem: StudentAvatarQueueItem): Promise<void> {
		const uploadingItem = await setQueueStatus(queueItem, 'uploading');

		try {
			const file = new File([uploadingItem.blob], uploadingItem.fileName, {
				type: uploadingItem.mimeType,
				lastModified: Date.now()
			});
			await studentMediaApi.uploadAvatar(uploadingItem.studentId, file);
			await syncStudentAvatarCache(uploadingItem.studentId);
			revokeObjectUrl(getQueuePreviewKey(uploadingItem));
			await getDB().studentAvatarQueue.delete(uploadingItem.id);
			this.lastReportedError = null;
			emitDataChanged('avatar-sync');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to upload avatar.';
			await setQueueStatus(uploadingItem, 'failed', message);
			if (message !== this.lastReportedError) {
				this.lastReportedError = message;
				toastError(message);
			}
			emitDataChanged('avatar-sync');
		}
	}
}

export const avatarUploadManager = new AvatarUploadManager();
