<script lang="ts">
	import { onMount } from 'svelte';
	import { DataTableToolbar, EmptyState, IconActionButton, PageHeader, SectionCard, subscribeDataChanged } from '$lib';
	import type { BeltRank, Club, Gender, Student, StudentStatus } from '$lib/domain/models';
	import { beltRankUseCases, clubUseCases, studentUseCases } from '$lib/app/services';
	import { toastError, toastSuccess } from '$lib/app/toast';
	import AppModal from '$lib/ui/components/AppModal.svelte';
	import AppDatePicker from '$lib/ui/components/AppDatePicker.svelte';
	import DataPagination from '$lib/ui/components/DataPagination.svelte';

	type StudentForm = {
		fullName: string;
		studentCode: string;
		dateOfBirth: string;
		gender: Gender | '';
		phone: string;
		email: string;
		address: string;
		clubId: string;
		beltRankId: string;
		joinedAt: string;
		status: StudentStatus;
		notes: string;
	};

	type StudentFormErrors = Partial<
		Record<'fullName' | 'clubId' | 'beltRankId' | 'dateOfBirth' | 'joinedAt' | 'phone' | 'email', string>
	>;

	function getTodayIsoDate(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function createInitialForm(): StudentForm {
		return {
			fullName: '',
			studentCode: '',
			dateOfBirth: '',
			gender: '',
			phone: '',
			email: '',
			address: '',
			clubId: '',
			beltRankId: '',
			joinedAt: getTodayIsoDate(),
			status: 'active',
			notes: ''
		};
	}

	const genderOptions: Array<{ label: string; value: Gender }> = [
		{ label: 'Male', value: 'male' },
		{ label: 'Female', value: 'female' }
	];

	const statusOptions: Array<{ label: string; value: StudentStatus }> = [
		{ label: 'Active', value: 'active' },
		{ label: 'Inactive', value: 'inactive' },
		{ label: 'Suspended', value: 'suspended' }
	];

	let students = $state<Student[]>([]);
	let clubs = $state<Club[]>([]);
	let beltRanks = $state<BeltRank[]>([]);
	let form = $state<StudentForm>(createInitialForm());
	let editingId = $state<string | null>(null);
	let isModalOpen = $state(false);
	let search = $state('');
	let selectedClubId = $state('');
	let selectedBeltRankId = $state('');
	let currentPage = $state(1);
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let errors = $state<StudentFormErrors>({});

	const clubMap = $derived.by(() => new Map(clubs.map((club) => [club.id, club.name])));
	const beltRankMap = $derived.by(() => new Map(beltRanks.map((beltRank) => [beltRank.id, beltRank.name])));
	const assignableClubs = $derived.by(() =>
		clubs.filter((club) => !club.deletedAt && club.syncStatus === 'synced' && club.isActive)
	);
	const assignableBeltRanks = $derived.by(() =>
		beltRanks.filter((beltRank) => !beltRank.deletedAt && beltRank.syncStatus === 'synced' && beltRank.isActive)
	);

	const filteredStudents = $derived.by(() => {
		const query = search.trim().toLowerCase();

		return students.filter((student) => {
			const matchesQuery =
				!query ||
				student.fullName.toLowerCase().includes(query) ||
				(student.studentCode ?? '').toLowerCase().includes(query) ||
				(clubMap.get(student.clubId) ?? '').toLowerCase().includes(query) ||
				(beltRankMap.get(student.beltRankId) ?? '').toLowerCase().includes(query);

			const matchesClub = !selectedClubId || student.clubId === selectedClubId;
			const matchesBeltRank = !selectedBeltRankId || student.beltRankId === selectedBeltRankId;

			return matchesQuery && matchesClub && matchesBeltRank;
		});
	});
	const pageSize = 10;
	const paginatedStudents = $derived.by(() => {
		const start = (currentPage - 1) * pageSize;
		return filteredStudents.slice(start, start + pageSize);
	});

	$effect(() => {
		search;
		selectedClubId;
		selectedBeltRankId;
		currentPage = 1;
	});

	$effect(() => {
		const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
		if (currentPage > totalPages) currentPage = totalPages;
	});

	onMount(() => {
		void loadData();

		return subscribeDataChanged(() => {
			void loadData();
		});
	});

	async function loadData() {
		try {
			isLoading = true;

			const [studentRows, clubRows, beltRankRows] = await Promise.all([
				studentUseCases.list(),
				clubUseCases.list(),
				beltRankUseCases.list()
			]);

			students = studentRows;
			clubs = clubRows;
			beltRanks = beltRankRows;
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to load students.');
		} finally {
			isLoading = false;
		}
	}

	function resetForm() {
		form = createInitialForm();
		errors = {};
		editingId = null;
	}

	function openCreateModal() {
		resetForm();
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		resetForm();
	}

	function startEdit(student: Student) {
		if (student.deletedAt) return;
		errors = {};
		editingId = student.id;
		form = {
			fullName: student.fullName,
			studentCode: student.studentCode ?? '',
			dateOfBirth: student.dateOfBirth ?? '',
			gender: student.gender ?? '',
			phone: student.phone ?? '',
			email: student.email ?? '',
			address: student.address ?? '',
			clubId: student.clubId,
			beltRankId: student.beltRankId,
			joinedAt: student.joinedAt ?? '',
			status: student.status,
			notes: student.notes ?? ''
		};
		isModalOpen = true;
	}

	function isValidIsoDate(value: string): boolean {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
		const date = new Date(`${value}T00:00:00`);
		return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
	}

	function validateForm(): boolean {
		const nextErrors: StudentFormErrors = {};
		const fullName = form.fullName.trim();
		const phone = form.phone.trim();
		const email = form.email.trim();
		const today = getTodayIsoDate();

		if (!fullName) {
			nextErrors.fullName = 'Student full name is required.';
		}

		if (!form.clubId) {
			nextErrors.clubId = 'Club is required.';
		}

		if (!form.beltRankId) {
			nextErrors.beltRankId = 'Belt rank is required.';
		}

		if (form.dateOfBirth) {
			if (!isValidIsoDate(form.dateOfBirth)) {
				nextErrors.dateOfBirth = 'Date of birth is invalid.';
			} else if (form.dateOfBirth > today) {
				nextErrors.dateOfBirth = 'Date of birth cannot be in the future.';
			}
		}

		if (form.joinedAt) {
			if (!isValidIsoDate(form.joinedAt)) {
				nextErrors.joinedAt = 'Joined date is invalid.';
			} else if (form.joinedAt > today) {
				nextErrors.joinedAt = 'Joined date cannot be in the future.';
			}
		}

		if (form.dateOfBirth && form.joinedAt && isValidIsoDate(form.dateOfBirth) && isValidIsoDate(form.joinedAt)) {
			if (form.joinedAt < form.dateOfBirth) {
				nextErrors.joinedAt = 'Joined date cannot be earlier than date of birth.';
			}
		}

		if (phone && !/^[0-9+\-\s()]{8,20}$/.test(phone)) {
			nextErrors.phone = 'Phone number format is invalid.';
		}

		if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

			const payload = {
				fullName: form.fullName,
				studentCode: form.studentCode,
				dateOfBirth: form.dateOfBirth || undefined,
				gender: form.gender || undefined,
				phone: form.phone,
				email: form.email,
				address: form.address,
				clubId: form.clubId,
				beltRankId: form.beltRankId,
				joinedAt: form.joinedAt || undefined,
				status: form.status,
				notes: form.notes
			};

			if (editingId) {
				await studentUseCases.update(editingId, payload);
				toastSuccess('Student updated.');
			} else {
				await studentUseCases.create(payload);
				toastSuccess('Student created.');
			}

			resetForm();
			isModalOpen = false;
			await loadData();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to save student.';
			toastError(message);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete(studentId: string) {
		try {
			await studentUseCases.softDelete(studentId);
			toastSuccess('Student deleted.');
			if (editingId === studentId) resetForm();
			await loadData();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete student.';
			toastError(message);
		}
	}

	async function handleRestore(studentId: string) {
		try {
			await studentUseCases.restore(studentId);
			toastSuccess('Student restored locally.');
			await loadData();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to restore student.';
			toastError(message);
		}
	}
</script>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-8">
	<PageHeader
		eyebrow="Management"
		title="Students"
		description="Manage students, assign clubs, and track current belt ranks."
	/>

	<SectionCard title="Student list">
		<DataTableToolbar bind:searchValue={search} searchPlaceholder="Search by student, club, belt rank">
			{#snippet filters()}
				<select class="w-full rounded-lg border-slate-300 xl:w-52" bind:value={selectedClubId}>
					<option value="">All clubs</option>
					{#each clubs as club (club.id)}
						<option value={club.id}>{club.name}</option>
					{/each}
				</select>
				<select class="w-full rounded-lg border-slate-300 xl:w-52" bind:value={selectedBeltRankId}>
					<option value="">All belt ranks</option>
					{#each beltRanks as beltRank (beltRank.id)}
						<option value={beltRank.id}>{beltRank.name}</option>
					{/each}
				</select>
			{/snippet}
			{#snippet actions()}
				<IconActionButton
					icon="icon-[mdi--plus]"
					label="Add student"
					variant="primary"
					onclick={openCreateModal}
					tooltipText={{ text: 'Add student', placement: 'bottom' }}
				/>
			{/snippet}
		</DataTableToolbar>

		{#if isLoading}
			<p class="text-sm text-slate-500">Loading students...</p>
		{:else if filteredStudents.length === 0}
			<EmptyState
				title="No students found"
				description="Create a student after setting up clubs and belt ranks."
			/>
		{:else}
			<div class="space-y-3 md:hidden">
				{#each paginatedStudents as student (student.id)}
					<article class="rounded-xl border border-slate-200 bg-slate-50 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="space-y-1">
								<h3 class="font-semibold text-slate-900">{student.fullName}</h3>
								<p class="text-sm text-slate-500">{student.studentCode ?? 'Generated on sync'}</p>
								<p class="text-sm text-slate-600">
									{clubMap.get(student.clubId) ?? '-'} • {beltRankMap.get(student.beltRankId) ?? '-'}
								</p>
								<p class="text-sm text-slate-600">
									{#if student.deletedAt}
										{student.syncStatus === 'failed' ? 'Delete failed' : 'Pending delete'}
									{:else}
										{student.status}
									{/if}
								</p>
							</div>
							<div class="inline-flex gap-2">
								{#if student.deletedAt}
									<IconActionButton
										icon="icon-[mdi--restore]"
										label={`Restore ${student.fullName}`}
										onclick={() => handleRestore(student.id)}
									/>
								{:else}
									<IconActionButton
										icon="icon-[mdi--pencil-outline]"
										label={`Edit ${student.fullName}`}
										onclick={() => startEdit(student)}
									/>
									<IconActionButton
										icon="icon-[mdi--delete-outline]"
										label={`Delete ${student.fullName}`}
										variant="danger"
										onclick={() => handleDelete(student.id)}
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
							<th class="py-2 pr-3">Student</th>
							<th class="py-2 pr-3">Code</th>
							<th class="py-2 pr-3">Club</th>
							<th class="py-2 pr-3">Belt Rank</th>
							<th class="py-2 pr-3">Status</th>
							<th class="py-2 pr-0 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each paginatedStudents as student (student.id)}
							<tr class="border-b border-slate-100">
								<td class="py-3 pr-3 font-medium text-slate-900">{student.fullName}</td>
								<td class="py-3 pr-3 text-slate-700">{student.studentCode ?? 'Generated on sync'}</td>
								<td class="py-3 pr-3 text-slate-700">{clubMap.get(student.clubId) ?? '-'}</td>
								<td class="py-3 pr-3 text-slate-700">{beltRankMap.get(student.beltRankId) ?? '-'}</td>
								<td class="py-3 pr-3 text-slate-700">
									{#if student.deletedAt}
										{student.syncStatus === 'failed' ? 'Delete failed' : 'Pending delete'}
									{:else}
										{student.status}
									{/if}
								</td>
								<td class="py-3 pl-3 pr-0 text-right">
									<div class="inline-flex gap-2">
										{#if student.deletedAt}
											<IconActionButton
												icon="icon-[mdi--restore]"
												label={`Restore ${student.fullName}`}
												onclick={() => handleRestore(student.id)}
											/>
										{:else}
											<IconActionButton
												icon="icon-[mdi--pencil-outline]"
												label={`Edit ${student.fullName}`}
												onclick={() => startEdit(student)}
											/>
											<IconActionButton
												icon="icon-[mdi--delete-outline]"
												label={`Delete ${student.fullName}`}
												variant="danger"
												onclick={() => handleDelete(student.id)}
											/>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<DataPagination bind:currentPage totalItems={filteredStudents.length} pageSize={pageSize} />
		{/if}
	</SectionCard>
</main>

<AppModal open={isModalOpen} title={editingId ? 'Edit student' : 'Create student'} onClose={closeModal}>
	<form class="grid w-full min-w-0 gap-4 md:grid-cols-2" onsubmit={handleSubmit}>
		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Full name *</span>
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
		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Student code</span>
			<input
				class="w-full rounded-lg border-slate-300 bg-slate-100 text-slate-500"
				value={editingId ? form.studentCode || 'Generated on sync' : 'Generated on sync'}
				readonly
				disabled
			/>
			<span class="block text-xs text-slate-500">Backend sync will generate code in the format `PQQ-000001`.</span>
		</label>
		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Club *</span>
			<select class:border-red-300={!!errors.clubId} class="w-full rounded-lg border-slate-300" bind:value={form.clubId} required>
				<option value="">Select a club</option>
				{#each assignableClubs as club (club.id)}
					<option value={club.id}>{club.name}</option>
				{/each}
			</select>
			{#if errors.clubId}
				<span class="block text-xs text-red-600">{errors.clubId}</span>
			{/if}
		</label>
		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Belt rank *</span>
			<select class:border-red-300={!!errors.beltRankId} class="w-full rounded-lg border-slate-300" bind:value={form.beltRankId} required>
				<option value="">Select a belt rank</option>
				{#each assignableBeltRanks as beltRank (beltRank.id)}
					<option value={beltRank.id}>{beltRank.name}</option>
				{/each}
			</select>
			{#if errors.beltRankId}
				<span class="block text-xs text-red-600">{errors.beltRankId}</span>
			{/if}
		</label>
		<p class="text-xs text-slate-500 md:col-span-2">
			Only synced active clubs and belt ranks can be assigned to students.
		</p>
		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Date of birth</span>
			<AppDatePicker bind:value={form.dateOfBirth} placeholder="Select date of birth" showAgePresets={true} />
			{#if errors.dateOfBirth}
				<span class="block text-xs text-red-600">{errors.dateOfBirth}</span>
			{/if}
		</label>
		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Joined at</span>
			<AppDatePicker bind:value={form.joinedAt} placeholder="Select joined date" />
			{#if errors.joinedAt}
				<span class="block text-xs text-red-600">{errors.joinedAt}</span>
			{/if}
		</label>
		<label class="min-w-0 space-y-1 md:col-span-2">
			<span class="text-sm font-medium text-slate-700">Gender</span>
			<div class="flex flex-wrap gap-2 rounded-lg border border-slate-300 bg-white p-2">
				{#each genderOptions as option (option.value)}
					<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700">
						<input type="radio" name="gender" bind:group={form.gender} value={option.value} />
						<span>{option.label}</span>
					</label>
				{/each}
			</div>
		</label>
		{#if editingId}
			<label class="min-w-0 space-y-1">
				<span class="text-sm font-medium text-slate-700">Status</span>
				<select class="w-full rounded-lg border-slate-300" bind:value={form.status}>
					{#each statusOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</label>
		{/if}
		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Phone</span>
			<input class:border-red-300={!!errors.phone} class="w-full rounded-lg border-slate-300" bind:value={form.phone} />
			{#if errors.phone}
				<span class="block text-xs text-red-600">{errors.phone}</span>
			{/if}
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
		<label class="min-w-0 space-y-1 md:col-span-2">
			<span class="text-sm font-medium text-slate-700">Address</span>
			<input class="w-full rounded-lg border-slate-300" bind:value={form.address} />
		</label>
		<label class="min-w-0 space-y-1 md:col-span-2">
			<span class="text-sm font-medium text-slate-700">Notes</span>
			<textarea class="w-full rounded-lg border-slate-300" rows="3" bind:value={form.notes}></textarea>
		</label>
		<div class="flex gap-3 md:col-span-2">
			<button
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
				type="submit"
				disabled={isSubmitting}
			>
				{isSubmitting ? 'Saving...' : editingId ? 'Update student' : 'Create student'}
			</button>
			<button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium" type="button" onclick={closeModal}>
				Cancel
			</button>
		</div>
	</form>
</AppModal>
