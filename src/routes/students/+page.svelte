<script lang="ts">
	import { onMount } from 'svelte';
	import {
		DataTableToolbar,
		EmptyState,
		IconActionButton,
		PageHeader,
		SectionCard,
		StudentFormModal,
		getTodayIsoDate,
		normalizeDateInput,
		subscribeDataChanged
	} from '$lib';
	import type { BeltRank, Club, ClubGroup, ClubSchedule, Student, StudentSchedule, StudentScheduleProfile, Weekday } from '$lib/domain/models';
	import {
		beltRankUseCases,
		clubGroupUseCases,
		clubScheduleUseCases,
		clubUseCases,
		studentScheduleUseCases,
		studentUseCases
	} from '$lib/app/services';
	import { toastError, toastSuccess } from '$lib/app/toast';
	import { normalizeSearchText } from '$lib/domain/string-utils';
	import { getApiBaseUrl } from '$lib/app/sync/sync-config';
	import { syncManager } from '$lib/app/sync/sync-manager';
	import { formatWeekdayList, sortWeekdays } from '$lib/domain/schedule-utils';
	import { validateStudentForm } from '$lib/domain/student-form-validation';
	import AppModal from '$lib/ui/components/AppModal.svelte';
	import DataPagination from '$lib/ui/components/DataPagination.svelte';
	import type { StudentFormErrors, StudentFormValue } from '$lib/ui/components/student-form';

	type StudentImportRowError = {
		row: number;
		message: string;
	};

	type StudentImportResponse = {
		importedCount: number;
		errors: StudentImportRowError[];
	};

	function areWeekdayListsEqual(left: Weekday[], right: Weekday[]): boolean {
		if (left.length !== right.length) return false;
		return left.every((value, index) => value === right[index]);
	}

	function createInitialForm(): StudentFormValue {
		return {
			fullName: '',
			studentCode: '',
			dateOfBirth: '',
			gender: '',
			phone: '',
			email: '',
			address: '',
			clubId: '',
			groupId: '',
			beltRankId: '',
			scheduleMode: 'inherit',
			joinedAt: getTodayIsoDate(),
			status: 'active',
			notes: ''
		};
	}

	const statusOptions = [
		{ label: 'Active', value: 'active' },
		{ label: 'Inactive', value: 'inactive' },
		{ label: 'Suspended', value: 'suspended' }
	] as const;

	let students = $state<Student[]>([]);
	let clubs = $state<Club[]>([]);
	let clubGroups = $state<ClubGroup[]>([]);
	let clubSchedules = $state<ClubSchedule[]>([]);
	let beltRanks = $state<BeltRank[]>([]);
	let studentScheduleProfiles = $state<StudentScheduleProfile[]>([]);
	let studentSchedules = $state<StudentSchedule[]>([]);
	let form = $state<StudentFormValue>(createInitialForm());
	let selectedCustomScheduleDays = $state<Weekday[]>([]);
	let editingId = $state<string | null>(null);
	let isModalOpen = $state(false);
	let isImportModalOpen = $state(false);
	let isImportResultModalOpen = $state(false);
	let search = $state('');
	let selectedClubId = $state('');
	let selectedGroupId = $state('');
	let selectedBeltRankId = $state('');
	let currentPage = $state(1);
	let isLoading = $state(false);
	let isSubmitting = $state(false);
	let isImporting = $state(false);
	let errors = $state<StudentFormErrors>({});
	let importErrors = $state<StudentImportRowError[]>([]);
	let importSummary = $state<StudentImportResponse | null>(null);
	let importFile = $state<File | null>(null);
	let importFileName = $state('');
	let importFormError = $state('');

	const clubMap = $derived.by(() => new Map(clubs.map((club) => [club.id, club.name])));
	const groupMap = $derived.by(() => new Map(clubGroups.map((group) => [group.id, group.name])));
	const beltRankMap = $derived.by(() => new Map(beltRanks.map((beltRank) => [beltRank.id, beltRank.name])));
	const clubScheduleMap = $derived.by(() => {
		const map = new Map<string, Weekday[]>();
		for (const schedule of clubSchedules) {
			if (schedule.deletedAt || !schedule.isActive) continue;
			const existing = map.get(schedule.clubId) ?? [];
			existing.push(schedule.weekday);
			map.set(schedule.clubId, existing);
		}
		for (const [key, value] of map) {
			map.set(key, sortWeekdays(value));
		}
		return map;
	});
	const studentScheduleProfileMap = $derived.by(() => new Map(studentScheduleProfiles.map((profile) => [profile.studentId, profile.mode])));
	const studentScheduleMap = $derived.by(() => {
		const map = new Map<string, Weekday[]>();
		for (const schedule of studentSchedules) {
			if (schedule.deletedAt || !schedule.isActive) continue;
			const existing = map.get(schedule.studentId) ?? [];
			existing.push(schedule.weekday);
			map.set(schedule.studentId, existing);
		}
		for (const [key, value] of map) {
			map.set(key, sortWeekdays(value));
		}
		return map;
	});
	const availableClubTrainingDays = $derived.by(() => (form.clubId ? clubScheduleMap.get(form.clubId) ?? [] : []));
	const assignableClubs = $derived.by(() =>
		clubs.filter((club) => !club.deletedAt && club.syncStatus === 'synced' && club.isActive)
	);
	const assignableGroups = $derived.by(() =>
		clubGroups.filter(
			(group) =>
				!group.deletedAt &&
				group.syncStatus === 'synced' &&
				group.isActive &&
				(!form.clubId || group.clubId === form.clubId)
		)
	);
	const assignableBeltRanks = $derived.by(() =>
		beltRanks.filter((beltRank) => !beltRank.deletedAt && beltRank.syncStatus === 'synced' && beltRank.isActive)
	);

	const filteredStudents = $derived.by(() => {
		const query = normalizeSearchText(search);

		return students.filter((student) => {
			const matchesQuery =
				!query ||
				[
					student.fullName,
					student.studentCode ?? '',
					clubMap.get(student.clubId) ?? '',
					groupMap.get(student.groupId ?? '') ?? '',
					beltRankMap.get(student.beltRankId) ?? ''
				].some((value) => normalizeSearchText(value).includes(query));

			const matchesClub = !selectedClubId || student.clubId === selectedClubId;
			const matchesGroup = !selectedGroupId || student.groupId === selectedGroupId;
			const matchesBeltRank = !selectedBeltRankId || student.beltRankId === selectedBeltRankId;

			return matchesQuery && matchesClub && matchesGroup && matchesBeltRank;
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
		selectedGroupId;
		selectedBeltRankId;
		currentPage = 1;
	});

	$effect(() => {
		if (
			selectedGroupId &&
			!clubGroups.some((group) => group.id === selectedGroupId && (!selectedClubId || group.clubId === selectedClubId))
		) {
			selectedGroupId = '';
		}
	});

	$effect(() => {
		if (form.groupId && !clubGroups.some((group) => group.id === form.groupId && group.clubId === form.clubId)) {
			form.groupId = '';
		}
	});

	$effect(() => {
		if (form.scheduleMode === 'custom' && selectedCustomScheduleDays.length > 0) {
			const available = new Set(availableClubTrainingDays);
			const nextSelectedDays = selectedCustomScheduleDays.filter((weekday) => available.has(weekday));
			if (!areWeekdayListsEqual(selectedCustomScheduleDays, nextSelectedDays)) {
				selectedCustomScheduleDays = nextSelectedDays;
			}
		}
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

			const [studentRows, clubRows, clubGroupRows, beltRankRows] = await Promise.all([
				studentUseCases.list(),
				clubUseCases.list(),
				clubGroupUseCases.list(),
				beltRankUseCases.list()
			]);
			const [clubScheduleRows, studentScheduleProfileRows, studentScheduleRows] = await Promise.all([
				Promise.all(clubRows.map((club) => clubScheduleUseCases.listByClub(club.id))).then((rows) => rows.flat()),
				Promise.all(
					studentRows.map(async (student) => {
						const mode = await studentScheduleUseCases.getMode(student.id);
						return {
							id: student.id,
							studentId: student.id,
							mode,
							createdAt: student.createdAt,
							updatedAt: student.updatedAt,
							lastModifiedAt: student.lastModifiedAt,
							syncStatus: 'synced' as const
						};
					})
				),
				Promise.all(studentRows.map((student) => studentScheduleUseCases.getWeekdays(student.id))).then((rows) =>
					rows.flatMap((weekdays, index) =>
						weekdays.map((weekday) => ({
							id: `${studentRows[index].id}:${weekday}`,
							studentId: studentRows[index].id,
							weekday,
							isActive: true,
							createdAt: studentRows[index].createdAt,
							updatedAt: studentRows[index].updatedAt,
							lastModifiedAt: studentRows[index].lastModifiedAt,
							syncStatus: 'synced' as const
						}))
					)
				)
			]);

			students = studentRows;
			clubs = clubRows;
			clubGroups = clubGroupRows;
			beltRanks = beltRankRows;
			clubSchedules = clubScheduleRows;
			studentScheduleProfiles = studentScheduleProfileRows;
			studentSchedules = studentScheduleRows;
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to load students.');
		} finally {
			isLoading = false;
		}
	}

	function resetForm() {
		form = createInitialForm();
		selectedCustomScheduleDays = [];
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

	function startEdit(student: Student) {
		if (student.deletedAt) return;
		errors = {};
		editingId = student.id;
		form = {
			fullName: student.fullName,
			studentCode: student.studentCode ?? '',
			dateOfBirth: normalizeDateInput(student.dateOfBirth),
			gender: student.gender ?? '',
			phone: student.phone ?? '',
			email: student.email ?? '',
			address: student.address ?? '',
			clubId: student.clubId,
			groupId: student.groupId ?? '',
			beltRankId: student.beltRankId,
			scheduleMode: studentScheduleProfileMap.get(student.id) ?? 'inherit',
			joinedAt: normalizeDateInput(student.joinedAt),
			status: student.status,
			notes: student.notes ?? ''
		};
		selectedCustomScheduleDays = studentScheduleMap.get(student.id) ?? [];
		isModalOpen = true;
	}

	function validateForm(): boolean {
		const result = validateStudentForm(form, {
			requireClub: true,
			groups: clubGroups,
			availableClubTrainingDays,
			selectedCustomScheduleDays
		});
		form = result.form;
		errors = result.errors;
		return Object.keys(result.errors).length === 0;
	}

	async function handleSubmit() {
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
				groupId: form.groupId || undefined,
				beltRankId: form.beltRankId,
				joinedAt: form.joinedAt || undefined,
				status: form.status,
				notes: form.notes
			};

			if (editingId) {
				await studentUseCases.update(editingId, payload);
				await studentScheduleUseCases.save(editingId, form.scheduleMode, selectedCustomScheduleDays);
				toastSuccess('Student updated.');
			} else {
				const createdId = await studentUseCases.create(payload);
				await studentScheduleUseCases.save(createdId, form.scheduleMode, selectedCustomScheduleDays);
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

	function toggleCustomScheduleDay(weekday: Weekday) {
		const allowedDays = new Set(availableClubTrainingDays);
		if (!allowedDays.has(weekday)) return;

		if (selectedCustomScheduleDays.includes(weekday)) {
			selectedCustomScheduleDays = selectedCustomScheduleDays.filter((value) => value !== weekday);
			return;
		}

		selectedCustomScheduleDays = sortWeekdays([...selectedCustomScheduleDays, weekday]);
	}

	function getStudentScheduleSummary(studentId: string, clubId: string): string {
		const mode = studentScheduleProfileMap.get(studentId) ?? 'inherit';
		if (mode === 'inherit') {
			return `Club schedule • ${formatWeekdayList(clubScheduleMap.get(clubId) ?? []) || 'No days set'}`;
		}
		return `Custom • ${formatWeekdayList(studentScheduleMap.get(studentId) ?? []) || 'No days set'}`;
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

			const response = await fetch(`${getApiBaseUrl()}/api/v1/students/import`, {
				method: 'POST',
				body: formData
			});

			const payload = (await response.json()) as StudentImportResponse | { error?: string };
			if (!response.ok) {
				throw new Error('error' in payload ? payload.error || 'Import failed.' : 'Import failed.');
			}

			importSummary = payload as StudentImportResponse;
			importErrors = importSummary.errors;

			await syncManager.syncNow();
			await loadData();
			closeImportModal();
			isImportResultModalOpen = true;

			if (importSummary.importedCount > 0) {
				toastSuccess(`Imported ${importSummary.importedCount} student(s).`);
			}

			if (importSummary.errors.length > 0) {
				toastError(`${importSummary.errors.length} row(s) failed during import.`);
			}

			if (importSummary.importedCount === 0 && importSummary.errors.length === 0) {
				toastSuccess('Import completed with no changes.');
			}
		} catch (error) {
			importFormError = error instanceof Error ? error.message : 'Failed to import students.';
			toastError(importFormError);
		} finally {
			isImporting = false;
		}
	}

	function downloadImportTemplate() {
		const url = `${getApiBaseUrl()}/api/v1/students/import-template`;
		const link = document.createElement('a');
		link.href = url;
		link.download = 'students-import-template.xlsx';
		document.body.appendChild(link);
		link.click();
		link.remove();
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
				<select class="w-full rounded-lg border-slate-300 xl:w-52" bind:value={selectedGroupId}>
					<option value="">All groups</option>
					{#each clubGroups.filter((group) => !selectedClubId || group.clubId === selectedClubId) as group (group.id)}
						<option value={group.id}>{group.name}</option>
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
					icon="icon-[mdi--download-outline]"
					label="Download template"
					onclick={downloadImportTemplate}
					tooltipText={{ text: 'Download template', placement: 'bottom' }}
				/>
				<IconActionButton
					icon="icon-[mdi--file-import-outline]"
					label="Import students"
					onclick={openImportModal}
					tooltipText={{ text: 'Import students', placement: 'bottom' }}
				/>
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
									{clubMap.get(student.clubId) ?? '-'}{#if student.groupId} • {groupMap.get(student.groupId) ?? '-'}{/if} • {beltRankMap.get(student.beltRankId) ?? '-'}
								</p>
								<p class="text-sm text-slate-500">{getStudentScheduleSummary(student.id, student.clubId)}</p>
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
							<th class="py-2 pr-3">Group</th>
							<th class="py-2 pr-3">Belt Rank</th>
							<th class="py-2 pr-3">Schedule</th>
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
								<td class="py-3 pr-3 text-slate-700">{groupMap.get(student.groupId ?? '') ?? '-'}</td>
								<td class="py-3 pr-3 text-slate-700">{beltRankMap.get(student.beltRankId) ?? '-'}</td>
								<td class="py-3 pr-3 text-slate-700">{getStudentScheduleSummary(student.id, student.clubId)}</td>
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

<AppModal open={isImportModalOpen} title="Import students" onClose={closeImportModal}>
	<form class="space-y-4" onsubmit={handleImportSubmit}>
		<div class="space-y-2">
			<p class="text-sm text-slate-600">
				Upload an Excel file with columns:
				<span class="font-medium text-slate-900">fullName</span>,
				<span class="font-medium text-slate-900">club</span>,
				<span class="font-medium text-slate-900">beltRank</span>,
				and optional:
				<span class="font-medium text-slate-900">studentCode</span>,
				<span class="font-medium text-slate-900">group</span>,
				<span class="font-medium text-slate-900">scheduleMode</span>,
				<span class="font-medium text-slate-900">scheduleDays</span>,
				<span class="font-medium text-slate-900">dateOfBirth</span>,
				<span class="font-medium text-slate-900">gender</span>,
				<span class="font-medium text-slate-900">phone</span>,
				<span class="font-medium text-slate-900">email</span>,
				<span class="font-medium text-slate-900">address</span>,
				<span class="font-medium text-slate-900">joinedAt</span>,
				<span class="font-medium text-slate-900">status</span>,
				<span class="font-medium text-slate-900">notes</span>.
			</p>
			<p class="text-xs text-slate-500">
				Date fields must use <code>YYYY-MM-DD</code>. Leave <code>scheduleMode</code> empty to inherit the club schedule. Use comma-separated weekdays like <code>mon,wed,fri</code> for <code>scheduleDays</code>. If <code>studentCode</code> is blank, backend sync will generate it later.
			</p>
		</div>

		<label class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
			<span class="icon-[mdi--file-excel-outline] h-8 w-8 text-slate-500"></span>
			<span class="text-sm font-medium text-slate-700">{importFileName || 'Choose an Excel file (.xlsx, .xls)'}</span>
			<input class="hidden" type="file" accept=".xlsx,.xls" onchange={handleImportFileChange} />
		</label>

		{#if importFormError}
			<p class="text-sm text-red-600">{importFormError}</p>
		{/if}

		<div class="flex justify-end gap-3">
			<button
				class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
				type="button"
				onclick={closeImportModal}
			>
				Cancel
			</button>
			<button
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
				type="submit"
				disabled={isImporting}
			>
				{isImporting ? 'Importing...' : 'Import'}
			</button>
		</div>
	</form>
</AppModal>

<AppModal open={isImportResultModalOpen} title="Import result" onClose={closeImportResultModal}>
	<div class="space-y-4">
		<div class="grid gap-3 sm:grid-cols-2">
			<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
				<p class="text-xs uppercase tracking-[0.2em] text-slate-500">Imported</p>
				<p class="mt-2 text-2xl font-semibold text-slate-900">{importSummary?.importedCount ?? 0}</p>
			</div>
			<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
				<p class="text-xs uppercase tracking-[0.2em] text-slate-500">Errors</p>
				<p class="mt-2 text-2xl font-semibold text-slate-900">{importSummary?.errors.length ?? 0}</p>
			</div>
		</div>

		{#if importErrors.length === 0}
			<p class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
				All rows were imported successfully.
			</p>
		{:else}
			<div class="max-h-80 space-y-3 overflow-y-auto pr-1">
				{#each importErrors as importError (`${importError.row}-${importError.message}`)}
					<div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
						<p class="text-sm font-medium text-red-700">Row {importError.row}</p>
						<p class="mt-1 text-sm text-red-600">{importError.message}</p>
					</div>
				{/each}
			</div>
		{/if}

		<div class="flex justify-end">
			<button
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
				type="button"
				onclick={closeImportResultModal}
			>
				Close
			</button>
		</div>
	</div>
</AppModal>

<StudentFormModal
	open={isModalOpen}
	title={editingId ? 'Edit student' : 'Create student'}
	bind:form
	errors={errors}
	bind:selectedCustomScheduleDays
	availableClubs={assignableClubs}
	availableGroups={assignableGroups}
	availableBeltRanks={assignableBeltRanks}
	availableClubTrainingDays={availableClubTrainingDays}
	onClose={closeModal}
	onSubmit={() => void handleSubmit()}
	submitLabel={editingId ? 'Update student' : 'Create student'}
	isSubmitting={isSubmitting}
	showScheduleSection={true}
	showClubSelector={true}
	showStatusField={!!editingId}
	studentCodeDisplay={editingId ? form.studentCode || 'Generated on sync' : 'Generated on sync'}
	statusOptions={[...statusOptions]}
/>
