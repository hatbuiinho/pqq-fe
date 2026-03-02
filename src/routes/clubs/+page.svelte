<script lang="ts">
	import { onMount } from 'svelte';
	import { DataTableToolbar, EmptyState, IconActionButton, PageHeader, SectionCard, subscribeDataChanged } from '$lib';
	import type { Club } from '$lib/domain/models';
	import { clubUseCases } from '$lib/app/services';
	import { getApiBaseUrl } from '$lib/app/sync/sync-config';
	import { syncManager } from '$lib/app/sync/sync-manager';
	import { toastError, toastSuccess } from '$lib/app/toast';
	import { generateUniqueClubCode } from '$lib/domain/string-utils';
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

	type ClubFormErrors = Partial<Record<'name' | 'phone' | 'email', string>>;

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

	let clubs = $state<Club[]>([]);
	let form = $state<ClubForm>({ ...initialForm });
	let editingId = $state<string | null>(null);
	let isModalOpen = $state(false);
	let isImportModalOpen = $state(false);
	let isImportResultModalOpen = $state(false);
	let search = $state('');
	let currentPage = $state(1);
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let isImporting = $state(false);
	let errors = $state<ClubFormErrors>({});
	let importErrors = $state<ClubImportRowError[]>([]);
	let importSummary = $state<ClubImportResponse | null>(null);
	let importFile = $state<File | null>(null);
	let importFileName = $state('');
	let importFormError = $state('');
	const generatedCode = $derived.by(() =>
		generateUniqueClubCode(
			form.name,
			clubs.filter((club) => club.id !== editingId).map((club) => club.code ?? '')
		)
	);

	const filteredClubs = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return clubs;
		return clubs.filter((club) => club.name.toLowerCase().includes(q) || (club.code ?? '').toLowerCase().includes(q));
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
		search;
		currentPage = 1;
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
			clubs = await clubUseCases.list();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to load clubs.');
		} finally {
			isLoading = false;
		}
	}

	function resetForm() {
		form = { ...initialForm };
		errors = {};
		editingId = null;
	}

	function openCreateModal() {
		resetForm();
		isModalOpen = true;
	}

	function resetImportState() {
		importErrors = [];
		importSummary = null;
		importFile = null;
		importFileName = '';
		importFormError = '';
	}

	function openImportModal() {
		resetImportState();
		isImportModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		resetForm();
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
		errors = {};
		editingId = club.id;
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
				toastSuccess('Club updated.');
			} else {
				await clubUseCases.create({
					name: form.name,
					phone: form.phone,
					email: form.email,
					address: form.address,
					notes: form.notes,
					isActive: form.isActive
				});
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

	async function handleDelete(clubId: string) {
		try {
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
					tooltipText={{ text: 'Import clubs', placement: 'bottom' }}
				/>
				<IconActionButton
					icon="icon-[mdi--plus]"
					label="Add club"
					variant="primary"
					onclick={openCreateModal}
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
								<p class="text-sm text-slate-500">{club.code ?? 'No code'} • {club.phone ?? 'No phone'}</p>
								<p class="text-sm text-slate-600">{getClubStatusLabel(club)}</p>
							</div>
							<div class="inline-flex gap-2">
								{#if club.deletedAt}
									<IconActionButton
										icon="icon-[mdi--restore]"
										label={`Restore ${club.name}`}
										onclick={() => handleRestore(club.id)}
									/>
								{:else}
									<IconActionButton
										icon="icon-[mdi--pencil-outline]"
										label={`Edit ${club.name}`}
										onclick={() => startEdit(club)}
									/>
									<IconActionButton
										icon="icon-[mdi--delete-outline]"
										label={`Delete ${club.name}`}
										variant="danger"
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
								<td class="py-3 pr-3 text-slate-700">{getClubStatusLabel(club)}</td>
								<td class="py-3 pl-3 pr-0 text-right">
									<div class="inline-flex gap-2">
										{#if club.deletedAt}
											<IconActionButton
												icon="icon-[mdi--restore]"
												label={`Restore ${club.name}`}
												onclick={() => handleRestore(club.id)}
											/>
										{:else}
											<IconActionButton
												icon="icon-[mdi--pencil-outline]"
												label={`Edit ${club.name}`}
												onclick={() => startEdit(club)}
											/>
											<IconActionButton
												icon="icon-[mdi--delete-outline]"
												label={`Delete ${club.name}`}
												variant="danger"
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

			<DataPagination bind:currentPage totalItems={filteredClubs.length} pageSize={pageSize} />
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
				Code is generated automatically from the initials of the club name and adds a numeric suffix when needed.
			</span>
		</label>
		<label class="space-y-1">
			<span class="text-sm font-medium text-slate-700">Phone</span>
			<input class:border-red-300={!!errors.phone} class="w-full rounded-lg border-slate-300" bind:value={form.phone} />
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
			<textarea class="w-full rounded-lg border-slate-300" rows="3" bind:value={form.notes}></textarea>
		</label>
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
			<button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium" type="button" onclick={closeModal}>
				Cancel
			</button>
		</div>
	</form>
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
			<button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium" type="button" onclick={closeImportModal}>
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
					<span class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
						Imported {importSummary.importedCount}
					</span>
					<span class="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
						Errors {importSummary.errors.length}
					</span>
				</div>

				{#if importErrors.length > 0}
					<div class="mt-4 max-h-80 space-y-2 overflow-y-auto">
						{#each importErrors as importError (`${importError.row}:${importError.message}`)}
							<div class="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
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
