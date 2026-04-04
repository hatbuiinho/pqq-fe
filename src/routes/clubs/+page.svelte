<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { onMount } from 'svelte';
	import {
		DataTableToolbar,
		EmptyState,
		IconActionButton,
		PageHeader,
		SectionCard,
		subscribeDataChanged
	} from '$lib';
	import type { Club, ClubGroup, ClubSchedule, Weekday } from '$lib/domain/models';
	import { clubGroupUseCases, clubScheduleUseCases, clubUseCases } from '$lib/app/services';
	import { getApiBaseUrl } from '$lib/app/sync/sync-config';
	import {
		authSession,
		hasClubPermissionForSession,
		hasSystemPermissionForSession,
		withAuthHeaders
	} from '$lib/app/auth';
	import { syncManager } from '$lib/app/sync/sync-manager';
	import { toastError, toastSuccess } from '$lib/app/toast';
	import { generateUniqueClubCode, normalizeSearchText } from '$lib/domain/string-utils';
	import { formatWeekdayList, sortWeekdays, WEEKDAY_OPTIONS } from '$lib/domain/schedule-utils';
	import AppModal from '$lib/ui/components/AppModal.svelte';
	import DataPagination from '$lib/ui/components/DataPagination.svelte';

	type ClubForm = {
		name: string;
		phone: string;
		email: string;
		address: string;
		notes: string;
		isActive: boolean;
	};

	type ClubFormErrors = Partial<Record<'name' | 'phone' | 'email' | 'trainingDays', string>>;

	type ClubGroupForm = {
		name: string;
		description: string;
		isActive: boolean;
	};

	type ClubGroupFormErrors = Partial<Record<'name', string>>;

	type ClubImportRowError = {
		row: number;
		message: string;
	};

	type ClubImportResponse = {
		importedCount: number;
		errors: ClubImportRowError[];
	};

	const initialForm: ClubForm = {
		name: '',
		phone: '',
		email: '',
		address: '',
		notes: '',
		isActive: true
	};
	const isSystemAdmin = $derived.by(() =>
		hasSystemPermissionForSession($authSession, 'users:manage')
	);

	let clubs = $state<Club[]>([]);
	let clubGroups = $state<ClubGroup[]>([]);
	let clubSchedules = $state<ClubSchedule[]>([]);
	let form = $state<ClubForm>({ ...initialForm });
	let selectedTrainingDays = $state<Weekday[]>([]);
	let editingId = $state<string | null>(null);
	let isModalOpen = $state(false);
	let isImportModalOpen = $state(false);
	let isImportResultModalOpen = $state(false);
	let isGroupsModalOpen = $state(false);
	let search = $state('');
	let currentPage = $state(1);
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let isImporting = $state(false);
	let isGroupsSubmitting = $state(false);
	let errors = $state<ClubFormErrors>({});
	let groupErrors = $state<ClubGroupFormErrors>({});
	let importErrors = $state<ClubImportRowError[]>([]);
	let importSummary = $state<ClubImportResponse | null>(null);
	let importFile = $state<File | null>(null);
	let importFileName = $state('');
	let importFormError = $state('');
	let selectedClubForGroups = $state<Club | null>(null);
	let groupsForSelectedClub = $state<ClubGroup[]>([]);
	let groupForm = $state<ClubGroupForm>({
		name: '',
		description: '',
		isActive: true
	});
	let editingGroupId = $state<string | null>(null);
	const generatedCode = $derived.by(() =>
		generateUniqueClubCode(
			form.name,
			clubs.filter((club) => club.id !== editingId).map((club) => club.code ?? '')
		)
	);
	const groupCountByClubId = $derived.by(() => {
		const counts = new SvelteMap<string, number>();
		for (const group of clubGroups) {
			if (group.deletedAt) continue;
			counts.set(group.clubId, (counts.get(group.clubId) ?? 0) + 1);
		}
		return counts;
	});
	const scheduleByClubId = $derived.by(() => {
		const map = new SvelteMap<string, Weekday[]>();
		for (const schedule of clubSchedules) {
			if (schedule.deletedAt || !schedule.isActive) continue;
			const existing = map.get(schedule.clubId) ?? [];
			existing.push(schedule.weekday);
			map.set(schedule.clubId, existing);
		}
		for (const [clubId, weekdays] of map) {
			map.set(clubId, sortWeekdays(weekdays));
		}
		return map;
	});

	const filteredClubs = $derived.by(() => {
		const q = normalizeSearchText(search);
		if (!q) return clubs;
		return clubs.filter((club) =>
			[club.name, club.code ?? '', club.phone ?? '', club.email ?? ''].some((value) =>
				normalizeSearchText(value).includes(q)
			)
		);
	});

	function getClubStatusLabel(club: Club): string {
		if (club.deletedAt) {
			return club.syncStatus === 'failed' ? 'Delete failed' : 'Pending delete';
		}
		if (club.syncStatus !== 'synced') {
			return club.syncStatus === 'failed' ? 'Sync failed' : 'Waiting for sync';
		}
		return club.isActive ? 'Active' : 'Inactive';
	}

	const pageSize = 10;
	const paginatedClubs = $derived.by(() => {
		const start = (currentPage - 1) * pageSize;
		return filteredClubs.slice(start, start + pageSize);
	});

	$effect(() => {
		const resetKey = search;
		if (resetKey !== undefined) {
			currentPage = 1;
		}
	});

	$effect(() => {
		const totalPages = Math.max(1, Math.ceil(filteredClubs.length / pageSize));
		if (currentPage > totalPages) currentPage = totalPages;
	});

	onMount(() => {
		void loadClubs();

		return subscribeDataChanged(() => {
			void loadClubs();
		});
	});

	async function loadClubs() {
		try {
			isLoading = true;
			const [clubRows, clubGroupRows] = await Promise.all([
				clubUseCases.list(),
				clubGroupUseCases.list()
			]);
			const clubScheduleRows = (
				await Promise.all(clubRows.map((club) => clubScheduleUseCases.listByClub(club.id)))
			).flat();
			clubs = clubRows;
			clubGroups = clubGroupRows;
			clubSchedules = clubScheduleRows;
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to load clubs.');
		} finally {
			isLoading = false;
		}
	}

	function resetForm() {
		form = { ...initialForm };
		selectedTrainingDays = [];
		errors = {};
		editingId = null;
	}

	function openCreateModal() {
		if (!isSystemAdmin) {
			toastError('Chỉ quản trị hệ thống mới có thể tạo CLB.');
			return;
		}
		resetForm();
		isModalOpen = true;
	}

	function canManageClub(clubId: string): boolean {
		return hasClubPermissionForSession($authSession, 'club:manage', { clubId });
	}

	function canManageClubGroups(clubId: string): boolean {
		return hasClubPermissionForSession($authSession, 'club_groups:write', { clubId });
	}

	function resetGroupForm() {
		groupForm = {
			name: '',
			description: '',
			isActive: true
		};
		groupErrors = {};
		editingGroupId = null;
	}

	function resetImportState() {
		importErrors = [];
		importSummary = null;
		importFile = null;
		importFileName = '';
		importFormError = '';
	}

	function openImportModal() {
		if (!isSystemAdmin) {
			toastError('Chỉ quản trị hệ thống mới có thể import CLB.');
			return;
		}
		resetImportState();
		isImportModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		resetForm();
	}

	function closeGroupsModal() {
		isGroupsModalOpen = false;
		selectedClubForGroups = null;
		groupsForSelectedClub = [];
		resetGroupForm();
	}

	function closeImportModal() {
		isImportModalOpen = false;
		importFile = null;
		importFileName = '';
		importFormError = '';
	}

	function closeImportResultModal() {
		isImportResultModalOpen = false;
		resetImportState();
	}

	function startEdit(club: Club) {
		if (club.deletedAt) return;
		if (!canManageClub(club.id)) {
			toastError('Bạn không có quyền cập nhật CLB này.');
			return;
		}
		errors = {};
		editingId = club.id;
		selectedTrainingDays = scheduleByClubId.get(club.id) ?? [];
		form = {
			name: club.name,
			phone: club.phone ?? '',
			email: club.email ?? '',
			address: club.address ?? '',
			notes: club.notes ?? '',
			isActive: club.isActive
		};
		isModalOpen = true;
	}

	async function openGroupsModal(club: Club) {
		if (!canManageClubGroups(club.id)) {
			toastError('Bạn không có quyền quản lý nhóm của CLB này.');
			return;
		}
		selectedClubForGroups = club;
		resetGroupForm();
		await loadGroupsForClub(club.id);
		isGroupsModalOpen = true;
	}

	async function loadGroupsForClub(clubId: string) {
		groupsForSelectedClub = await clubGroupUseCases.listByClub(clubId);
	}

	function startEditGroup(group: ClubGroup) {
		if (group.deletedAt) return;
		editingGroupId = group.id;
		groupErrors = {};
		groupForm = {
			name: group.name,
			description: group.description ?? '',
			isActive: group.isActive
		};
	}

	function getGroupStatusLabel(group: ClubGroup): string {
		if (group.deletedAt) {
			return group.syncStatus === 'failed' ? 'Delete failed' : 'Pending delete';
		}
		if (group.syncStatus !== 'synced') {
			return group.syncStatus === 'failed'
				? (group.syncError ?? 'Sync failed')
				: 'Waiting for sync';
		}
		return group.isActive ? 'Active' : 'Inactive';
	}

	function validateGroupForm(): boolean {
		const nextErrors: ClubGroupFormErrors = {};
		if (!groupForm.name.trim()) {
			nextErrors.name = 'Group name is required.';
		}
		groupErrors = nextErrors;
		return Object.keys(nextErrors).length === 0;
	}

	function validateForm(): boolean {
		const nextErrors: ClubFormErrors = {};
		const normalizedName = form.name.trim();
		const normalizedPhone = form.phone.trim();
		const normalizedEmail = form.email.trim();

		if (!normalizedName) {
			nextErrors.name = 'Club name is required.';
		}

		if (normalizedPhone && !/^[0-9+\-\s()]{8,20}$/.test(normalizedPhone)) {
			nextErrors.phone = 'Phone number format is invalid.';
		}

		if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
			nextErrors.email = 'Email format is invalid.';
		}

		if (selectedTrainingDays.length === 0) {
			nextErrors.trainingDays = 'Select at least one training day.';
		}

		errors = nextErrors;
		return Object.keys(nextErrors).length === 0;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!validateForm()) return;

		try {
			isSubmitting = true;
			if (editingId) {
				await clubUseCases.update(editingId, {
					name: form.name,
					phone: form.phone,
					email: form.email,
					address: form.address,
					notes: form.notes,
					isActive: form.isActive
				});
				await clubScheduleUseCases.saveWeekdays(editingId, selectedTrainingDays);
				toastSuccess('Club updated.');
			} else {
				const createdId = await clubUseCases.create({
					name: form.name,
					phone: form.phone,
					email: form.email,
					address: form.address,
					notes: form.notes,
					isActive: form.isActive
				});
				await clubScheduleUseCases.saveWeekdays(createdId, selectedTrainingDays);
				toastSuccess('Club created.');
			}

			resetForm();
			isModalOpen = false;
			await loadClubs();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to save club.');
		} finally {
			isSubmitting = false;
		}
	}

	function toggleTrainingDay(weekday: Weekday) {
		if (selectedTrainingDays.includes(weekday)) {
			selectedTrainingDays = selectedTrainingDays.filter((value) => value !== weekday);
			return;
		}

		selectedTrainingDays = sortWeekdays([...selectedTrainingDays, weekday]);
	}

	async function handleDelete(clubId: string) {
		try {
			if (!canManageClub(clubId)) {
				throw new Error('Bạn không có quyền xóa CLB này.');
			}
			await clubUseCases.softDelete(clubId);
			toastSuccess('Club deleted.');
			if (editingId === clubId) resetForm();
			await loadClubs();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to delete club.');
		}
	}

	async function handleRestore(clubId: string) {
		try {
			if (!canManageClub(clubId)) {
				throw new Error('Bạn không có quyền khôi phục CLB này.');
			}
			await clubUseCases.restore(clubId);
			toastSuccess('Club restored locally.');
			await loadClubs();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to restore club.');
		}
	}

	function handleImportFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const nextFile = input.files?.[0] ?? null;
		importFile = nextFile;
		importFileName = nextFile?.name ?? '';
		importFormError = '';
	}

	async function handleImportSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!importFile) {
			importFormError = 'Please select an Excel file to import.';
			return;
		}

		try {
			isImporting = true;
			importFormError = '';

			const formData = new FormData();
			formData.append('file', importFile);

				const response = await fetch(`${getApiBaseUrl()}/api/v1/clubs/import`, {
					method: 'POST',
					headers: withAuthHeaders(),
					body: formData
				});

			const payload = (await response.json()) as ClubImportResponse | { error?: string };
			if (!response.ok) {
				throw new Error('error' in payload ? payload.error || 'Import failed.' : 'Import failed.');
			}

			importSummary = payload as ClubImportResponse;
			importErrors = importSummary.errors;

			await syncManager.syncNow();
			await loadClubs();
			closeImportModal();
			isImportResultModalOpen = true;

			if (importSummary.importedCount > 0) {
				toastSuccess(`Imported ${importSummary.importedCount} club(s).`);
			}

			if (importSummary.errors.length > 0) {
				toastError(`${importSummary.errors.length} row(s) failed during import.`);
			}

			if (importSummary.importedCount === 0 && importSummary.errors.length === 0) {
				toastSuccess('Import completed with no changes.');
			}
		} catch (error) {
			importFormError = error instanceof Error ? error.message : 'Failed to import clubs.';
			toastError(importFormError);
		} finally {
			isImporting = false;
		}
	}

	async function handleGroupSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!selectedClubForGroups) return;
		if (!canManageClubGroups(selectedClubForGroups.id)) {
			toastError('Bạn không có quyền cập nhật nhóm của CLB này.');
			return;
		}
		if (!validateGroupForm()) return;

		try {
			isGroupsSubmitting = true;
			if (editingGroupId) {
				await clubGroupUseCases.update(editingGroupId, {
					name: groupForm.name,
					description: groupForm.description,
					isActive: groupForm.isActive
				});
				toastSuccess('Group updated.');
			} else {
				await clubGroupUseCases.create({
					clubId: selectedClubForGroups.id,
					name: groupForm.name,
					description: groupForm.description,
					isActive: groupForm.isActive
				});
				toastSuccess('Group created.');
			}

			await loadClubs();
			await loadGroupsForClub(selectedClubForGroups.id);
			resetGroupForm();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to save group.');
		} finally {
			isGroupsSubmitting = false;
		}
	}

	async function handleDeleteGroup(groupId: string) {
		if (!selectedClubForGroups) return;

		try {
			if (!canManageClubGroups(selectedClubForGroups.id)) {
				throw new Error('Bạn không có quyền xóa nhóm của CLB này.');
			}
			await clubGroupUseCases.softDelete(groupId);
			toastSuccess('Group deleted.');
			if (editingGroupId === groupId) resetGroupForm();
			await loadClubs();
			await loadGroupsForClub(selectedClubForGroups.id);
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to delete group.');
		}
	}

	async function handleRestoreGroup(groupId: string) {
		if (!selectedClubForGroups) return;

		try {
			if (!canManageClubGroups(selectedClubForGroups.id)) {
				throw new Error('Bạn không có quyền khôi phục nhóm của CLB này.');
			}
			await clubGroupUseCases.restore(groupId);
			toastSuccess('Group restored.');
			await loadClubs();
			await loadGroupsForClub(selectedClubForGroups.id);
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to restore group.');
		}
	}
</script>

<main class="mx-auto max-w-5xl space-y-8 px-4 py-8">
	<PageHeader
		eyebrow="Management"
		title="Clubs"
		description="Manage clubs locally with offline-first storage."
	/>

	<SectionCard title="Club list">
		<DataTableToolbar bind:searchValue={search} searchPlaceholder="Search by name or code">
			{#snippet actions()}
				<IconActionButton
					icon="icon-[mdi--file-import-outline]"
					label="Import clubs"
					onclick={openImportModal}
					disabled={!isSystemAdmin}
					tooltipText={{ text: 'Import clubs', placement: 'bottom' }}
				/>
				<IconActionButton
					icon="icon-[mdi--plus]"
					label="Add club"
					variant="primary"
					onclick={openCreateModal}
					disabled={!isSystemAdmin}
					tooltipText={{ text: 'Add club', placement: 'bottom' }}
				/>
			{/snippet}
		</DataTableToolbar>

		{#if isLoading}
			<p class="text-sm text-slate-500">Loading clubs...</p>
		{:else if filteredClubs.length === 0}
			<EmptyState title="No clubs found" description="Create a club to start assigning students." />
		{:else}
			<div class="space-y-3 md:hidden">
				{#each paginatedClubs as club (club.id)}
					<article class="rounded-xl border border-slate-200 bg-slate-50 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="space-y-1">
								<h3 class="font-semibold text-slate-900">{club.name}</h3>
								<p class="text-sm text-slate-500">
									{club.code ?? 'No code'} • {club.phone ?? 'No phone'}
								</p>
								<p class="text-sm text-slate-500">
									{formatWeekdayList(scheduleByClubId.get(club.id) ?? []) || 'No training days'}
								</p>
								<p class="text-sm text-slate-500">
									{groupCountByClubId.get(club.id) ?? 0} group(s)
								</p>
								<p class="text-sm text-slate-600">{getClubStatusLabel(club)}</p>
							</div>
							<div class="inline-flex gap-2">
								{#if club.deletedAt}
									<IconActionButton
										icon="icon-[mdi--restore]"
										label={`Restore ${club.name}`}
										disabled={!canManageClub(club.id)}
										onclick={() => handleRestore(club.id)}
									/>
								{:else}
									<IconActionButton
										icon="icon-[mdi--account-multiple-outline]"
										label={`Manage groups for ${club.name}`}
										disabled={!canManageClubGroups(club.id)}
										onclick={() => openGroupsModal(club)}
									/>
									<IconActionButton
										icon="icon-[mdi--pencil-outline]"
										label={`Edit ${club.name}`}
										disabled={!canManageClub(club.id)}
										onclick={() => startEdit(club)}
									/>
									<IconActionButton
										icon="icon-[mdi--delete-outline]"
										label={`Delete ${club.name}`}
										variant="danger"
										disabled={!canManageClub(club.id)}
										onclick={() => handleDelete(club.id)}
									/>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			</div>

			<div class="hidden overflow-x-auto md:block">
				<table class="min-w-full border-collapse text-sm">
					<thead>
						<tr class="border-b border-slate-200 text-left text-slate-600">
							<th class="py-2 pr-3">Name</th>
							<th class="py-2 pr-3">Code</th>
							<th class="py-2 pr-3">Phone</th>
							<th class="py-2 pr-3">Training days</th>
							<th class="py-2 pr-3">Groups</th>
							<th class="py-2 pr-3">Status</th>
							<th class="py-2 pr-0 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each paginatedClubs as club (club.id)}
							<tr class="border-b border-slate-100">
								<td class="py-3 pr-3 font-medium text-slate-900">{club.name}</td>
								<td class="py-3 pr-3 text-slate-700">{club.code ?? '-'}</td>
								<td class="py-3 pr-3 text-slate-700">{club.phone ?? '-'}</td>
								<td class="py-3 pr-3 text-slate-700"
									>{formatWeekdayList(scheduleByClubId.get(club.id) ?? []) || '-'}</td
								>
								<td class="py-3 pr-3 text-slate-700">{groupCountByClubId.get(club.id) ?? 0}</td>
								<td class="py-3 pr-3 text-slate-700">{getClubStatusLabel(club)}</td>
								<td class="py-3 pr-0 pl-3 text-right">
									<div class="inline-flex gap-2">
										{#if club.deletedAt}
											<IconActionButton
												icon="icon-[mdi--restore]"
												label={`Restore ${club.name}`}
												disabled={!canManageClub(club.id)}
												onclick={() => handleRestore(club.id)}
											/>
										{:else}
											<IconActionButton
												icon="icon-[mdi--account-multiple-outline]"
												label={`Manage groups for ${club.name}`}
												disabled={!canManageClubGroups(club.id)}
												onclick={() => openGroupsModal(club)}
											/>
											<IconActionButton
												icon="icon-[mdi--pencil-outline]"
												label={`Edit ${club.name}`}
												disabled={!canManageClub(club.id)}
												onclick={() => startEdit(club)}
											/>
											<IconActionButton
												icon="icon-[mdi--delete-outline]"
												label={`Delete ${club.name}`}
												variant="danger"
												disabled={!canManageClub(club.id)}
												onclick={() => handleDelete(club.id)}
											/>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<DataPagination bind:currentPage totalItems={filteredClubs.length} {pageSize} />
		{/if}
	</SectionCard>
</main>

<AppModal open={isModalOpen} title={editingId ? 'Edit club' : 'Create club'} onClose={closeModal}>
	<form class="grid gap-4 md:grid-cols-2" onsubmit={handleSubmit}>
		<label class="space-y-1">
			<span class="text-sm font-medium text-slate-700">Name *</span>
			<input
				class:border-red-300={!!errors.name}
				class="w-full rounded-lg border-slate-300"
				bind:value={form.name}
				required
			/>
			{#if errors.name}
				<span class="block text-xs text-red-600">{errors.name}</span>
			{/if}
		</label>
		<label class="space-y-1">
			<span class="text-sm font-medium text-slate-700">Code</span>
			<input
				class="w-full rounded-lg border-slate-300 bg-slate-100 text-slate-500"
				value={generatedCode}
				readonly
				disabled
			/>
			<span class="block text-xs text-slate-500">
				Code is generated automatically from the initials of the club name and adds a numeric suffix
				when needed.
			</span>
		</label>
		<label class="space-y-1">
			<span class="text-sm font-medium text-slate-700">Phone</span>
			<input
				class:border-red-300={!!errors.phone}
				class="w-full rounded-lg border-slate-300"
				bind:value={form.phone}
			/>
			{#if errors.phone}
				<span class="block text-xs text-red-600">{errors.phone}</span>
			{/if}
		</label>
		<label class="space-y-1">
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
		<label class="space-y-1 md:col-span-2">
			<span class="text-sm font-medium text-slate-700">Address</span>
			<input class="w-full rounded-lg border-slate-300" bind:value={form.address} />
		</label>
		<label class="space-y-1 md:col-span-2">
			<span class="text-sm font-medium text-slate-700">Notes</span>
			<textarea class="w-full rounded-lg border-slate-300" rows="3" bind:value={form.notes}
			></textarea>
		</label>
		<div class="space-y-2 md:col-span-2">
			<span class="text-sm font-medium text-slate-700">Training days *</span>
			<div class="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
				{#each WEEKDAY_OPTIONS as option (option.value)}
					<button
						type="button"
						class={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
							selectedTrainingDays.includes(option.value)
								? 'border-slate-900 bg-slate-900 text-white'
								: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
						}`}
						onclick={() => toggleTrainingDay(option.value)}
					>
						{option.shortLabel}
					</button>
				{/each}
			</div>
			{#if errors.trainingDays}
				<span class="block text-xs text-red-600">{errors.trainingDays}</span>
			{/if}
			<p class="text-xs text-slate-500">
				These training days are the default schedule for students who inherit the club schedule.
			</p>
		</div>
		<label class="inline-flex items-center gap-2 md:col-span-2">
			<input type="checkbox" bind:checked={form.isActive} />
			<span class="text-sm text-slate-700">Active</span>
		</label>
		<div class="flex gap-3 md:col-span-2">
			<button
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
				type="submit"
				disabled={isSubmitting}
			>
				{isSubmitting ? 'Saving...' : editingId ? 'Update club' : 'Create club'}
			</button>
			<button
				class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
				type="button"
				onclick={closeModal}
			>
				Cancel
			</button>
		</div>
	</form>
</AppModal>

<AppModal
	open={isGroupsModalOpen}
	title={selectedClubForGroups ? `Manage groups • ${selectedClubForGroups.name}` : 'Manage groups'}
	description="Create and maintain groups directly inside the selected club."
	size="lg"
	onClose={closeGroupsModal}
>
	<div class="space-y-6">
		<form class="grid gap-4 md:grid-cols-2" onsubmit={handleGroupSubmit}>
			<label class="space-y-1">
				<span class="text-sm font-medium text-slate-700">Group name *</span>
				<input
					class:border-red-300={!!groupErrors.name}
					class="w-full rounded-lg border-slate-300"
					bind:value={groupForm.name}
					required
				/>
				{#if groupErrors.name}
					<span class="block text-xs text-red-600">{groupErrors.name}</span>
				{/if}
			</label>
			<label class="inline-flex items-center gap-2">
				<input type="checkbox" bind:checked={groupForm.isActive} />
				<span class="text-sm text-slate-700">Active group</span>
			</label>
			<label class="space-y-1 md:col-span-2">
				<span class="text-sm font-medium text-slate-700">Description</span>
				<textarea
					class="w-full rounded-lg border-slate-300"
					rows="3"
					bind:value={groupForm.description}
				></textarea>
			</label>
			<div class="flex gap-3 md:col-span-2">
				<button
					class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
					type="submit"
					disabled={isGroupsSubmitting}
				>
					{isGroupsSubmitting ? 'Saving...' : editingGroupId ? 'Update group' : 'Create group'}
				</button>
				<button
					class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
					type="button"
					onclick={resetGroupForm}
				>
					Reset
				</button>
			</div>
		</form>

		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-sm font-semibold text-slate-900">Groups in this club</h3>
				<p class="text-xs text-slate-500">
					{groupsForSelectedClub.filter((group) => !group.deletedAt).length} active group(s)
				</p>
			</div>

			{#if groupsForSelectedClub.length === 0}
				<EmptyState
					title="No groups yet"
					description="Create the first group for this club right here."
				/>
			{:else}
				<div class="space-y-3">
					{#each groupsForSelectedClub as group (group.id)}
						<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
							<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div class="space-y-1">
									<p class="font-semibold text-slate-900">{group.name}</p>
									<p class="text-sm text-slate-600">{group.description || 'No description'}</p>
									<p class="text-sm text-slate-500">{getGroupStatusLabel(group)}</p>
								</div>
								<div class="inline-flex gap-2">
									{#if group.deletedAt}
										<IconActionButton
											icon="icon-[mdi--restore]"
											label={`Restore ${group.name}`}
											disabled={!selectedClubForGroups || !canManageClubGroups(selectedClubForGroups.id)}
											onclick={() => handleRestoreGroup(group.id)}
										/>
									{:else}
										<IconActionButton
											icon="icon-[mdi--pencil-outline]"
											label={`Edit ${group.name}`}
											disabled={!selectedClubForGroups || !canManageClubGroups(selectedClubForGroups.id)}
											onclick={() => startEditGroup(group)}
										/>
										<IconActionButton
											icon="icon-[mdi--delete-outline]"
											label={`Delete ${group.name}`}
											variant="danger"
											disabled={!selectedClubForGroups || !canManageClubGroups(selectedClubForGroups.id)}
											onclick={() => handleDeleteGroup(group.id)}
										/>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</AppModal>

<AppModal
	open={isImportModalOpen}
	title="Import clubs"
	description="Upload an Excel file. Required column: name. Optional columns: phone, email, address, notes, isActive."
	size="lg"
	onClose={closeImportModal}
>
	<form class="space-y-4" onsubmit={handleImportSubmit}>
		<label class="block space-y-2">
			<span class="text-sm font-medium text-slate-700">Excel file</span>
			<input
				class:border-red-300={!!importFormError}
				class="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
				type="file"
				accept=".xlsx,.xls"
				onchange={handleImportFileChange}
			/>
			{#if importFileName}
				<p class="text-xs text-slate-500">Selected file: {importFileName}</p>
			{/if}
			{#if importFormError}
				<p class="text-xs text-red-600">{importFormError}</p>
			{/if}
		</label>

		<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
			<p class="font-medium text-slate-800">Expected columns</p>
			<p class="mt-1">`name`, `phone`, `email`, `address`, `notes`, `isActive`</p>
		</div>

		<div class="flex gap-3">
			<button
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
				type="submit"
				disabled={isImporting}
			>
				{isImporting ? 'Importing...' : 'Import'}
			</button>
			<button
				class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
				type="button"
				onclick={closeImportModal}
			>
				Cancel
			</button>
		</div>
	</form>
</AppModal>

<AppModal
	open={isImportResultModalOpen}
	title="Import result"
	description="Review imported rows and any row-level errors returned by the server."
	size="lg"
	onClose={closeImportResultModal}
>
	{#if importSummary}
		<div class="space-y-4">
			<div class="rounded-xl border border-slate-200 bg-white px-4 py-4">
				<div class="flex flex-wrap items-center gap-3">
					<span
						class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
					>
						Imported {importSummary.importedCount}
					</span>
					<span
						class="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
					>
						Errors {importSummary.errors.length}
					</span>
				</div>

				{#if importErrors.length > 0}
					<div class="mt-4 max-h-80 space-y-2 overflow-y-auto">
						{#each importErrors as importError (`${importError.row}:${importError.message}`)}
							<div
								class="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700"
							>
								<p class="font-semibold">Row {importError.row}</p>
								<p class="mt-1">{importError.message}</p>
							</div>
						{/each}
					</div>
				{:else}
					<p class="mt-4 text-sm text-slate-600">All rows were imported successfully.</p>
				{/if}
			</div>

			<div class="flex gap-3">
				<button
					class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
					type="button"
					onclick={closeImportResultModal}
				>
					Close
				</button>
			</div>
		</div>
	{/if}
</AppModal>
