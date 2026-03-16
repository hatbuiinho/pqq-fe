<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DataTableToolbar,
		EmptyState,
		IconActionButton,
		PageHeader,
		SectionCard,
		subscribeDataChanged
	} from '$lib';
	import type { BeltRank } from '$lib/domain/models';
	import { beltRankUseCases } from '$lib/app/services';
	import { getApiBaseUrl } from '$lib/app/sync/sync-config';
	import { syncManager } from '$lib/app/sync/sync-manager';
	import { toastError, toastSuccess } from '$lib/app/toast';
	import { generateBeltRankId, normalizeSearchText } from '$lib/domain/string-utils';
	import AppModal from '$lib/ui/components/AppModal.svelte';
	import DataPagination from '$lib/ui/components/DataPagination.svelte';

	type BeltRankForm = {
		name: string;
		order: number;
		description: string;
		isActive: boolean;
	};

	type BeltRankFormErrors = Partial<Record<'name' | 'order', string>>;

	type BeltRankImportRowError = {
		row: number;
		message: string;
	};

	type BeltRankImportResponse = {
		importedCount: number;
		errors: BeltRankImportRowError[];
	};

	const initialForm: BeltRankForm = {
		name: '',
		order: 1,
		description: '',
		isActive: true
	};

	let beltRanks = $state<BeltRank[]>([]);
	let form = $state<BeltRankForm>({ ...initialForm });
	let editingId = $state<string | null>(null);
	let isModalOpen = $state(false);
	let isImportModalOpen = $state(false);
	let isImportResultModalOpen = $state(false);
	let search = $state('');
	let currentPage = $state(1);
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let isImporting = $state(false);
	let errors = $state<BeltRankFormErrors>({});
	let importErrors = $state<BeltRankImportRowError[]>([]);
	let importSummary = $state<BeltRankImportResponse | null>(null);
	let importFile = $state<File | null>(null);
	let importFileName = $state('');
	let importFormError = $state('');

	const filteredBeltRanks = $derived.by(() => {
		const q = normalizeSearchText(search);
		if (!q) return beltRanks;
		return beltRanks.filter(
			(beltRank) =>
				normalizeSearchText(beltRank.name).includes(q) ||
				normalizeSearchText(String(beltRank.order)).includes(q) ||
				normalizeSearchText(beltRank.description ?? '').includes(q)
		);
	});

	function getBeltRankStatusLabel(beltRank: BeltRank): string {
		if (beltRank.deletedAt) {
			return beltRank.syncStatus === 'failed'
				? (beltRank.syncError ?? 'Delete failed')
				: 'Pending delete';
		}
		if (beltRank.syncStatus !== 'synced') {
			return beltRank.syncStatus === 'failed'
				? (beltRank.syncError ?? 'Sync failed')
				: 'Waiting for sync';
		}
		return beltRank.isActive ? 'Active' : 'Inactive';
	}

	const pageSize = 10;
	const paginatedBeltRanks = $derived.by(() => {
		const start = (currentPage - 1) * pageSize;
		return filteredBeltRanks.slice(start, start + pageSize);
	});

	$effect(() => {
		search;
		currentPage = 1;
	});

	$effect(() => {
		const totalPages = Math.max(1, Math.ceil(filteredBeltRanks.length / pageSize));
		if (currentPage > totalPages) currentPage = totalPages;
	});

	onMount(() => {
		void loadBeltRanks();

		return subscribeDataChanged(() => {
			void loadBeltRanks();
		});
	});

	async function loadBeltRanks() {
		try {
			isLoading = true;
			beltRanks = await beltRankUseCases.list();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to load belt ranks.');
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

	function startEdit(beltRank: BeltRank) {
		if (beltRank.deletedAt) return;
		errors = {};
		editingId = beltRank.id;
		form = {
			name: beltRank.name,
			order: beltRank.order,
			description: beltRank.description ?? '',
			isActive: beltRank.isActive
		};
		isModalOpen = true;
	}

	function validateForm(): boolean {
		const nextErrors: BeltRankFormErrors = {};
		const normalizedName = form.name.trim();
		const nextOrder = Number(form.order);

		if (!normalizedName) {
			nextErrors.name = 'Belt rank name is required.';
		} else {
			const generatedID = generateBeltRankId(normalizedName);
			const duplicatedName = beltRanks.find(
				(beltRank) => beltRank.id === generatedID && beltRank.id !== editingId
			);
			if (duplicatedName) {
				nextErrors.name = 'Belt rank name already exists.';
			}
		}

		if (!Number.isInteger(nextOrder) || nextOrder < 1) {
			nextErrors.order = 'Order must be an integer greater than or equal to 1.';
		} else {
			const duplicatedOrder = beltRanks.find(
				(beltRank) =>
					!beltRank.deletedAt && beltRank.order === nextOrder && beltRank.id !== editingId
			);
			if (duplicatedOrder) {
				nextErrors.order = 'Belt rank order already exists.';
			}
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
				await beltRankUseCases.update(editingId, {
					name: form.name,
					order: form.order,
					description: form.description,
					isActive: form.isActive
				});
				toastSuccess('Belt rank updated.');
			} else {
				await beltRankUseCases.create({
					name: form.name,
					order: form.order,
					description: form.description,
					isActive: form.isActive
				});
				toastSuccess('Belt rank created.');
			}

			resetForm();
			isModalOpen = false;
			await loadBeltRanks();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to save belt rank.';
			toastError(message);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete(beltRankId: string) {
		try {
			await beltRankUseCases.softDelete(beltRankId);
			toastSuccess('Belt rank deleted.');
			if (editingId === beltRankId) resetForm();
			await loadBeltRanks();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete belt rank.';
			toastError(message);
		}
	}

	async function handleRestore(beltRankId: string) {
		try {
			await beltRankUseCases.restore(beltRankId);
			toastSuccess('Belt rank restored locally.');
			await loadBeltRanks();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to restore belt rank.';
			toastError(message);
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

			const response = await fetch(`${getApiBaseUrl()}/api/v1/belt-ranks/import`, {
				method: 'POST',
				body: formData
			});

			const payload = (await response.json()) as BeltRankImportResponse | { error?: string };
			if (!response.ok) {
				throw new Error('error' in payload ? payload.error || 'Import failed.' : 'Import failed.');
			}

			importSummary = payload as BeltRankImportResponse;
			importErrors = importSummary.errors;

			await syncManager.syncNow();
			await loadBeltRanks();
			closeImportModal();
			isImportResultModalOpen = true;

			if (importSummary.importedCount > 0) {
				toastSuccess(`Imported ${importSummary.importedCount} belt rank(s).`);
			}

			if (importSummary.errors.length > 0) {
				toastError(`${importSummary.errors.length} row(s) failed during import.`);
			}

			if (importSummary.importedCount === 0 && importSummary.errors.length === 0) {
				toastSuccess('Import completed with no changes.');
			}
		} catch (error) {
			importFormError = error instanceof Error ? error.message : 'Failed to import belt ranks.';
			toastError(importFormError);
		} finally {
			isImporting = false;
		}
	}
</script>

<main class="mx-auto max-w-5xl space-y-8 px-4 py-8">
	<PageHeader
		eyebrow="Management"
		title="Belt Ranks"
		description="Manage belt rank levels and rank order locally."
	/>

	<SectionCard title="Belt rank list">
		<DataTableToolbar bind:searchValue={search} searchPlaceholder="Search by name or order">
			{#snippet actions()}
				<IconActionButton
					icon="icon-[mdi--file-import-outline]"
					label="Import belt ranks"
					onclick={openImportModal}
					tooltipText={{ text: 'Import belt ranks', placement: 'bottom' }}
				/>
				<IconActionButton
					icon="icon-[mdi--plus]"
					label="Add belt rank"
					variant="primary"
					onclick={openCreateModal}
					tooltipText={{ text: 'Add belt rank', placement: 'bottom' }}
				/>
			{/snippet}
		</DataTableToolbar>

		{#if isLoading}
			<p class="text-sm text-slate-500">Loading belt ranks...</p>
		{:else if filteredBeltRanks.length === 0}
			<EmptyState
				title="No belt ranks found"
				description="Create belt rank levels before assigning students."
			/>
		{:else}
			<div class="space-y-3 md:hidden">
				{#each paginatedBeltRanks as beltRank (beltRank.id)}
					<article class="rounded-xl border border-slate-200 bg-slate-50 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="space-y-1">
								<h3 class="font-semibold text-slate-900">{beltRank.name}</h3>
								<p class="text-sm text-slate-500">Order {beltRank.order}</p>
								<p class="text-sm text-slate-600">{beltRank.description ?? 'No description'}</p>
								<p
									class:text-red-700={beltRank.syncStatus === 'failed'}
									class="text-sm text-slate-600"
								>
									{getBeltRankStatusLabel(beltRank)}
								</p>
							</div>
							<div class="inline-flex gap-2">
								{#if beltRank.deletedAt}
									<IconActionButton
										icon="icon-[mdi--restore]"
										label={`Restore ${beltRank.name}`}
										onclick={() => handleRestore(beltRank.id)}
									/>
								{:else}
									<IconActionButton
										icon="icon-[mdi--pencil-outline]"
										label={`Edit ${beltRank.name}`}
										onclick={() => startEdit(beltRank)}
									/>
									<IconActionButton
										icon="icon-[mdi--delete-outline]"
										label={`Delete ${beltRank.name}`}
										variant="danger"
										onclick={() => handleDelete(beltRank.id)}
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
							<th class="py-2 pr-3">Order</th>
							<th class="py-2 pr-3">Name</th>
							<th class="py-2 pr-3">Status</th>
							<th class="py-2 pr-3">Description</th>
							<th class="py-2 pr-0 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each paginatedBeltRanks as beltRank (beltRank.id)}
							<tr class="border-b border-slate-100">
								<td class="py-3 pr-3 text-slate-900">{beltRank.order}</td>
								<td class="py-3 pr-3 font-medium text-slate-900">{beltRank.name}</td>
								<td
									class:text-red-700={beltRank.syncStatus === 'failed'}
									class="py-3 pr-3 text-slate-700"
								>
									{getBeltRankStatusLabel(beltRank)}
								</td>
								<td class="py-3 pr-3 text-slate-700">{beltRank.description ?? '-'}</td>
								<td class="py-3 pr-0 pl-3 text-right">
									<div class="inline-flex gap-2">
										{#if beltRank.deletedAt}
											<IconActionButton
												icon="icon-[mdi--restore]"
												label={`Restore ${beltRank.name}`}
												onclick={() => handleRestore(beltRank.id)}
											/>
										{:else}
											<IconActionButton
												icon="icon-[mdi--pencil-outline]"
												label={`Edit ${beltRank.name}`}
												onclick={() => startEdit(beltRank)}
											/>
											<IconActionButton
												icon="icon-[mdi--delete-outline]"
												label={`Delete ${beltRank.name}`}
												variant="danger"
												onclick={() => handleDelete(beltRank.id)}
											/>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<DataPagination bind:currentPage totalItems={filteredBeltRanks.length} {pageSize} />
		{/if}
	</SectionCard>
</main>

<AppModal
	open={isModalOpen}
	title={editingId ? 'Edit belt rank' : 'Create belt rank'}
	onClose={closeModal}
>
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
			<span class="text-sm font-medium text-slate-700">Order *</span>
			<input
				class:border-red-300={!!errors.order}
				class="w-full rounded-lg border-slate-300"
				type="number"
				min="1"
				bind:value={form.order}
				required
			/>
			{#if errors.order}
				<span class="block text-xs text-red-600">{errors.order}</span>
			{/if}
		</label>
		<label class="space-y-1 md:col-span-2">
			<span class="text-sm font-medium text-slate-700">Description</span>
			<textarea class="w-full rounded-lg border-slate-300" rows="3" bind:value={form.description}
			></textarea>
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
				{isSubmitting ? 'Saving...' : editingId ? 'Update belt rank' : 'Create belt rank'}
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
	open={isImportModalOpen}
	title="Import belt ranks"
	description="Upload an Excel file. Required columns: name, order. Optional columns: description, isActive."
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
			<p class="mt-1">`name`, `order`, `description`, `isActive`</p>
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
