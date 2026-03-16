<script lang="ts">
	import { onMount } from 'svelte';
	import { EmptyState, PageHeader, SectionCard, subscribeDataChanged, tooltip } from '$lib';
	import type { BeltRank, Club, Student } from '$lib/domain/models';
	import { beltRankUseCases, clubUseCases, studentUseCases } from '$lib/app/services';

	type SummaryCard = {
		label: string;
		value: number;
		icon: string;
		description: string;
	};

	let clubs = $state<Club[]>([]);
	let beltRanks = $state<BeltRank[]>([]);
	let students = $state<Student[]>([]);
	let isLoading = $state(false);
	let errorMessage = $state('');

	onMount(() => {
		void loadDashboard();

		return subscribeDataChanged(() => {
			void loadDashboard();
		});
	});

	async function loadDashboard() {
		try {
			isLoading = true;
			errorMessage = '';

			const [clubRows, beltRankRows, studentRows] = await Promise.all([
				clubUseCases.list(),
				beltRankUseCases.list(),
				studentUseCases.list()
			]);

			clubs = clubRows;
			beltRanks = beltRankRows;
			students = studentRows;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load dashboard.';
		} finally {
			isLoading = false;
		}
	}

	const activeStudentsCount = $derived.by(
		() => students.filter((student) => student.status === 'active').length
	);
	const pendingChangesCount = $derived.by(
		() =>
			[...clubs, ...beltRanks, ...students].filter((item) => item.syncStatus !== 'synced').length
	);
	const studentsWithoutCodeCount = $derived.by(
		() => students.filter((student) => !student.studentCode).length
	);
	const recentStudents = $derived.by(() =>
		[...students]
			.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
			.slice(0, 5)
	);
	const studentsByClub = $derived.by(() =>
		clubs
			.map((club) => ({
				id: club.id,
				name: club.name,
				count: students.filter((student) => student.clubId === club.id).length
			}))
			.sort((a, b) => b.count - a.count)
	);

	const summaryCards = $derived.by<SummaryCard[]>(() => [
		{
			label: 'Total Students',
			value: students.length,
			icon: 'icon-[mdi--account-school-outline]',
			description: 'All students currently stored on this device'
		},
		{
			label: 'Active Students',
			value: activeStudentsCount,
			icon: 'icon-[mdi--account-check-outline]',
			description: 'Students with active status'
		},
		{
			label: 'Total Clubs',
			value: clubs.length,
			icon: 'icon-[mdi--account-group-outline]',
			description: 'Available clubs for student assignment'
		},
		{
			label: 'Total Belt Ranks',
			value: beltRanks.length,
			icon: 'icon-[mdi--karate]',
			description: 'Current belt rank definitions'
		}
	]);
</script>

<main class="mx-auto max-w-7xl space-y-8 px-4 py-8">
	<PageHeader
		eyebrow="Dashboard"
		title="Martial Arts Club Manager"
		description="Track students, clubs, and belt ranks with an offline-first workflow built for daily operation."
	>
		{#snippet actions()}
			<a
				class="inline-flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-slate-300"
				href="/students"
				use:tooltip={{ text: 'Add student', placement: 'bottom' }}
				aria-label="Add student"
			>
				<span class="icon-[mdi--plus] size-4"></span>
			</a>
			<a
				class="inline-flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-slate-300"
				href="/clubs"
				use:tooltip={{ text: 'Add club', placement: 'bottom' }}
				aria-label="Add club"
			>
				<span class="icon-[mdi--office-building-plus-outline] size-4"></span>
			</a>
			<a
				class="inline-flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-slate-300"
				href="/belt-ranks"
				use:tooltip={{ text: 'Add belt rank', placement: 'bottom' }}
				aria-label="Add belt rank"
			>
				<span class="icon-[mdi--plus-circle-outline] size-4"></span>
			</a>
		{/snippet}
	</PageHeader>

	{#if errorMessage}
		<p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{errorMessage}
		</p>
	{/if}

	<section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
		{#each summaryCards as card (card.label)}
			<article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
				<div class="flex items-start justify-between gap-4">
					<div class="space-y-1">
						<p class="text-sm font-medium text-slate-500">{card.label}</p>
						<p class="text-3xl font-bold text-slate-900">{isLoading ? '...' : card.value}</p>
					</div>
					<div class="rounded-xl bg-slate-900 p-3 text-white">
						<span class={`${card.icon} size-5`}></span>
					</div>
				</div>
				<p class="mt-4 text-sm text-slate-600">{card.description}</p>
			</article>
		{/each}
	</section>

	<section class="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
		<SectionCard title="Recent Students" description="Latest students added on this device">
			{#snippet actions()}
				<a class="text-sm font-medium text-slate-700 hover:text-slate-900" href="/students"
					>View all</a
				>
			{/snippet}

			{#if recentStudents.length === 0}
				<EmptyState
					title="No students yet"
					description="Create students to see the latest records appear here."
				/>
			{:else}
				<div class="space-y-3">
					{#each recentStudents as student (student.id)}
						<div
							class="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div>
								<p class="font-medium text-slate-900">{student.fullName}</p>
								<p class="text-sm text-slate-500">
									{student.studentCode ?? 'Generated on sync'} • {student.status}
								</p>
							</div>
							<div class="text-sm text-slate-600">
								{new Date(student.createdAt).toLocaleDateString()}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</SectionCard>

		<div class="space-y-6">
			<SectionCard title="Students by Club" description="Distribution of students across clubs">
				{#if studentsByClub.length === 0}
					<EmptyState
						title="No club data yet"
						description="Create a club first to see club-level student counts."
					/>
				{:else}
					<div class="space-y-3">
						{#each studentsByClub as item (item.id)}
							<div class="space-y-1">
								<div class="flex items-center justify-between text-sm">
									<span class="font-medium text-slate-700">{item.name}</span>
									<span class="text-slate-500">{item.count}</span>
								</div>
								<div class="h-2 rounded-full bg-slate-100">
									<div
										class="h-2 rounded-full bg-slate-900"
										style={`width: ${students.length ? (item.count / students.length) * 100 : 0}%`}
									></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</SectionCard>

			<SectionCard
				title="Data Health"
				description="Local-only status before sync phase is connected"
			>
				<div class="space-y-3">
					<div
						class="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
					>
						<div>
							<p class="font-medium text-slate-900">Pending Local Changes</p>
							<p class="text-sm text-slate-500">Records waiting for sync</p>
						</div>
						<p class="text-2xl font-bold text-slate-900">{pendingChangesCount}</p>
					</div>

					<div
						class="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
					>
						<div>
							<p class="font-medium text-slate-900">Students Without Code</p>
							<p class="text-sm text-slate-500">Student code will be generated on backend sync</p>
						</div>
						<p class="text-2xl font-bold text-slate-900">{studentsWithoutCodeCount}</p>
					</div>
				</div>

				{#if clubs.length === 0 || beltRanks.length === 0}
					<div
						class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
					>
						{#if clubs.length === 0}
							Create at least one club before adding students.
						{:else}
							Create belt ranks before adding students.
						{/if}
					</div>
				{/if}
			</SectionCard>
		</div>
	</section>
</main>
