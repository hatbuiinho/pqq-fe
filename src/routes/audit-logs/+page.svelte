<script lang="ts">
	import { onMount } from 'svelte';
	import {
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

	let logs = $state<AuditLog[]>([]);
	let clubs = $state<Club[]>([]);
	let isLoading = $state(false);
	let search = $state('');
	let selectedEntityType = $state('');
	let selectedClubId = $state('');

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

	const filteredLogs = $derived.by(() => {
		const query = normalizeSearchText(search);
		return logs.filter((log) => {
			const matchesQuery =
				!query ||
				[
					getEntityLabel(log.entityType),
					getActionLabel(log.action),
					log.entityId ?? '',
					log.clubId ?? '',
					JSON.stringify(log.metadata ?? {})
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
		const dependencies = [effectiveClubId, currentAuthSession?.token];
		if (dependencies.length >= 0) {
			void loadAuditLogs();
		}
	});

	async function loadInitialData() {
		if (isSystemAdmin) {
			try {
				clubs = await clubUseCases.list();
			} catch (error) {
				toastError(error instanceof Error ? error.message : 'Không thể tải danh sách CLB.');
			}
		}
		await loadAuditLogs();
	}

	async function loadAuditLogs() {
		try {
			isLoading = true;
			logs = await userManagementApi.listAuditLogs({
				clubId: effectiveClubId || undefined,
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

	function formatMetadata(metadata: Record<string, unknown> | undefined): string {
		if (!metadata || Object.keys(metadata).length === 0) return 'Không có metadata';
		return Object.entries(metadata)
			.map(([key, value]) => `${key}: ${String(value)}`)
			.join(' · ');
	}
</script>

<svelte:head>
	<title>Nhật ký hoạt động</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-8">
	<PageHeader
		eyebrow="Kiểm soát"
		title="Nhật ký hoạt động"
		description="Theo dõi các thao tác quản trị, phân quyền, đồng bộ và import dữ liệu."
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
			<DataTableToolbar bind:searchValue={search} searchPlaceholder="Tìm theo thực thể, hành động, mã bản ghi...">
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
						<article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
							<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
								<div class="space-y-2">
									<div class="flex flex-wrap items-center gap-2">
										<span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
											{getEntityLabel(log.entityType)}
										</span>
										<span class="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white">
											{getActionLabel(log.action)}
										</span>
									</div>
									<div class="grid gap-1 text-sm text-slate-600">
										<p>Mã bản ghi: {log.entityId ?? 'Không có'}</p>
										<p>CLB: {log.clubId ?? 'Phạm vi toàn hệ thống'}</p>
										<p>Người thao tác: {log.actorUserId ?? 'Hệ thống'}</p>
										<p>Thời gian: {new Date(log.createdAt).toLocaleString()}</p>
										<p class="break-words">Metadata: {formatMetadata(log.metadata)}</p>
									</div>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</SectionCard>
	{/if}
</main>
