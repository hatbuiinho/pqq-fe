<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { AppModal, getDB, syncManager, syncStatus, subscribeDataChanged } from '$lib';
	import type { BeltRank, Club, Student, SyncStatusSnapshot } from '$lib';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import ToastViewport from '$lib/ui/components/ToastViewport.svelte';

	let sidebarOpen = $state(false);
	let syncIssuesOpen = $state(false);
	let isLoadingSyncIssues = $state(false);
	let syncIssues = $state<
		Array<{
			entityName: 'clubs' | 'belt_ranks' | 'students';
			recordId: string;
			title: string;
			detail?: string;
			syncError?: string;
			href: string;
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

	const navItems = [
		{
			href: '/',
			label: 'Dashboard',
			icon: 'icon-[mdi--view-dashboard-outline]',
			accent: 'from-[#65c7cb] to-[#3f8f93]'
		},
		{
			href: '/clubs',
			label: 'Clubs',
			icon: 'icon-[mdi--account-group-outline]',
			accent: 'from-[#5f82b8] to-[#3f8f93]'
		},
		{
			href: '/belt-ranks',
			label: 'Belt Ranks',
			icon: 'icon-[mdi--karate]',
			accent: 'from-[#7bc3c6] to-[#5f82b8]'
		},
		{
			href: '/students',
			label: 'Students',
			icon: 'icon-[mdi--account-school-outline]',
			accent: 'from-[#65c7cb] to-[#5f82b8]'
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
		if (!syncSnapshot.online) return 'Offline';
		if (syncSnapshot.isSyncing) return 'Syncing...';
		if (syncSnapshot.lastError) return 'Sync error';
		if (syncSnapshot.connectionState === 'connected') return 'Realtime connected';
		return 'Ready for sync';
	}

	function formatLastSync(value?: string): string {
		if (!value) return 'Never synced';

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Never synced';

		return date.toLocaleString();
	}

	async function loadSyncIssues() {
		if (typeof window === 'undefined') return;

		try {
			isLoadingSyncIssues = true;
			const db = getDB();
			const [clubs, beltRanks, students] = await Promise.all([
				db.clubs.where('syncStatus').equals('failed').toArray(),
				db.beltRanks.where('syncStatus').equals('failed').toArray(),
				db.students.where('syncStatus').equals('failed').toArray()
			]);

			syncIssues = [
				...clubs.map((club: Club) => ({
					entityName: 'clubs' as const,
					recordId: club.id,
					title: club.name,
					detail: club.code ?? club.id,
					syncError: club.syncError,
					href: '/clubs'
				})),
				...beltRanks.map((beltRank: BeltRank) => ({
					entityName: 'belt_ranks' as const,
					recordId: beltRank.id,
					title: beltRank.name,
					detail: `Order ${beltRank.order}`,
					syncError: beltRank.syncError,
					href: '/belt-ranks'
				})),
				...students.map((student: Student) => ({
					entityName: 'students' as const,
					recordId: student.id,
					title: student.fullName,
					detail: student.studentCode ?? student.id,
					syncError: student.syncError,
					href: '/students'
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

	function getEntityLabel(entityName: 'clubs' | 'belt_ranks' | 'students'): string {
		switch (entityName) {
			case 'clubs':
				return 'Club';
			case 'belt_ranks':
				return 'Belt rank';
			case 'students':
				return 'Student';
		}
	}

	onMount(() => {
		syncManager.start();

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
			syncManager.stop();
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#0f172a" />
</svelte:head>

<div class="h-[100dvh] overflow-hidden">
	<div class="relative flex h-[100dvh]">
		{#if sidebarOpen}
			<button
				type="button"
				class="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
				onclick={closeSidebar}
				aria-label="Close sidebar"
			></button>
		{/if}

		<aside
			class={`fixed top-0 left-0 z-40 h-[100dvh] w-72 transform border-r border-white/6 bg-[linear-gradient(180deg,var(--app-sidebar-top),var(--app-sidebar-bottom))] text-white shadow-[0_24px_60px_rgba(0,0,0,0.42)] transition-transform duration-300 lg:static lg:h-[100dvh] lg:translate-x-0 ${
				sidebarOpen ? 'translate-x-0' : '-translate-x-full'
			}`}
		>
			<div class="flex h-full flex-col overflow-hidden">
				<div class="relative border-b border-white/10 px-5 py-5">
					<p class="relative text-[11px] font-semibold tracking-[0.22em] text-white/50 uppercase">
						Offline First
					</p>
					<h1 class="relative mt-2 text-xl font-bold tracking-tight text-white">
						Martial Arts Manager
					</h1>
				</div>

				<nav class="flex-1 space-y-2 p-3">
					<p class="px-3 pt-2 text-[11px] font-semibold tracking-[0.18em] text-white/38 uppercase">
						Workspace
					</p>
					{#each navItems as item (item.href)}
						{@const isActive =
							page.url.pathname === item.href ||
							(item.href !== '/' && page.url.pathname.startsWith(item.href))}
						<a
							href={item.href}
							class={`group relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 text-sm font-medium transition-all duration-200 ${
								isActive
									? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
									: 'text-white/68 hover:bg-white/6 hover:text-white'
							}`}
							onclick={closeSidebar}
						>
							<span
								class={`absolute inset-y-2 left-1 w-1 rounded-full bg-gradient-to-b ${item.accent} ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}`}
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
									class="size-2 rounded-full bg-[var(--app-accent-cyan)] shadow-[0_0_0_4px_rgba(101,199,203,0.14)]"
								></span>
							{/if}
						</a>
					{/each}
				</nav>

				<div class="border-t border-white/10 p-4">
					<div class="rounded-2xl bg-white/6 p-4 space-y-4">
						<div class="flex items-center justify-between gap-3">
							<p class="text-xs font-semibold tracking-[0.18em] text-white/40 uppercase">Sync</p>
							<span
								class={`rounded-full border px-3 py-1 text-[11px] font-semibold ${getSyncBadgeClass()}`}
							>
								{getSyncLabel()}
							</span>
						</div>

						<div class="grid grid-cols-2 gap-2 text-sm">
							<div class="rounded-xl border border-white/10 bg-white/6 px-3 py-2">
								<p class="text-[11px] tracking-[0.16em] text-white/36 uppercase">Pending</p>
								<p class="mt-1 font-semibold text-white">{syncSnapshot.pendingCount}</p>
							</div>
							<div class="rounded-xl border border-white/10 bg-white/6 px-3 py-2">
								<p class="text-[11px] tracking-[0.16em] text-white/36 uppercase">Failed</p>
								<div class="mt-1 flex items-center justify-between gap-2">
									<p class="font-semibold text-white">{syncSnapshot.failedCount}</p>
									{#if syncSnapshot.failedCount > 0}
										<button
											type="button"
											class="text-[11px] font-medium text-red-200 transition hover:text-white"
											onclick={openSyncIssues}
										>
											View
										</button>
									{/if}
								</div>
							</div>
						</div>

						<div class="rounded-xl border border-white/10 bg-slate-950/18 px-3 py-3 text-sm">
							<div class="flex items-center justify-between gap-3">
								<span class="text-white/48">Last sync</span>
								<span class="text-right text-white/80"
									>{formatLastSync(syncSnapshot.lastSyncAt)}</span
								>
							</div>
							{#if syncSnapshot.lastError}
								<div class="mt-3 border-t border-white/8 pt-3">
									<p class="text-[11px] tracking-[0.16em] text-red-200/70 uppercase">Last error</p>
									<p class="mt-1 line-clamp-2 text-sm text-red-100/90">{syncSnapshot.lastError}</p>
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
								<span>Rebase</span>
							</button>
							<button
								type="button"
								class="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/12"
								onclick={() => void syncManager.syncNow()}
							>
								<span class="icon-[mdi--sync] size-4"></span>
								<span>Sync now</span>
							</button>
						</div>
					</div>
				</div>
			</div>
		</aside>

		<div class="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-[var(--app-bg)]">
			<header class="sticky top-0 z-20 px-4 pt-4">
				<div
					class="flex min-h-16 items-center gap-3 rounded-[1.35rem] border border-[var(--app-line)] bg-[var(--app-surface)] px-4 shadow-[0_10px_24px_rgba(15,23,42,0.07)] backdrop-blur-xl"
				>
					<button
						type="button"
						class="inline-flex items-center justify-center rounded-xl border border-[var(--app-line)] bg-white p-2 text-[var(--app-ink)] hover:bg-slate-50 lg:hidden"
						onclick={toggleSidebar}
						aria-label="Toggle sidebar"
					>
						<span class="icon-[mdi--menu] size-5"></span>
					</button>
					<div class="min-w-0 flex-1">
						<p
							class="text-[11px] font-semibold tracking-[0.18em] text-[var(--app-muted)] uppercase"
						>
							Management Workspace
						</p>
						<p class="truncate text-sm font-semibold text-[var(--app-ink)]">
							Offline-ready operations for clubs, belts, and students
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

<AppModal open={syncIssuesOpen} title="Sync issues" description="Failed local records that need your attention." size="lg" onClose={closeSyncIssues}>
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
				<span>Retry failed</span>
			</button>
		</div>
		{#if isLoadingSyncIssues}
			<p class="text-sm text-slate-500">Loading sync issues...</p>
		{:else if syncIssues.length === 0}
			<p class="text-sm text-slate-500">No failed records found.</p>
		{:else}
			{#each syncIssues as issue (`${issue.entityName}:${issue.recordId}`)}
				<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{getEntityLabel(issue.entityName)}</p>
							<p class="mt-1 truncate font-semibold text-slate-900">{issue.title}</p>
							{#if issue.detail}
								<p class="mt-1 text-sm text-slate-500">{issue.detail}</p>
							{/if}
							<p class="mt-2 text-sm text-red-700">{issue.syncError ?? 'Sync failed without a detailed error message.'}</p>
						</div>
						<a
							href={issue.href}
							class="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
							onclick={closeSyncIssues}
						>
							<span class="icon-[mdi--open-in-new] size-4"></span>
							<span>Open</span>
						</a>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</AppModal>
