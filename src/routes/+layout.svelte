<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		AppModal,
		avatarUploadManager,
		getDB,
		syncManager,
		syncStatus,
		subscribeDataChanged
	} from '$lib';
	import type {
		AttendanceRecord,
		AttendanceSession,
		BeltRank,
		Club,
		ClubGroup,
		Student,
		SyncStatusSnapshot
	} from '$lib';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ToastViewport from '$lib/ui/components/ToastViewport.svelte';

	let sidebarOpen = $state(false);
	let syncIssuesOpen = $state(false);
	let isLoadingSyncIssues = $state(false);
	let syncIssues = $state<
		Array<{
			entityName:
				| 'clubs'
				| 'club_groups'
				| 'belt_ranks'
				| 'students'
				| 'attendance_sessions'
				| 'attendance_records';
			recordId: string;
			title: string;
			detail?: string;
			syncError?: string;
			href: '/' | '/clubs' | '/belt-ranks' | '/students' | '/attendance';
		}>
	>([]);
	let { children } = $props();
	let syncSnapshot = $state<SyncStatusSnapshot>({
		online: true,
		isSyncing: false,
		connectionState: 'idle',
		pendingCount: 0,
		failedCount: 0,
		lastSyncAt: undefined as string | undefined,
		lastError: undefined as string | undefined
	});

	const navItems: Array<{
		href: '/' | '/clubs' | '/belt-ranks' | '/students' | '/attendance';
		label: string;
		icon: string;
		accent: string;
	}> = [
		{
			href: '/',
			label: 'Tổng quan',
			icon: 'icon-[mdi--view-dashboard-outline]',
			accent: 'from-[#65c7cb] to-[#3f8f93]'
		},
		{
			href: '/clubs',
			label: 'Câu lạc bộ',
			icon: 'icon-[mdi--account-group-outline]',
			accent: 'from-[#5f82b8] to-[#3f8f93]'
		},
		{
			href: '/belt-ranks',
			label: 'Cấp đai',
			icon: 'icon-[mdi--karate]',
			accent: 'from-[#7bc3c6] to-[#5f82b8]'
		},
		{
			href: '/students',
			label: 'Võ sinh',
			icon: 'icon-[mdi--account-school-outline]',
			accent: 'from-[#65c7cb] to-[#5f82b8]'
		},
		{
			href: '/attendance',
			label: 'Điểm danh',
			icon: 'icon-[mdi--clipboard-check-outline]',
			accent: 'from-[#7bc3c6] to-[#4d7ca6]'
		}
	];

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	function getSyncBadgeClass(): string {
		if (!syncSnapshot.online) return 'border-amber-200/20 bg-amber-50/10 text-amber-100';
		if (syncSnapshot.isSyncing) return 'border-sky-200/20 bg-sky-50/10 text-sky-100';
		if (syncSnapshot.lastError) return 'border-red-200/20 bg-red-50/10 text-red-100';
		if (syncSnapshot.connectionState === 'connected')
			return 'border-emerald-200/20 bg-emerald-50/10 text-emerald-100';
		return 'border-white/10 bg-white/8 text-white/78';
	}

	function getSyncLabel(): string {
		if (!syncSnapshot.online) return 'Ngoại tuyến';
		if (syncSnapshot.isSyncing) return 'Đang đồng bộ...';
		if (syncSnapshot.lastError) return 'Lỗi đồng bộ';
		if (syncSnapshot.connectionState === 'connected') return 'Realtime đã kết nối';
		return 'Sẵn sàng đồng bộ';
	}

	function formatLastSync(value?: string): string {
		if (!value) return 'Chưa từng đồng bộ';

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Chưa từng đồng bộ';

		return date.toLocaleString();
	}

	async function loadSyncIssues() {
		if (typeof window === 'undefined') return;

		try {
			isLoadingSyncIssues = true;
			const db = getDB();
			const [clubs, clubGroups, beltRanks, students, attendanceSessions, attendanceRecords] =
				await Promise.all([
					db.clubs.where('syncStatus').equals('failed').toArray(),
					db.clubGroups.where('syncStatus').equals('failed').toArray(),
					db.beltRanks.where('syncStatus').equals('failed').toArray(),
					db.students.where('syncStatus').equals('failed').toArray(),
					db.attendanceSessions.where('syncStatus').equals('failed').toArray(),
					db.attendanceRecords.where('syncStatus').equals('failed').toArray()
				]);

			syncIssues = [
				...clubs.map((club: Club) => ({
					entityName: 'clubs' as const,
					recordId: club.id,
					title: club.name,
					detail: club.code ?? club.id,
					syncError: club.syncError,
					href: '/clubs' as const
				})),
				...clubGroups.map((group: ClubGroup) => ({
					entityName: 'club_groups' as const,
					recordId: group.id,
					title: group.name,
					detail: group.clubId,
					syncError: group.syncError,
					href: '/clubs' as const
				})),
				...beltRanks.map((beltRank: BeltRank) => ({
					entityName: 'belt_ranks' as const,
					recordId: beltRank.id,
					title: beltRank.name,
					detail: `Order ${beltRank.order}`,
					syncError: beltRank.syncError,
					href: '/belt-ranks' as const
				})),
				...students.map((student: Student) => ({
					entityName: 'students' as const,
					recordId: student.id,
					title: student.fullName,
					detail: student.studentCode ?? student.id,
					syncError: student.syncError,
					href: '/students' as const
				})),
				...attendanceSessions.map((attendanceSession: AttendanceSession) => ({
					entityName: 'attendance_sessions' as const,
					recordId: attendanceSession.id,
					title: attendanceSession.sessionDate,
					detail: attendanceSession.clubId,
					syncError: attendanceSession.syncError,
					href: '/attendance' as const
				})),
				...attendanceRecords.map((attendanceRecord: AttendanceRecord) => ({
					entityName: 'attendance_records' as const,
					recordId: attendanceRecord.id,
					title: attendanceRecord.studentId,
					detail: attendanceRecord.sessionId,
					syncError: attendanceRecord.syncError,
					href: '/attendance' as const
				}))
			];
		} finally {
			isLoadingSyncIssues = false;
		}
	}

	function openSyncIssues() {
		syncIssuesOpen = true;
		void loadSyncIssues();
	}

	function closeSyncIssues() {
		syncIssuesOpen = false;
	}

	function getEntityLabel(
		entityName:
			| 'clubs'
			| 'club_groups'
			| 'belt_ranks'
			| 'students'
			| 'attendance_sessions'
			| 'attendance_records'
	): string {
		switch (entityName) {
			case 'clubs':
				return 'Club';
			case 'club_groups':
				return 'Club group';
			case 'belt_ranks':
				return 'Belt rank';
			case 'students':
				return 'Student';
			case 'attendance_sessions':
				return 'Attendance session';
			case 'attendance_records':
				return 'Attendance record';
		}
	}

	onMount(() => {
		syncManager.start();
		avatarUploadManager.start();

		const unsubscribe = syncStatus.subscribe((value) => {
			syncSnapshot = value;
		});
		const unsubscribeDataChanged = subscribeDataChanged(() => {
			if (!syncIssuesOpen) return;
			void loadSyncIssues();
		});

		return () => {
			unsubscribe();
			unsubscribeDataChanged();
			avatarUploadManager.stop();
			syncManager.stop();
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#0f172a" />
</svelte:head>

<div class="h-dvh overflow-hidden">
	<div class="relative flex h-dvh">
		{#if sidebarOpen}
			<button
				type="button"
				class="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
				onclick={closeSidebar}
				aria-label="Close sidebar"
			></button>
		{/if}

		<aside
			class={`fixed top-0 left-0 z-40 h-dvh w-72 transform border-r border-white/6 bg-[linear-gradient(180deg,var(--app-sidebar-top),var(--app-sidebar-bottom))] text-white shadow-[0_24px_60px_rgba(0,0,0,0.42)] transition-transform duration-300 lg:static lg:h-dvh lg:translate-x-0 ${
				sidebarOpen ? 'translate-x-0' : '-translate-x-full'
			}`}
		>
			<div class="flex h-full min-h-0 flex-col">
				<div class="relative border-b border-white/10 px-5 py-5">
					<h1 class="relative mt-2 text-xl font-bold tracking-tight text-white">
						Phật Quang Quyền
					</h1>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto">
					<nav class="space-y-2 p-3">
						<p class="px-3 pt-2 text-[11px] font-semibold tracking-[0.18em] text-white/38 uppercase">
							Khu Vực Làm Việc
						</p>
						{#each navItems as item (item.href)}
							{@const isActive =
								page.url.pathname === item.href ||
								(item.href !== '/' && page.url.pathname.startsWith(item.href))}
							<a
								href={resolve(item.href)}
								class={`group relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 text-sm font-medium transition-all duration-200 ${
									isActive
										? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
										: 'text-white/68 hover:bg-white/6 hover:text-white'
								}`}
								onclick={closeSidebar}
							>
								<span
									class={`absolute inset-y-2 left-1 w-1 rounded-full bg-linear-to-b ${item.accent} ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}`}
								></span>
								<span
									class={`inline-flex size-10 items-center justify-center rounded-xl border transition ${
										isActive
											? 'border-white/10 bg-white/8 text-white'
											: 'border-white/6 bg-slate-950/10 text-white/72 group-hover:border-white/10 group-hover:bg-white/6'
									}`}
								>
									<span class={`${item.icon} size-5`}></span>
								</span>
								<span class="flex-1">{item.label}</span>
								{#if isActive}
									<span
										class="size-2 rounded-full bg-(--app-accent-cyan) shadow-[0_0_0_4px_rgba(101,199,203,0.14)]"
									></span>
								{/if}
							</a>
						{/each}
					</nav>

					<div class="border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
						<div class="space-y-4 rounded-2xl bg-white/6 p-4">
							<div class="flex items-center justify-between gap-3">
								<p class="text-xs font-semibold tracking-[0.18em] text-white/40 uppercase">
									Đồng Bộ
								</p>
								<span
									class={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getSyncBadgeClass()}`}
								>
									{getSyncLabel()}
								</span>
							</div>

							<div class="grid grid-cols-2 gap-2 text-sm">
								<div class="rounded-xl border border-white/10 bg-white/6 px-3 py-2">
									<p class="text-[11px] tracking-[0.16em] text-white/36 uppercase">Đang Chờ</p>
									<p class="mt-1 font-semibold text-white">{syncSnapshot.pendingCount}</p>
								</div>
								<div class="rounded-xl border border-white/10 bg-white/6 px-3 py-2">
									<p class="text-[11px] tracking-[0.16em] text-white/36 uppercase">Lỗi</p>
									<div class="mt-1 flex items-center justify-between gap-2">
										<p class="font-semibold text-white">{syncSnapshot.failedCount}</p>
										{#if syncSnapshot.failedCount > 0}
											<button
												type="button"
												class="text-[11px] font-medium text-red-200 transition hover:text-white"
												onclick={openSyncIssues}
											>
												Xem
											</button>
										{/if}
									</div>
								</div>
							</div>

							<div class="rounded-xl border border-white/10 bg-slate-950/18 px-3 py-3 text-sm">
								<div class="flex items-center justify-between gap-3">
									<span class="text-white/48">Lần đồng bộ gần nhất</span>
									<span class="text-right text-white/80"
										>{formatLastSync(syncSnapshot.lastSyncAt)}</span
									>
								</div>
								{#if syncSnapshot.lastError}
									<div class="mt-3 border-t border-white/8 pt-3">
										<p class="text-[11px] tracking-[0.16em] text-red-200/70 uppercase">
											Lỗi gần nhất
										</p>
										<p class="mt-1 line-clamp-2 text-sm text-red-100/90">
											{syncSnapshot.lastError}
										</p>
									</div>
								{/if}
							</div>

							<div class="grid grid-cols-2 gap-2">
								<button
									type="button"
									class="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/12"
									onclick={() => void syncManager.rebaseFromServer()}
								>
									<span class="icon-[mdi--database-sync-outline] size-4"></span>
									<span>Tải lại</span>
								</button>
								<button
									type="button"
									class="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/12"
									onclick={() => void syncManager.syncNow()}
								>
									<span class="icon-[mdi--sync] size-4"></span>
									<span>Đồng bộ ngay</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</aside>

		<div class="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-(--app-bg)">
			<header class="sticky top-0 z-20 px-4 pt-4">
				<div
					class="flex min-h-16 items-center gap-3 rounded-[1.35rem] border border-(--app-line) bg-(--app-surface) px-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] backdrop-blur-xl"
				>
					<button
						type="button"
						class="inline-flex items-center justify-center rounded-xl border border-(--app-line) bg-white p-2 text-(--app-ink) hover:bg-slate-50 lg:hidden"
						onclick={toggleSidebar}
						aria-label="Toggle sidebar"
					>
						<span class="icon-[mdi--menu] size-5"></span>
					</button>
					<div class="min-w-0 flex-1">
						<p class="text-[11px] font-semibold tracking-[0.18em] text-(--app-muted) uppercase">
							Không gian quản lý
						</p>
					</div>
				</div>
			</header>

			<main class="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-2 pt-4 pb-2 sm:px-3">
				{@render children()}
			</main>
		</div>
	</div>
</div>

<ToastViewport />

<AppModal
	open={syncIssuesOpen}
	title="Lỗi đồng bộ"
	description="Các bản ghi lỗi cần bạn xử lý."
	size="lg"
	onClose={closeSyncIssues}
>
	<div class="space-y-3">
		<div class="flex items-center justify-end">
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
				onclick={async () => {
					await syncManager.syncNow();
					await loadSyncIssues();
				}}
			>
				<span class="icon-[mdi--sync] size-4"></span>
				<span>Thử lại bản ghi lỗi</span>
			</button>
		</div>
		{#if isLoadingSyncIssues}
			<p class="text-sm text-slate-500">Đang tải danh sách lỗi đồng bộ...</p>
		{:else if syncIssues.length === 0}
			<p class="text-sm text-slate-500">Không có bản ghi lỗi.</p>
		{:else}
			{#each syncIssues as issue (`${issue.entityName}:${issue.recordId}`)}
				<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
								{getEntityLabel(issue.entityName)}
							</p>
							<p class="mt-1 truncate font-semibold text-slate-900">{issue.title}</p>
							{#if issue.detail}
								<p class="mt-1 text-sm text-slate-500">{issue.detail}</p>
							{/if}
							<p class="mt-2 text-sm text-red-700">
								{issue.syncError ?? 'Đồng bộ thất bại nhưng chưa có thông tin lỗi chi tiết.'}
							</p>
						</div>
						<a
							href={resolve(issue.href)}
							class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
							onclick={closeSyncIssues}
						>
							<span class="icon-[mdi--open-in-new] size-4"></span>
							<span>Mở</span>
						</a>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</AppModal>
