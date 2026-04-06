<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		AppModal,
		avatarUploadManager,
		authSession,
		clearAuthSession,
		ensureClubPermissions,
		getDB,
		loadAuthSession,
		logout,
		resetSyncStatus,
		refreshAuthSession,
		setActiveClubId,
		userManagementApi,
		type AuthSession,
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
	import ToastViewport from '$lib/ui/components/ToastViewport.svelte';
	import { toastError, toastSuccess } from '$lib/app/toast';

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
			href: '/' | '/clubs' | '/belt-ranks' | '/students' | '/attendance' | '/users' | '/audit-logs';
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
	let currentAuthSession = $state<AuthSession | null>(null);
	let isAuthReady = $state(false);
	let managersStarted = $state(false);
	let profilePopoverOpen = $state(false);
	let profilePopoverElement = $state<HTMLElement | null>(null);
	let hydratedSessionToken = $state<string | null>(null);
	let isHydratingSessionData = $state(false);
	let isOwnerInviteModalOpen = $state(false);
	let isCreatingOwnerInvite = $state(false);
	let isOwnerInviteResultModalOpen = $state(false);
	let ownerInviteEmail = $state('');
	let ownerInviteExpiresInDays = $state(7);
	let ownerInviteFormError = $state('');
	let ownerInviteShareUrl = $state('');

	const navItems: Array<{
		href: '/' | '/clubs' | '/belt-ranks' | '/students' | '/attendance' | '/users' | '/audit-logs';
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
		},
		{
			href: '/users',
			label: 'Người dùng',
			icon: 'icon-[mdi--account-cog-outline]',
			accent: 'from-[#73b8bf] to-[#4f7ea3]'
		},
		{
			href: '/audit-logs',
			label: 'Nhật ký',
			icon: 'icon-[mdi--history]',
			accent: 'from-[#6db9b4] to-[#3f8f93]'
		}
	];
	const publicStudentDetailPattern = /^\/students\/[^/]+$/;
	const publicAcceptInvitePattern = /^\/accept-invite\/[^/]+$/;
	const pathname = $derived(page.url.pathname);
	const isPublicRoute = $derived(
		pathname === '/login' ||
			publicStudentDetailPattern.test(pathname) ||
			publicAcceptInvitePattern.test(pathname)
	);
	const showAppChrome = $derived(isAuthReady && !!currentAuthSession && !isPublicRoute);
	const isSystemAdmin = $derived(currentAuthSession?.user.systemRole === 'sys_admin');
	const canManageAdminAreas = $derived(isSystemAdmin);
	const activeClubMembership = $derived(
		currentAuthSession?.memberships.find(
			(membership) => membership.clubId === currentAuthSession?.activeClubId
		) ?? currentAuthSession?.memberships[0]
	);
	const canReadAuditLogs = $derived(isSystemAdmin || activeClubMembership?.clubRole === 'owner');
	const visibleNavItems = $derived.by(() =>
		navItems.filter((item) => {
			if (item.href === '/clubs' || item.href === '/belt-ranks' || item.href === '/users') {
				return canManageAdminAreas;
			}
			if (item.href === '/audit-logs') {
				return canReadAuditLogs;
			}
			return true;
		})
	);
	const canShareOwnerInvite = $derived(activeClubMembership?.clubRole === 'owner');

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	function navigateTo(path: '/' | '/clubs' | '/belt-ranks' | '/students' | '/attendance' | '/users' | '/audit-logs') {
		closeSidebar();
		void goto(resolve(path));
	}

	function toggleProfilePopover() {
		profilePopoverOpen = !profilePopoverOpen;
	}

	function closeProfilePopover() {
		profilePopoverOpen = false;
	}

	function openOwnerInviteModal() {
		if (!canShareOwnerInvite || !activeClubMembership) {
			toastError('Bạn không có quyền tạo link mời cho CLB.');
			return;
		}
		ownerInviteEmail = '';
		ownerInviteExpiresInDays = 7;
		ownerInviteFormError = '';
		isOwnerInviteModalOpen = true;
		closeProfilePopover();
	}

	function closeOwnerInviteModal() {
		isOwnerInviteModalOpen = false;
		ownerInviteEmail = '';
		ownerInviteExpiresInDays = 7;
		ownerInviteFormError = '';
	}

	function closeOwnerInviteResultModal() {
		isOwnerInviteResultModalOpen = false;
		ownerInviteShareUrl = '';
	}

	function getUserInitials(fullName: string | undefined): string {
		const normalized = fullName?.trim() ?? '';
		if (!normalized) return 'U';

		const parts = normalized.split(/\s+/).filter(Boolean);
		return parts
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('');
	}

	function startManagers() {
		if (managersStarted) return;
		syncManager.start();
		avatarUploadManager.start();
		managersStarted = true;
	}

	function stopManagers() {
		if (!managersStarted) return;
		avatarUploadManager.stop();
		syncManager.stop();
		resetSyncStatus();
		managersStarted = false;
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

	async function copyText(value: string, successMessage: string) {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
			} else {
				const textarea = document.createElement('textarea');
				textarea.value = value;
				textarea.setAttribute('readonly', 'true');
				textarea.style.position = 'absolute';
				textarea.style.left = '-9999px';
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand('copy');
				document.body.removeChild(textarea);
			}
			toastSuccess(successMessage);
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể copy nội dung.');
		}
	}

	async function handleOwnerInviteSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!activeClubMembership) return;

		const normalizedEmail = ownerInviteEmail.trim();
		if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
			ownerInviteFormError = 'Email không hợp lệ.';
			return;
		}
		if (
			!Number.isInteger(ownerInviteExpiresInDays) ||
			ownerInviteExpiresInDays < 1 ||
			ownerInviteExpiresInDays > 30
		) {
			ownerInviteFormError = 'Số ngày hiệu lực phải từ 1 đến 30.';
			return;
		}

		ownerInviteFormError = '';

		try {
			isCreatingOwnerInvite = true;
			const result = await userManagementApi.createClubInvite({
				clubId: activeClubMembership.clubId,
				clubRole: 'assistant',
				inviteeEmail: normalizedEmail || undefined,
				expiresInDays: ownerInviteExpiresInDays
			});
			ownerInviteShareUrl =
				typeof window === 'undefined'
					? result.shareUrl
					: `${window.location.origin}/accept-invite/${result.token}`;
			closeOwnerInviteModal();
			isOwnerInviteResultModalOpen = true;
			toastSuccess('Đã tạo link mời phụ tá.');
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể tạo link mời.');
		} finally {
			isCreatingOwnerInvite = false;
		}
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

	function openSyncIssue(path: '/' | '/clubs' | '/belt-ranks' | '/students' | '/attendance' | '/users' | '/audit-logs') {
		closeSyncIssues();
		void goto(resolve(path));
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
		loadAuthSession();

		const unsubscribeAuth = authSession.subscribe((value) => {
			currentAuthSession = value;
		});
		const unsubscribe = syncStatus.subscribe((value) => {
			syncSnapshot = value;
		});
		const unsubscribeDataChanged = subscribeDataChanged(() => {
			if (!syncIssuesOpen) return;
			void loadSyncIssues();
		});
		const handleDocumentPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (profilePopoverElement?.contains(target)) return;
			closeProfilePopover();
		};
		document.addEventListener('pointerdown', handleDocumentPointerDown);

		const initialize = async () => {
			try {
				if (currentAuthSession?.token) {
					await refreshAuthSession();
				}
			} catch {
				clearAuthSession();
			} finally {
				isAuthReady = true;
			}
		};

		void initialize();

		return () => {
			document.removeEventListener('pointerdown', handleDocumentPointerDown);
			unsubscribeAuth();
			unsubscribe();
			unsubscribeDataChanged();
			stopManagers();
		};
	});

	$effect(() => {
		if (!isAuthReady) return;

		if (!currentAuthSession && !isPublicRoute) {
			stopManagers();
			if (pathname !== '/login') {
				void goto(resolve('/login'), { replaceState: true });
			}
			return;
		}

		if (currentAuthSession && pathname === '/login') {
			void goto(resolve('/'), { replaceState: true });
		}

		if (
			currentAuthSession &&
			(pathname.startsWith('/clubs') ||
				pathname.startsWith('/belt-ranks') ||
				pathname.startsWith('/users')) &&
			!canManageAdminAreas
		) {
			void goto(resolve('/'), { replaceState: true });
		}

		if (currentAuthSession && pathname.startsWith('/audit-logs') && !canReadAuditLogs) {
			void goto(resolve('/'), { replaceState: true });
		}
	});

	$effect(() => {
		if (!isAuthReady) return;

		if (currentAuthSession && !isPublicRoute) {
			startManagers();
			return;
		}

		stopManagers();
	});

	$effect(() => {
		if (!isAuthReady || isPublicRoute) return;
		if (!currentAuthSession?.activeClubId) return;

		void ensureClubPermissions(currentAuthSession.activeClubId).catch(() => undefined);
	});

	$effect(() => {
		if (!isAuthReady || isPublicRoute) return;
		if (!currentAuthSession?.token) {
			hydratedSessionToken = null;
			isHydratingSessionData = false;
			return;
		}
		if (hydratedSessionToken === currentAuthSession.token) return;

		const targetToken = currentAuthSession.token;
		hydratedSessionToken = targetToken;
		isHydratingSessionData = true;
		sidebarOpen = false;
		profilePopoverOpen = false;
		void syncManager.hydrateCurrentSession().finally(() => {
			if (currentAuthSession?.token === targetToken) {
				isHydratingSessionData = false;
			}
		});
	});
</script>

<svelte:head>
	<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
	<link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#0f172a" />
</svelte:head>

{#if !isAuthReady}
	<div class="flex min-h-dvh items-center justify-center bg-(--app-bg) px-4">
		<p class="text-sm font-medium text-(--app-muted)">Đang kiểm tra phiên đăng nhập...</p>
	</div>
{:else if !showAppChrome}
	{@render children()}
{:else}
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
							<p
								class="px-3 pt-2 text-[11px] font-semibold tracking-[0.18em] text-white/38 uppercase"
							>
								Khu Vực Làm Việc
							</p>
							{#each visibleNavItems as item (item.href)}
								{@const isActive =
									page.url.pathname === item.href ||
									(item.href !== '/' && page.url.pathname.startsWith(item.href))}
								<button
									type="button"
									class={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left text-sm font-medium transition-all duration-200 ${
										isActive
											? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
											: 'text-white/68 hover:bg-white/6 hover:text-white'
									}`}
									onclick={() => {
										navigateTo(item.href);
									}}
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
								</button>
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
													class="cursor-pointer text-[11px] font-medium text-red-200 transition hover:text-white"
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
										class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/12"
										onclick={() => void syncManager.rebaseFromServer()}
									>
										<span class="icon-[mdi--database-sync-outline] size-4"></span>
										<span>Tải lại</span>
									</button>
									<button
										type="button"
										class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/12"
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
						class="flex min-h-16 items-center justify-between gap-4 rounded-[1.35rem] border border-white/45 bg-linear-to-b from-white/54 to-white/24 px-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] backdrop-blur-2xl"
					>
						<div class="flex min-w-0 flex-1 items-center gap-3">
							<button
								type="button"
								class="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-(--app-line) bg-white p-3 text-(--app-ink) hover:bg-slate-50 lg:hidden"
								onclick={toggleSidebar}
								aria-label="Toggle sidebar"
							>
								<span class="icon-[mdi--menu] size-5"></span>
							</button>
							<div class="min-w-0 flex-1 p-3">
								<p class="text-[13px] font-semibold tracking-[0.18em] text-(--app-muted) uppercase">
									Không gian quản lý
								</p>
								{#if activeClubMembership}
									<p class="truncate text-sm font-medium text-(--app-ink)">
										{activeClubMembership.clubName}
										<span class="text-(--app-muted)">
											· {activeClubMembership.clubRole === 'owner' ? 'Chủ nhiệm' : 'Phụ tá'}
										</span>
									</p>
								{/if}
							</div>
						</div>
						{#if currentAuthSession}
							<div class="relative" bind:this={profilePopoverElement}>
								<button
									type="button"
									class="inline-flex cursor-pointer items-center gap-2 rounded-2xl px-2.5 py-2 text-left transition"
									onclick={toggleProfilePopover}
									aria-label="Mở menu hồ sơ"
									aria-expanded={profilePopoverOpen}
								>
									<span
										class="inline-flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white"
									>
										{getUserInitials(currentAuthSession.user.fullName)}
									</span>
									<span
										class="hidden max-w-40 truncate text-sm font-semibold text-(--app-ink) sm:block"
									>
										{currentAuthSession.user.fullName}
									</span>
									<span
										class={`icon-[mdi--chevron-down] size-5 text-(--app-muted) transition ${profilePopoverOpen ? 'rotate-180' : ''}`}
									></span>
								</button>

								{#if profilePopoverOpen}
									<div
										class="absolute top-[calc(100%+0.75rem)] right-1 z-30 w-[min(22rem,calc(100vw-2.75rem))] overflow-hidden rounded-[1.4rem] border border-(--app-line) bg-white p-4 shadow-[0_24px_64px_rgba(15,23,42,0.16)] sm:right-0 sm:w-88"
									>
										<div class="flex items-start gap-3">
											<span
												class="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-base font-semibold text-white"
											>
												{getUserInitials(currentAuthSession.user.fullName)}
											</span>
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-semibold text-(--app-ink)">
													{currentAuthSession.user.fullName}
												</p>
												<p class="truncate text-sm text-(--app-muted)">
													{currentAuthSession.user.email}
												</p>
												<p
													class="mt-1 text-[11px] font-semibold tracking-[0.16em] text-(--app-muted) uppercase"
												>
													{currentAuthSession.user.systemRole === 'sys_admin'
														? 'Quản trị hệ thống'
														: 'Người dùng hệ thống'}
												</p>
											</div>
										</div>

										{#if currentAuthSession.memberships.length > 0}
											<div class="mt-4 space-y-2">
												<span
													class="block text-[11px] font-semibold tracking-[0.16em] text-(--app-muted) uppercase"
												>
													CLB đang làm việc
												</span>
												{#if isSystemAdmin}
													<select
														class="w-full rounded-2xl border border-(--app-line) bg-white px-3 py-3 text-sm text-(--app-ink) transition outline-none focus:border-slate-400"
														value={activeClubMembership?.clubId ?? ''}
														onchange={(event) => {
															setActiveClubId(event.currentTarget.value);
															closeProfilePopover();
														}}
													>
														{#each currentAuthSession.memberships as membership (membership.id)}
															<option value={membership.clubId}>
																{membership.clubName} · {membership.clubRole === 'owner'
																	? 'Chủ nhiệm'
																	: 'Phụ tá'}
															</option>
														{/each}
													</select>
												{:else if activeClubMembership}
													<div
														class="rounded-2xl border border-(--app-line) bg-slate-50 px-3 py-3 text-sm text-(--app-ink)"
													>
														{activeClubMembership.clubName} · {activeClubMembership.clubRole ===
														'owner'
															? 'Chủ nhiệm'
															: 'Phụ tá'}
													</div>
												{/if}
											</div>
										{/if}

										{#if canShareOwnerInvite && activeClubMembership}
											<div class="mt-4">
												<button
													type="button"
													class="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-(--app-line) bg-slate-50 px-4 py-3 text-sm font-semibold text-(--app-ink) transition hover:bg-slate-100"
													onclick={openOwnerInviteModal}
												>
													<span class="icon-[mdi--account-plus-outline] size-4"></span>
													<span>Mời phụ tá vào {activeClubMembership.clubName}</span>
												</button>
											</div>
										{/if}

										<div class="mt-4 flex gap-2">
											<button
												type="button"
												class="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
												onclick={() => void logout()}
											>
												<span class="icon-[mdi--logout] size-4"></span>
												<span>Đăng xuất</span>
											</button>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</header>

				<main class="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-2 pt-4 pb-2 sm:px-3">
					{#key currentAuthSession?.token}
						{@render children()}
					{/key}
				</main>
			</div>
		</div>
	</div>
{/if}

{#if showAppChrome && isHydratingSessionData}
	<div
		class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-white/45 backdrop-blur-[2px]"
	>
		<div
			class="rounded-2xl border border-(--app-line) bg-white px-5 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)]"
		>
			<div class="flex items-center gap-3">
				<span class="icon-[mdi--sync] size-5 animate-spin text-(--app-accent-cyan)"></span>
				<div>
					<p class="text-sm font-semibold text-(--app-ink)">Đang tải dữ liệu theo tài khoản mới</p>
					<p class="text-sm text-(--app-muted)">Ứng dụng đang làm mới dữ liệu cục bộ.</p>
				</div>
			</div>
		</div>
	</div>
{/if}

<ToastViewport />

<AppModal
	open={isOwnerInviteModalOpen}
	title="Tạo link mời phụ tá"
	description={activeClubMembership
		? `Tạo link mời phụ tá cho ${activeClubMembership.clubName}.`
		: 'Tạo link mời phụ tá cho CLB hiện tại.'}
	size="md"
	onClose={closeOwnerInviteModal}
>
	<form class="space-y-4" onsubmit={handleOwnerInviteSubmit}>
		<label class="block space-y-2">
			<span class="text-sm font-medium text-slate-700">CLB</span>
			<input
				type="text"
				class="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900"
				readonly
				value={activeClubMembership?.clubName ?? ''}
			/>
		</label>

		<label class="block space-y-2">
			<span class="text-sm font-medium text-slate-700">Vai trò được mời</span>
			<input
				type="text"
				class="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900"
				readonly
				value="Phụ tá"
			/>
		</label>

		<label class="block space-y-2">
			<span class="text-sm font-medium text-slate-700">Email người nhận</span>
			<input
				type="email"
				class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
				bind:value={ownerInviteEmail}
				placeholder="Để trống nếu không khóa theo email"
			/>
			<p class="text-xs text-slate-500">
				Nếu nhập email, chỉ đúng tài khoản đó mới có thể nhận lời mời.
			</p>
		</label>

		<label class="block space-y-2">
			<span class="text-sm font-medium text-slate-700">Hiệu lực (ngày)</span>
			<input
				type="number"
				min="1"
				max="30"
				class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
				bind:value={ownerInviteExpiresInDays}
				required
			/>
		</label>

		{#if ownerInviteFormError}
			<p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				{ownerInviteFormError}
			</p>
		{/if}

		<div class="flex gap-3">
			<button
				type="submit"
				class="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
				disabled={isCreatingOwnerInvite}
			>
				{isCreatingOwnerInvite ? 'Đang tạo...' : 'Tạo link mời'}
			</button>
			<button
				type="button"
				class="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
				onclick={closeOwnerInviteModal}
			>
				Hủy
			</button>
		</div>
	</form>
</AppModal>

<AppModal
	open={isOwnerInviteResultModalOpen}
	title="Link mời phụ tá"
	description="Copy link này và gửi cho người nhận. Hệ thống chỉ hiển thị đầy đủ link ngay sau khi tạo."
	size="md"
	onClose={closeOwnerInviteResultModal}
>
	<div class="space-y-4">
		<label class="block space-y-2">
			<span class="text-sm font-medium text-slate-700">Link mời</span>
			<textarea
				class="min-h-28 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800"
				readonly
				value={ownerInviteShareUrl}
			></textarea>
		</label>
		<div class="flex gap-3">
			<button
				type="button"
				class="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
				onclick={() => void copyText(ownerInviteShareUrl, 'Đã copy link mời.')}
			>
				Copy link
			</button>
			<button
				type="button"
				class="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
				onclick={closeOwnerInviteResultModal}
			>
				Đóng
			</button>
		</div>
	</div>
</AppModal>

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
						<button
							type="button"
							class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
							onclick={() => {
								openSyncIssue(issue.href);
							}}
						>
							<span class="icon-[mdi--open-in-new] size-4"></span>
							<span>Mở</span>
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</AppModal>
