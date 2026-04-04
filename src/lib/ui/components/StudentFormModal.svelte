<script lang="ts">
	import type {
		BeltRank,
		Club,
		ClubGroup,
		Gender,
		StudentAvatar,
		StudentStatus,
		Weekday
	} from '$lib/domain/models';
	import type { StudentAvatarDraft } from '$lib/app/student-avatar-offline';
	import {
		enqueueStudentAvatarDraft,
		getStudentAvatarPreviewUrl,
		listStudentAvatarDrafts,
		removeStudentAvatarDraft,
		retryStudentAvatarDraft,
		syncStudentAvatarCache
	} from '$lib/app/student-avatar-offline';
	import { studentMediaApi } from '$lib/app/student-media-api';
	import { emitDataChanged, subscribeDataChanged } from '$lib/app/data-events';
	import { toastError, toastSuccess } from '$lib/app/toast';
	import { formatWeekdayList, sortWeekdays, WEEKDAY_OPTIONS } from '$lib/domain/schedule-utils';
	import AppDatePicker from '$lib/ui/components/AppDatePicker.svelte';
	import ImagePreviewModal from '$lib/ui/components/ImagePreviewModal.svelte';
	import AppModal from '$lib/ui/components/AppModal.svelte';
	import type { StudentFormErrors, StudentFormValue } from '$lib/ui/components/student-form';
	import { onMount } from 'svelte';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		studentId?: string | null;
		form: StudentFormValue;
		errors?: StudentFormErrors;
		selectedCustomScheduleDays?: Weekday[];
		availableClubs?: Club[];
		availableGroups?: ClubGroup[];
		availableBeltRanks?: BeltRank[];
		availableClubTrainingDays?: Weekday[];
		onClose?: () => void;
		onSubmit?: () => void;
		submitLabel?: string;
		cancelLabel?: string;
		isSubmitting?: boolean;
		showScheduleSection?: boolean;
		showClubSelector?: boolean;
		clubReadonlyName?: string;
		showStatusField?: boolean;
		studentCodeDisplay?: string;
		showStudentCode?: boolean;
		statusOptions?: Array<{ label: string; value: StudentStatus }>;
		canManageAvatars?: boolean;
	};

	const genderOptions: Array<{ label: string; value: Gender }> = [
		{ label: 'Nam', value: 'male' },
		{ label: 'Nữ', value: 'female' }
	];

	const defaultStatusOptions: Array<{ label: string; value: StudentStatus }> = [
		{ label: 'Đang học', value: 'active' },
		{ label: 'Ngưng học', value: 'inactive' },
		{ label: 'Tạm dừng', value: 'suspended' }
	];

	let {
		open,
		title,
		description = '',
		studentId = null,
		form = $bindable(),
		errors = {},
		selectedCustomScheduleDays = $bindable([]),
		availableClubs = [],
		availableGroups = [],
		availableBeltRanks = [],
		availableClubTrainingDays = [],
		onClose,
		onSubmit,
		submitLabel = 'Lưu võ sinh',
		cancelLabel = 'Hủy',
		isSubmitting = false,
		showScheduleSection = true,
		showClubSelector = true,
		clubReadonlyName = '',
		showStatusField = true,
		studentCodeDisplay = 'Sẽ tạo khi đồng bộ',
		showStudentCode = true,
		statusOptions = defaultStatusOptions,
		canManageAvatars = true
	}: Props = $props();

	let avatarInput = $state<HTMLInputElement | null>(null);
	let avatarCameraInput = $state<HTMLInputElement | null>(null);
	let avatarUploadTrigger = $state<HTMLDivElement | null>(null);
	let avatars = $state<StudentAvatar[]>([]);
	let avatarDrafts = $state<StudentAvatarDraft[]>([]);
	let offlineAvatarPreviewUrl = $state('');
	let isLoadingAvatars = $state(false);
	let isUploadingAvatar = $state(false);
	let avatarError = $state('');
	let isMobileMode = $state(false);
	let isAvatarSourcePopoverOpen = $state(false);
	let avatarSourcePopoverStyle = $state('');
	let isAvatarPreviewModalOpen = $state(false);
	let avatarPreviewUrl = $state('');
	let avatarPreviewTitle = $state('');
	let suppressAvatarReloadUntil = $state(0);

	function toggleCustomScheduleDay(weekday: Weekday) {
		const allowedDays = new Set(availableClubTrainingDays);
		if (!allowedDays.has(weekday)) return;

		if (selectedCustomScheduleDays.includes(weekday)) {
			selectedCustomScheduleDays = selectedCustomScheduleDays.filter((value) => value !== weekday);
			return;
		}

		selectedCustomScheduleDays = sortWeekdays([...selectedCustomScheduleDays, weekday]);
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onSubmit?.();
	}

	function formatFileSize(value: number) {
		if (value < 1024) return `${value} B`;
		if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
		return `${(value / (1024 * 1024)).toFixed(1)} MB`;
	}

	function triggerAvatarPicker() {
		avatarInput?.click();
	}

	function triggerAvatarCameraPicker() {
		avatarCameraInput?.click();
	}

	function closeAvatarSourcePopover() {
		isAvatarSourcePopoverOpen = false;
		avatarSourcePopoverStyle = '';
	}

	function updateAvatarSourcePopoverPosition() {
		if (!avatarUploadTrigger) return;

		const rect = avatarUploadTrigger.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const minPadding = 8;
		const preferredWidth = 192;
		const popoverWidth = Math.min(preferredWidth, Math.max(160, viewportWidth - minPadding * 2));
		const estimatedHeight = 96;

		let left = rect.right - popoverWidth;
		left = Math.max(minPadding, Math.min(left, viewportWidth - popoverWidth - minPadding));

		let top = rect.bottom + 8;
		if (top + estimatedHeight > viewportHeight - minPadding) {
			top = Math.max(minPadding, rect.top - estimatedHeight - 8);
		}

		avatarSourcePopoverStyle = `top:${top}px;left:${left}px;width:${popoverWidth}px;`;
	}

	function handleUploadAvatarClick() {
		if (!isMobileMode) {
			triggerAvatarPicker();
			return;
		}
		const nextOpen = !isAvatarSourcePopoverOpen;
		isAvatarSourcePopoverOpen = nextOpen;
		if (nextOpen) {
			updateAvatarSourcePopoverPosition();
		}
	}

	function handlePickAvatarFromCamera() {
		closeAvatarSourcePopover();
		triggerAvatarCameraPicker();
	}

	function handlePickAvatarFromLibrary() {
		closeAvatarSourcePopover();
		triggerAvatarPicker();
	}

	async function loadAvatars(targetStudentId: string) {
		try {
			isLoadingAvatars = true;
			avatarError = '';
			offlineAvatarPreviewUrl = '';
			await refreshAvatarDrafts(targetStudentId);
			if (!navigator.onLine) {
				avatars = [];
				offlineAvatarPreviewUrl = await getStudentAvatarPreviewUrl(targetStudentId);
				return;
			}
			await refreshAvatarsIncremental(targetStudentId);
			await syncStudentAvatarCache(targetStudentId, { emitEvent: false });
		} catch (error) {
			avatarError = error instanceof Error ? error.message : 'Không thể tải danh sách avatar.';
		} finally {
			isLoadingAvatars = false;
		}
	}

	function suppressAvatarReloadWindow(durationMs = 2000) {
		suppressAvatarReloadUntil = Date.now() + durationMs;
	}

	function isSameAvatar(left: StudentAvatar, right: StudentAvatar): boolean {
		return (
			left.id === right.id &&
			left.isPrimary === right.isPrimary &&
			left.fileSize === right.fileSize &&
			left.originalFilename === right.originalFilename &&
			left.downloadUrl === right.downloadUrl &&
			left.thumbnailUrl === right.thumbnailUrl
		);
	}

	async function refreshAvatarDrafts(targetStudentId: string) {
		avatarDrafts = await listStudentAvatarDrafts(targetStudentId);
	}

	async function refreshAvatarsIncremental(targetStudentId: string) {
		const nextAvatars = await studentMediaApi.listAvatars(targetStudentId);
		const existingById = new Map(avatars.map((avatar) => [avatar.id, avatar]));
		const merged = nextAvatars.map((avatar) => {
			const existing = existingById.get(avatar.id);
			if (existing && isSameAvatar(existing, avatar)) {
				return existing;
			}
			return avatar;
		});

		if (avatars.length === merged.length && avatars.every((avatar, index) => avatar === merged[index])) {
			return;
		}

		avatars = merged;
	}

	function upsertAvatarLocally(nextAvatar: StudentAvatar) {
		const existingIndex = avatars.findIndex((avatar) => avatar.id === nextAvatar.id);
		let nextItems =
			existingIndex === -1
				? [nextAvatar, ...avatars]
				: avatars.map((avatar, index) => (index === existingIndex ? nextAvatar : avatar));

		if (nextAvatar.isPrimary) {
			nextItems = nextItems.map((avatar) => ({ ...avatar, isPrimary: avatar.id === nextAvatar.id }));
		}

		avatars = nextItems;
	}

	function markPrimaryLocally(mediaId: string) {
		avatars = avatars.map((avatar) => ({ ...avatar, isPrimary: avatar.id === mediaId }));
	}

	function removeAvatarLocally(mediaId: string) {
		avatars = avatars.filter((avatar) => avatar.id !== mediaId);
	}

	async function handleAvatarInputChange(event: Event) {
		if (!studentId) return;

		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			isUploadingAvatar = true;
			avatarError = '';
			if (navigator.onLine) {
				const uploadedAvatar = await studentMediaApi.uploadAvatar(studentId, file);
				upsertAvatarLocally(uploadedAvatar);
				suppressAvatarReloadWindow();
				await syncStudentAvatarCache(studentId);
				emitDataChanged('avatar-sync');
				toastSuccess('Đã tải lên avatar.');
			} else {
				await enqueueStudentAvatarDraft(studentId, file);
				await refreshAvatarDrafts(studentId);
				toastSuccess('Avatar đã lưu cục bộ và sẽ tự tải lên khi có mạng.');
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Không thể tải lên avatar.';
			avatarError = message;
			toastError(message);
		} finally {
			isUploadingAvatar = false;
			input.value = '';
		}
	}

	async function handleSetPrimaryAvatar(mediaId: string) {
		if (!studentId) return;

		try {
			avatarError = '';
			const updatedAvatar = await studentMediaApi.setPrimaryAvatar(studentId, mediaId);
			upsertAvatarLocally(updatedAvatar);
			markPrimaryLocally(updatedAvatar.id);
			suppressAvatarReloadWindow();
			await syncStudentAvatarCache(studentId);
			emitDataChanged('avatar-sync');
			toastSuccess('Đã cập nhật avatar chính.');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Không thể cập nhật avatar chính.';
			avatarError = message;
			toastError(message);
		}
	}

	async function handleDeleteAvatar(mediaId: string) {
		if (!studentId) return;

		try {
			avatarError = '';
			await studentMediaApi.deleteAvatar(studentId, mediaId);
			removeAvatarLocally(mediaId);
			suppressAvatarReloadWindow();
			await syncStudentAvatarCache(studentId);
			emitDataChanged('avatar-sync');
			toastSuccess('Đã xóa avatar.');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Không thể xóa avatar.';
			avatarError = message;
			toastError(message);
		}
	}

	async function handleRetryDraft(queueId: string) {
		await retryStudentAvatarDraft(queueId);
		if (studentId) {
			await refreshAvatarDrafts(studentId);
		}
		toastSuccess('Đã đưa avatar vào hàng đợi tải lên lại.');
	}

	async function handleRemoveDraft(queueId: string) {
		await removeStudentAvatarDraft(queueId);
		if (studentId) {
			await refreshAvatarDrafts(studentId);
		}
	}

	function openAvatarPreview(url: string, title: string) {
		if (!url) return;
		avatarPreviewUrl = url;
		avatarPreviewTitle = title;
		isAvatarPreviewModalOpen = true;
	}

	function closeAvatarPreview() {
		isAvatarPreviewModalOpen = false;
		avatarPreviewUrl = '';
		avatarPreviewTitle = '';
	}

	onMount(() =>
	{
		const mediaQuery = window.matchMedia('(max-width: 767px)');
		const applyMobileMode = () => {
			isMobileMode = mediaQuery.matches;
			if (!isMobileMode) {
				closeAvatarSourcePopover();
			}
		};
		applyMobileMode();

		const handleOutsidePointerDown = (event: PointerEvent) => {
			if (!isAvatarSourcePopoverOpen || !avatarUploadTrigger) return;
			if (avatarUploadTrigger.contains(event.target as Node)) return;
			closeAvatarSourcePopover();
		};
		const handleViewportChange = () => {
			if (!isAvatarSourcePopoverOpen) return;
			updateAvatarSourcePopoverPosition();
		};

		const handleDataChangedUnsubscribe = subscribeDataChanged((source) => {
			if ((source !== 'avatar' && source !== 'avatar-sync') || !open || !studentId) return;
			if (Date.now() < suppressAvatarReloadUntil) {
				void refreshAvatarDrafts(studentId);
				return;
			}
			if (source === 'avatar') {
				void refreshAvatarDrafts(studentId);
				return;
			}
			void refreshAvatarsIncremental(studentId);
		});

		mediaQuery.addEventListener('change', applyMobileMode);
		document.addEventListener('pointerdown', handleOutsidePointerDown);
		window.addEventListener('resize', handleViewportChange);
		window.addEventListener('scroll', handleViewportChange, true);

		return () => {
			handleDataChangedUnsubscribe();
			mediaQuery.removeEventListener('change', applyMobileMode);
			document.removeEventListener('pointerdown', handleOutsidePointerDown);
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('scroll', handleViewportChange, true);
		};
	});

	$effect(() => {
		if (open && studentId) {
			void loadAvatars(studentId);
			return;
		}

		avatars = [];
		avatarDrafts = [];
		offlineAvatarPreviewUrl = '';
		avatarError = '';
		closeAvatarSourcePopover();
		closeAvatarPreview();
	});
</script>

<AppModal {open} {title} {description} {onClose}>
	<form
		class="grid w-full max-w-full min-w-0 overflow-x-hidden gap-4 md:grid-cols-2"
		onsubmit={handleSubmit}
	>
		{#if studentId}
			<div class="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
				<div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="min-w-0 space-y-1">
						<h3 class="text-sm font-semibold text-slate-800">Ảnh đại diện</h3>
						<p class="text-xs text-slate-500">Hỗ trợ JPG, PNG hoặc WebP, tối đa 5MB.</p>
					</div>
					<div class="relative shrink-0 self-start sm:self-auto" bind:this={avatarUploadTrigger}>
						{#if canManageAvatars}
							<button
								class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
								type="button"
								onclick={handleUploadAvatarClick}
								disabled={isUploadingAvatar}
							>
								{isUploadingAvatar ? 'Đang tải lên...' : 'Tải lên avatar'}
							</button>
						{/if}

						{#if canManageAvatars && isMobileMode && isAvatarSourcePopoverOpen}
							<div
								class="fixed z-70 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
								style={avatarSourcePopoverStyle}
							>
								<button
									type="button"
									class="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
									onclick={handlePickAvatarFromCamera}
								>
									Chụp ảnh
								</button>
								<button
									type="button"
									class="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
									onclick={handlePickAvatarFromLibrary}
								>
									Chọn từ thư viện
								</button>
							</div>
						{/if}
					</div>
					<input
						bind:this={avatarInput}
						class="hidden"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						onchange={handleAvatarInputChange}
					/>
					<input
						bind:this={avatarCameraInput}
						class="hidden"
						type="file"
						accept="image/jpeg,image/png,image/webp"
						capture="environment"
						onchange={handleAvatarInputChange}
					/>
				</div>

				{#if avatarError}
					<p class="text-xs text-red-600">{avatarError}</p>
				{/if}

				{#if isLoadingAvatars}
					<p class="text-sm text-slate-500">Đang tải avatar...</p>
				{:else if avatarDrafts.length === 0 && avatars.length === 0 && !offlineAvatarPreviewUrl}
					<p class="text-sm text-slate-500">Chưa có avatar nào được tải lên.</p>
				{:else}
					<div class="space-y-4">
						{#if avatarDrafts.length > 0}
							<div class="space-y-2">
								<div class="flex items-center justify-between gap-3">
									<h4 class="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
										Hàng đợi cục bộ
									</h4>
									<span class="text-xs text-slate-500">
										{navigator.onLine ? 'Ảnh sẽ sớm được đồng bộ' : 'Đang chờ kết nối mạng'}
									</span>
								</div>
								<div class="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
									{#each avatarDrafts as draft (draft.id)}
										<div class="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
											<div class="aspect-square overflow-hidden rounded-xl bg-slate-100">
												<button
													type="button"
													class="h-full w-full cursor-zoom-in"
													onclick={() => openAvatarPreview(draft.previewUrl, draft.fileName)}
												>
													<img
														class="h-full w-full object-cover"
														src={draft.previewUrl}
														alt={draft.fileName}
													/>
												</button>
											</div>
											<div class="space-y-1">
												<div class="min-w-0 flex items-center justify-between gap-2">
													<span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-800"
														>{draft.fileName}</span
													>
													<span
														class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
															draft.status === 'failed'
																? 'bg-red-100 text-red-700'
																: draft.status === 'uploading'
																	? 'bg-sky-100 text-sky-700'
																	: 'bg-amber-100 text-amber-700'
														}`}
													>
														{draft.status}
													</span>
												</div>
												<p class="text-xs text-slate-500">{formatFileSize(draft.fileSize)}</p>
												{#if draft.error}
													<p class="text-xs text-red-600">{draft.error}</p>
												{/if}
											</div>
											<div class="flex flex-wrap gap-2">
												{#if draft.status === 'failed'}
													<button
														class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
														type="button"
														onclick={() => void handleRetryDraft(draft.id)}
													>
														Thử lại
													</button>
												{/if}
												<button
													class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600"
													type="button"
													onclick={() => void handleRemoveDraft(draft.id)}
												>
													Xóa
												</button>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						{#if !navigator.onLine && offlineAvatarPreviewUrl && avatars.length === 0}
							<div class="space-y-2">
								<h4 class="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
									Avatar cục bộ
								</h4>
								<div class="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
									<div class="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
										<div class="aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
											<button
												type="button"
												class="h-full w-full cursor-zoom-in"
												onclick={() =>
													openAvatarPreview(offlineAvatarPreviewUrl, 'Avatar cục bộ')
												}
											>
												<img
													class="h-full w-full object-cover"
													src={offlineAvatarPreviewUrl}
													alt="Avatar cục bộ"
												/>
											</button>
										</div>
										<p class="text-xs text-slate-500">
											Đang ngoại tuyến: hiển thị từ cache cục bộ.
										</p>
									</div>
								</div>
							</div>
						{/if}

						{#if avatars.length > 0}
							<div class="space-y-2">
								<h4 class="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
									Avatar đã tải lên
								</h4>
								<div class="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
									{#each avatars as avatar (avatar.id)}
										<div class="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
											<div class="aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
												{#if avatar.thumbnailUrl ?? avatar.downloadUrl}
													<button
														type="button"
														class="h-full w-full cursor-zoom-in"
														onclick={() =>
															openAvatarPreview(
																avatar.downloadUrl ?? avatar.thumbnailUrl ?? '',
																avatar.originalFilename
															)}
													>
														<img
															class="h-full w-full object-cover"
															src={avatar.thumbnailUrl ?? avatar.downloadUrl}
															alt={avatar.originalFilename}
														/>
													</button>
												{/if}
											</div>
											<div class="space-y-1">
												<div class="min-w-0 flex items-center justify-between gap-2">
													<span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-800"
														>{avatar.originalFilename}</span
													>
													{#if avatar.isPrimary}
														<span
															class="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
															>Chính</span
														>
													{/if}
												</div>
												<p class="text-xs text-slate-500">{formatFileSize(avatar.fileSize)}</p>
											</div>
											<div class="flex flex-wrap gap-2">
												<button
													class="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-60"
													type="button"
													onclick={() => handleSetPrimaryAvatar(avatar.id)}
													disabled={avatar.isPrimary || !canManageAvatars}
												>
													Đặt làm chính
												</button>
												{#if canManageAvatars}
													<button
														class="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600"
														type="button"
														onclick={() => handleDeleteAvatar(avatar.id)}
													>
														Xóa
													</button>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Họ và tên *</span>
			<input
				class:border-red-300={!!errors.fullName}
				class="w-full rounded-lg border-slate-300"
				bind:value={form.fullName}
				required
			/>
			{#if errors.fullName}
				<span class="block text-xs text-red-600">{errors.fullName}</span>
			{/if}
		</label>

		{#if showStudentCode}
			<label class="min-w-0 space-y-1">
				<span class="text-sm font-medium text-slate-700">Mã võ sinh</span>
				<input
					class="w-full rounded-lg border-slate-300 bg-slate-100 text-slate-500"
					value={studentCodeDisplay}
					readonly
					disabled
				/>
				<span class="block text-xs text-slate-500"
					>Hệ thống sẽ tạo mã tự động theo định dạng `PQQ-000001` khi đồng bộ.</span
				>
			</label>
		{/if}

		{#if showClubSelector}
			<label class="min-w-0 space-y-1">
				<span class="text-sm font-medium text-slate-700">CLB *</span>
				<select
					class:border-red-300={!!errors.clubId}
					class="w-full rounded-lg border-slate-300"
					bind:value={form.clubId}
					required
				>
					<option value="">Chọn CLB</option>
					{#each availableClubs as club (club.id)}
						<option value={club.id}>{club.name}</option>
					{/each}
				</select>
				{#if errors.clubId}
					<span class="block text-xs text-red-600">{errors.clubId}</span>
				{/if}
			</label>
		{:else if clubReadonlyName}
			<label class="min-w-0 space-y-1">
				<span class="text-sm font-medium text-slate-700">CLB</span>
				<input
					class="w-full rounded-lg border-slate-300 bg-slate-100 text-slate-500"
					value={clubReadonlyName}
					readonly
					disabled
				/>
			</label>
		{/if}

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Nhóm</span>
			<select
				class:border-red-300={!!errors.groupId}
				class="w-full rounded-lg border-slate-300"
				bind:value={form.groupId}
			>
				<option value="">Không có nhóm</option>
				{#each availableGroups as group (group.id)}
					<option value={group.id}>{group.name}</option>
				{/each}
			</select>
			{#if errors.groupId}
				<span class="block text-xs text-red-600">{errors.groupId}</span>
			{/if}
		</label>

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Cấp đai *</span>
			<select
				class:border-red-300={!!errors.beltRankId}
				class="w-full rounded-lg border-slate-300"
				bind:value={form.beltRankId}
				required
			>
				<option value="">Chọn cấp đai</option>
				{#each availableBeltRanks as beltRank (beltRank.id)}
					<option value={beltRank.id}>{beltRank.name}</option>
				{/each}
			</select>
			{#if errors.beltRankId}
				<span class="block text-xs text-red-600">{errors.beltRankId}</span>
			{/if}
		</label>

		{#if showClubSelector}
			<p class="text-xs text-slate-500 md:col-span-2">
				Chỉ CLB và cấp đai đang hoạt động, đã đồng bộ mới có thể gán cho võ sinh.
			</p>
		{/if}

		{#if showScheduleSection}
			<div class="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
				<div class="space-y-1">
					<span class="text-sm font-medium text-slate-700">Lịch học</span>
					<p class="text-xs text-slate-500">
						Võ sinh có thể kế thừa lịch CLB hoặc dùng lịch tùy chỉnh theo các ngày tập của CLB.
					</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<label
						class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
					>
						<input
							type="radio"
							name="scheduleMode"
							bind:group={form.scheduleMode}
							value="inherit"
						/>
						<span>Dùng lịch CLB</span>
					</label>
					<label
						class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
					>
						<input type="radio" name="scheduleMode" bind:group={form.scheduleMode} value="custom" />
						<span>Lịch tùy chỉnh</span>
					</label>
				</div>
				<p class="text-xs text-slate-500">
					Ngày tập của CLB: {formatWeekdayList(availableClubTrainingDays) ||
						'CLB này chưa cấu hình ngày tập.'}
				</p>
				{#if form.scheduleMode === 'custom'}
					<div class="space-y-2">
						<div class="flex min-w-0 flex-wrap gap-2">
							{#each WEEKDAY_OPTIONS as option (option.value)}
								<button
									type="button"
									class={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
										selectedCustomScheduleDays.includes(option.value)
											? 'border-slate-900 bg-slate-900 text-white'
											: availableClubTrainingDays.includes(option.value)
												? 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
												: 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
									}`}
									onclick={() => toggleCustomScheduleDay(option.value)}
									disabled={!availableClubTrainingDays.includes(option.value)}
								>
									{option.shortLabel}
								</button>
							{/each}
						</div>
						{#if errors.scheduleDays}
							<span class="block text-xs text-red-600">{errors.scheduleDays}</span>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Ngày sinh</span>
			<AppDatePicker
				bind:value={form.dateOfBirth}
				placeholder="Chọn ngày sinh"
				showYearPresets={true}
			/>
			{#if errors.dateOfBirth}
				<span class="block text-xs text-red-600">{errors.dateOfBirth}</span>
			{/if}
		</label>

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Ngày tham gia</span>
			<AppDatePicker bind:value={form.joinedAt} placeholder="Chọn ngày tham gia" />
			{#if errors.joinedAt}
				<span class="block text-xs text-red-600">{errors.joinedAt}</span>
			{/if}
		</label>

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Giới tính</span>
			<div class="flex flex-wrap gap-2 rounded-lg border border-slate-300 bg-white p-2">
				{#each genderOptions as option (option.value)}
					<label
						class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
					>
						<input type="radio" name="gender" bind:group={form.gender} value={option.value} />
						<span>{option.label}</span>
					</label>
				{/each}
			</div>
		</label>

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Email</span>
			<input
				class:border-red-300={!!errors.email}
				class="w-full rounded-lg border-slate-300"
				type="email"
				bind:value={form.email}
			/>
			{#if errors.email}
				<span class="block text-xs text-red-600">{errors.email}</span>
			{/if}
		</label>

		{#if showStatusField}
			<label class="min-w-0 space-y-1">
				<span class="text-sm font-medium text-slate-700">Trạng thái</span>
				<select class="w-full rounded-lg border-slate-300" bind:value={form.status}>
					{#each statusOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
		{/if}

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Số điện thoại</span>
			<input
				class:border-red-300={!!errors.phone}
				class="w-full rounded-lg border-slate-300"
				bind:value={form.phone}
			/>
			{#if errors.phone}
				<span class="block text-xs text-red-600">{errors.phone}</span>
			{/if}
		</label>

		<label class="min-w-0 space-y-1 md:col-span-2">
			<span class="text-sm font-medium text-slate-700">Địa chỉ</span>
			<input class="w-full rounded-lg border-slate-300" bind:value={form.address} />
		</label>

		<label class="min-w-0 space-y-1 md:col-span-2">
			<span class="text-sm font-medium text-slate-700">Ghi chú</span>
			<textarea class="w-full rounded-lg border-slate-300" rows="3" bind:value={form.notes}
			></textarea>
		</label>

		<div class="min-w-0 flex flex-wrap gap-3 md:col-span-2">
			<button
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
				type="submit"
				disabled={isSubmitting}
			>
				{isSubmitting ? 'Đang lưu...' : submitLabel}
			</button>
			<button
				class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
				type="button"
				onclick={onClose}
			>
				{cancelLabel}
			</button>
		</div>
	</form>
</AppModal>

	<ImagePreviewModal
		open={isAvatarPreviewModalOpen}
		src={avatarPreviewUrl}
		title={avatarPreviewTitle || 'Xem trước avatar'}
		onClose={closeAvatarPreview}
	/>
