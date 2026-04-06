<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AppModal,
		DataTableToolbar,
		EmptyState,
		PageHeader,
		SectionCard,
		authSession,
		userManagementApi
	} from '$lib';
	import { clubUseCases } from '$lib/app/services';
	import { toastError } from '$lib/app/toast';
	import { normalizeSearchText } from '$lib/domain/string-utils';
	import type { AuditLog, Club } from '$lib/domain/models';

	const entityTypeOptions = [
		{ value: '', label: 'Tất cả thực thể' },
		{ value: 'users', label: 'Tài khoản' },
		{ value: 'club_memberships', label: 'Phân quyền CLB' },
		{ value: 'club_invites', label: 'Link mời' },
		{ value: 'clubs', label: 'Câu lạc bộ' },
		{ value: 'belt_ranks', label: 'Cấp đai' },
		{ value: 'students', label: 'Võ sinh' },
		{ value: 'attendance_sessions', label: 'Buổi điểm danh' },
		{ value: 'attendance_records', label: 'Bản ghi điểm danh' },
		{ value: 'student_media', label: 'Ảnh / media' }
	] as const;

	type AuditDetail = {
		label: string;
		value: string;
	};

	let logs = $state<AuditLog[]>([]);
	let clubs = $state<Club[]>([]);
	let isLoading = $state(false);
	let search = $state('');
	let selectedEntityType = $state('');
	let selectedClubId = $state('');
	let selectedLog = $state<AuditLog | null>(null);

	const currentAuthSession = $derived($authSession);
	const isSystemAdmin = $derived(currentAuthSession?.user.systemRole === 'sys_admin');
	const activeClubMembership = $derived(
		currentAuthSession?.memberships.find(
			(membership) => membership.clubId === currentAuthSession?.activeClubId
		) ?? currentAuthSession?.memberships[0]
	);
	const canReadAuditLogs = $derived(isSystemAdmin || activeClubMembership?.clubRole === 'owner');
	const effectiveClubId = $derived(
		isSystemAdmin ? selectedClubId : (activeClubMembership?.clubId ?? '')
	);
	const clubNameById = $derived.by(() => {
		const entries = clubs.map((club) => [club.id, club.name] as const);
		if (activeClubMembership?.clubId && activeClubMembership.clubName) {
			entries.push([activeClubMembership.clubId, activeClubMembership.clubName]);
		}
		return Object.fromEntries(entries) as Record<string, string>;
	});

	const filteredLogs = $derived.by(() => {
		const query = normalizeSearchText(search);
		return logs.filter((log) => {
			const matchesQuery =
				!query ||
				[
					getEntityLabel(log.entityType),
					getActionLabel(log.action),
					getAuditHeadline(log),
					getActorLabel(log),
					getClubLabel(log),
					...getAuditDetailItems(log).map((item) => `${item.label} ${item.value}`)
				].some((value) => normalizeSearchText(value).includes(query));
			const matchesEntityType = !selectedEntityType || log.entityType === selectedEntityType;
			return matchesQuery && matchesEntityType;
		});
	});

	onMount(() => {
		if (!canReadAuditLogs) return;
		void loadInitialData();
	});

	$effect(() => {
		if (!canReadAuditLogs) {
			logs = [];
			return;
		}
	});

	$effect(() => {
		if (!canReadAuditLogs) return;
		const clubId = effectiveClubId;
		const token = currentAuthSession?.token;
		if (token) {
			void loadAuditLogs(clubId);
		}
	});

	async function loadInitialData() {
		try {
			clubs = await clubUseCases.list();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể tải danh sách CLB.');
		}
		await loadAuditLogs(effectiveClubId);
	}

	async function loadAuditLogs(clubId?: string) {
		try {
			isLoading = true;
			logs = await userManagementApi.listAuditLogs({
				clubId: clubId || undefined,
				limit: 100
			});
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể tải nhật ký hoạt động.');
		} finally {
			isLoading = false;
		}
	}

	function getEntityLabel(entityType: string): string {
		return (
			entityTypeOptions.find((option) => option.value === entityType)?.label ??
			entityType.replaceAll('_', ' ')
		);
	}

	function getActionLabel(action: string): string {
		switch (action) {
			case 'create':
				return 'Tạo mới';
			case 'update':
				return 'Cập nhật';
			case 'delete':
				return 'Xóa';
			case 'update_status':
				return 'Đổi trạng thái';
			case 'reset_password':
				return 'Đặt lại mật khẩu';
			case 'revoke':
				return 'Thu hồi';
			case 'accept':
				return 'Chấp nhận';
			case 'create_from_invite':
				return 'Tạo từ lời mời';
			case 'upload_avatar':
				return 'Tải ảnh';
			case 'set_primary_avatar':
				return 'Đặt ảnh chính';
			case 'delete_avatar':
				return 'Xóa ảnh';
			case 'batch_import_avatar':
				return 'Import avatar';
			case 'import':
				return 'Import dữ liệu';
			default:
				return action.replaceAll('_', ' ');
		}
	}

	function getActionBadgeClass(action: string): string {
		switch (action) {
			case 'create':
			case 'create_from_invite':
			case 'accept':
				return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
			case 'update':
			case 'update_status':
			case 'set_primary_avatar':
				return 'bg-sky-50 text-sky-700 ring-1 ring-sky-200';
			case 'reset_password':
			case 'import':
			case 'batch_import_avatar':
				return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
			case 'delete':
			case 'revoke':
			case 'delete_avatar':
				return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
			default:
				return 'bg-slate-100 text-slate-700 ring-1 ring-slate-200';
		}
	}

	function getEntityIcon(entityType: string): string {
		switch (entityType) {
			case 'users':
				return 'icon-[mdi--account-cog-outline]';
			case 'club_memberships':
				return 'icon-[mdi--badge-account-horizontal-outline]';
			case 'club_invites':
				return 'icon-[mdi--link-variant]';
			case 'clubs':
				return 'icon-[mdi--home-group-plus]';
			case 'belt_ranks':
				return 'icon-[mdi--medal-outline]';
			case 'students':
				return 'icon-[mdi--account-school-outline]';
			case 'attendance_sessions':
				return 'icon-[mdi--calendar-check-outline]';
			case 'attendance_records':
				return 'icon-[mdi--clipboard-check-outline]';
			case 'student_media':
				return 'icon-[mdi--image-outline]';
			default:
				return 'icon-[mdi--history]';
		}
	}

	function getActorLabel(log: AuditLog): string {
		if (!log.actorUserId) return 'Hệ thống';
		if (log.actorUserId === currentAuthSession?.user.id) return 'Bạn';
		if (log.actorName?.trim()) return log.actorName.trim();
		return `Tài khoản ${log.actorUserId.slice(0, 8)}`;
	}

	function getClubLabel(log: AuditLog): string {
		if (!log.clubId) return 'Toàn hệ thống';
		return clubNameById[log.clubId] ?? `CLB ${log.clubId}`;
	}

	function getAuditHeadline(log: AuditLog): string {
		const entityLabel = getEntityLabel(log.entityType).toLowerCase();
		switch (`${log.entityType}:${log.action}`) {
			case 'users:create':
				return 'Đã tạo tài khoản mới';
			case 'users:update_status':
				return 'Đã thay đổi trạng thái tài khoản';
			case 'users:reset_password':
				return 'Đã đặt lại mật khẩu tài khoản';
			case 'club_memberships:create':
				return 'Đã cấp quyền CLB';
			case 'club_memberships:create_from_invite':
				return 'Đã cấp quyền CLB từ link mời';
			case 'club_memberships:revoke':
				return 'Đã thu hồi quyền CLB';
			case 'club_invites:create':
				return 'Đã tạo link mời mới';
			case 'club_invites:revoke':
				return 'Đã thu hồi link mời';
			case 'club_invites:accept':
				return 'Đã chấp nhận link mời';
			case 'student_media:upload_avatar':
				return 'Đã tải ảnh đại diện';
			case 'student_media:set_primary_avatar':
				return 'Đã đặt ảnh đại diện chính';
			case 'student_media:delete_avatar':
				return 'Đã xóa ảnh đại diện';
			case 'student_media:batch_import_avatar':
				return 'Đã import hàng loạt avatar';
			default:
				return `${getActionLabel(log.action)} ${entityLabel}`;
		}
	}

	function getAuditDescription(log: AuditLog): string {
		const clubLabel = getClubLabel(log);
		const actorLabel = getActorLabel(log);
		if (log.clubId) {
			return `${actorLabel} thực hiện thao tác này trong ${clubLabel}.`;
		}
		return `${actorLabel} thực hiện thao tác ở phạm vi toàn hệ thống.`;
	}

	function formatRole(value: unknown): string {
		if (value === 'owner') return 'Chủ nhiệm';
		if (value === 'assistant') return 'Phụ tá';
		if (value === 'sys_admin') return 'Quản trị hệ thống';
		if (value === 'user') return 'Người dùng';
		return String(value ?? '');
	}

	function formatBoolean(value: unknown): string {
		if (value === true) return 'Có';
		if (value === false) return 'Không';
		return String(value ?? '');
	}

	function formatMetadataValue(key: string, value: unknown): string {
		if (value == null || value === '') return 'Không có';
		if (key === 'clubRole' || key === 'systemRole') return formatRole(value);
		if (key === 'isActive') return formatBoolean(value);
		if (Array.isArray(value)) return value.join(', ');
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function getMetadataDetailLabels(): Record<string, string> {
		return {
			acceptedByEmail: 'Email chấp nhận',
			acceptedByUserId: 'Tài khoản chấp nhận',
			batchId: 'Mã đợt import',
			clientModifiedAt: 'Thời điểm chỉnh sửa',
			clubIds: 'CLB liên quan',
			clubRole: 'Vai trò CLB',
			deviceId: 'Thiết bị',
			errorCount: 'Số dòng lỗi',
			failedCount: 'Số avatar lỗi',
			importedCount: 'Số bản ghi thành công',
			isActive: 'Kích hoạt',
			matchScore: 'Điểm khớp',
			mutationId: 'Mã đồng bộ',
			operation: 'Thao tác đồng bộ',
			replaceStrategy: 'Chiến lược thay thế',
			rowCount: 'Tổng số dòng',
			source: 'Nguồn',
			systemRole: 'Vai trò hệ thống',
			targetUserId: 'Tài khoản được tác động',
			userId: 'Tài khoản liên quan'
		};
	}

	function getAuditDetailItems(log: AuditLog): AuditDetail[] {
		const details: AuditDetail[] = [];
		if (log.entityId) {
			details.push({ label: 'Mã bản ghi', value: log.entityId });
		}
		const metadataLabels = getMetadataDetailLabels();
		for (const [key, value] of Object.entries(log.metadata ?? {})) {
			if (value == null || value === '' || key === 'source') continue;
			details.push({
				label: metadataLabels[key] ?? key,
				value: formatMetadataValue(key, value)
			});
		}
		return details;
	}

	function openAuditLogDetail(log: AuditLog) {
		selectedLog = log;
	}

	function closeAuditLogDetail() {
		selectedLog = null;
	}

	function formatJsonBlock(value: unknown): string {
		if (value == null) return 'Không có dữ liệu';
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}
</script>

<svelte:head>
	<title>Nhật ký hoạt động</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-8">
	<PageHeader
		eyebrow="Kiểm soát"
		title="Nhật ký hoạt động"
		description="Theo dõi các thao tác quản trị, phân quyền, đồng bộ và import dữ liệu theo cách dễ đọc hơn."
	/>

	{#if !canReadAuditLogs}
		<SectionCard title="Nhật ký hoạt động">
			<EmptyState
				title="Bạn không có quyền truy cập"
				description="Chỉ quản trị hệ thống và chủ nhiệm mới có thể xem nhật ký hoạt động."
			/>
		</SectionCard>
	{:else}
		<SectionCard title="Lịch sử thao tác">
			<DataTableToolbar
				bind:searchValue={search}
				searchPlaceholder="Tìm theo hành động, tài khoản, CLB hoặc thông tin liên quan..."
			>
				{#snippet filters()}
					<select class="w-full rounded-lg border-slate-300 xl:w-52" bind:value={selectedEntityType}>
						{#each entityTypeOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
					{#if isSystemAdmin}
						<select class="w-full rounded-lg border-slate-300 xl:w-60" bind:value={selectedClubId}>
							<option value="">Tất cả CLB</option>
							{#each clubs.filter((club) => !club.deletedAt) as club (club.id)}
								<option value={club.id}>{club.name}</option>
							{/each}
						</select>
					{/if}
				{/snippet}
			</DataTableToolbar>

			{#if isLoading}
				<p class="text-sm text-slate-500">Đang tải nhật ký hoạt động...</p>
			{:else if filteredLogs.length === 0}
				<EmptyState
					title="Chưa có dữ liệu phù hợp"
					description="Thay đổi bộ lọc hoặc thực hiện thao tác trong hệ thống để thấy nhật ký ở đây."
				/>
			{:else}
				<div class="space-y-3">
					{#each filteredLogs as log (log.id)}
						<button
							type="button"
							class="block w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-300 hover:shadow-md"
							onclick={() => openAuditLogDetail(log)}
						>
							<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
								<div class="flex min-w-0 gap-3">
									<div class="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
										<span class={`${getEntityIcon(log.entityType)} size-5`}></span>
									</div>
									<div class="min-w-0 space-y-2">
										<div class="flex flex-wrap items-center gap-2">
											<span class={`rounded-full px-2.5 py-1 text-xs font-semibold ${getActionBadgeClass(log.action)}`}>
												{getActionLabel(log.action)}
											</span>
											<span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
												{getEntityLabel(log.entityType)}
											</span>
										</div>
										<div class="space-y-1">
											<h3 class="text-base font-semibold text-slate-900">{getAuditHeadline(log)}</h3>
											<p class="text-sm text-slate-600">{getAuditDescription(log)}</p>
										</div>
										<div class="flex flex-wrap gap-2 text-xs text-slate-600">
											<span class="rounded-full bg-slate-100 px-2.5 py-1">{getActorLabel(log)}</span>
											<span class="rounded-full bg-slate-100 px-2.5 py-1">{getClubLabel(log)}</span>
											<span class="rounded-full bg-slate-100 px-2.5 py-1">
												{new Date(log.createdAt).toLocaleString()}
											</span>
											<span class="rounded-full bg-slate-950 px-2.5 py-1 text-white">
												Xem chi tiết
											</span>
										</div>
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</SectionCard>
	{/if}
</main>

<AppModal
	open={selectedLog !== null}
	title={selectedLog ? getAuditHeadline(selectedLog) : 'Chi tiết nhật ký'}
	description={selectedLog ? getAuditDescription(selectedLog) : undefined}
	onClose={closeAuditLogDetail}
	size="xl"
>
	{#if selectedLog}
		<div class="space-y-5">
			<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
					<p class="text-[11px] font-semibold tracking-[0.16em] text-slate-500 uppercase">Người thao tác</p>
					<p class="mt-1 text-sm font-medium text-slate-800">{getActorLabel(selectedLog)}</p>
				</div>
				<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
					<p class="text-[11px] font-semibold tracking-[0.16em] text-slate-500 uppercase">CLB</p>
					<p class="mt-1 text-sm font-medium text-slate-800">{getClubLabel(selectedLog)}</p>
				</div>
				<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
					<p class="text-[11px] font-semibold tracking-[0.16em] text-slate-500 uppercase">Thực thể</p>
					<p class="mt-1 text-sm font-medium text-slate-800">{getEntityLabel(selectedLog.entityType)}</p>
				</div>
				<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
					<p class="text-[11px] font-semibold tracking-[0.16em] text-slate-500 uppercase">Thời gian</p>
					<p class="mt-1 text-sm font-medium text-slate-800">{new Date(selectedLog.createdAt).toLocaleString()}</p>
				</div>
			</div>

			{#if getAuditDetailItems(selectedLog).length > 0}
				<div class="space-y-3">
					<h3 class="text-sm font-semibold text-slate-900">Thông tin chi tiết</h3>
					<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
						{#each getAuditDetailItems(selectedLog) as item (`${selectedLog.id}:${item.label}`)}
							<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
								<p class="text-[11px] font-semibold tracking-[0.16em] text-slate-500 uppercase">{item.label}</p>
								<p class="mt-1 break-words text-sm text-slate-700">{item.value}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div class="grid gap-4 xl:grid-cols-3">
				<div class="space-y-2 xl:col-span-1">
					<h3 class="text-sm font-semibold text-slate-900">Thông tin kỹ thuật</h3>
					<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
						<p><span class="font-medium text-slate-900">Mã log:</span> {selectedLog.id}</p>
						<p class="mt-1"><span class="font-medium text-slate-900">Mã bản ghi:</span> {selectedLog.entityId ?? 'Không có'}</p>
						<p class="mt-1"><span class="font-medium text-slate-900">Mã tài khoản:</span> {selectedLog.actorUserId ?? 'Hệ thống'}</p>
						<p class="mt-1"><span class="font-medium text-slate-900">Action:</span> {selectedLog.action}</p>
						<p class="mt-1"><span class="font-medium text-slate-900">Entity type:</span> {selectedLog.entityType}</p>
					</div>
				</div>

				<div class="space-y-2 xl:col-span-2">
					<h3 class="text-sm font-semibold text-slate-900">Metadata raw</h3>
					<pre class="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">{formatJsonBlock(selectedLog.metadata)}</pre>
				</div>

				<div class="space-y-2 xl:col-span-3">
					<h3 class="text-sm font-semibold text-slate-900">Dữ liệu trước / sau thay đổi</h3>
					<div class="grid gap-4 xl:grid-cols-2">
						<div>
							<p class="mb-2 text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">Old values</p>
							<pre class="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">{formatJsonBlock(selectedLog.oldValues)}</pre>
						</div>
						<div>
							<p class="mb-2 text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">New values</p>
							<pre class="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">{formatJsonBlock(selectedLog.newValues)}</pre>
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</AppModal>
