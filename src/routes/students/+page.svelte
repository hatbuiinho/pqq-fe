<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AppDatePicker,
		DataTableToolbar,
		EmptyState,
		ImagePreviewModal,
		IconActionButton,
		loadStudentAvatarPreviewMap,
		PageHeader,
		SectionCard,
		SuggestionInput,
		StudentAvatarThumb,
		StudentFormModal,
		getTodayIsoDate,
		normalizeDateInput,
		subscribeDataChanged
	} from '$lib';
	import type {
		BeltRank,
		Club,
		ClubGroup,
		ClubSchedule,
		Student,
		StudentSchedule,
		StudentScheduleProfile,
		StudentStatus,
		Weekday
	} from '$lib/domain/models';
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
	import { emitDataChanged } from '$lib/app/data-events';
	import { syncManager } from '$lib/app/sync/sync-manager';
	import { studentMediaApi } from '$lib/app/student-media-api';
	import { formatWeekdayList, sortWeekdays } from '$lib/domain/schedule-utils';
	import { validateStudentForm } from '$lib/domain/student-form-validation';
	import AppModal from '$lib/ui/components/AppModal.svelte';
	import DataPagination from '$lib/ui/components/DataPagination.svelte';
	import type { StudentFormErrors, StudentFormValue } from '$lib/ui/components/student-form';
	import type { AvatarImportBatch, AvatarImportBatchItem } from '$lib/domain/models';

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
	let isAvatarImportModalOpen = $state(false);
	let isBulkActionModalOpen = $state(false);
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
	let avatarUrls = $state<Record<string, string>>({});
	let avatarImportFiles = $state<File[]>([]);
	let avatarImportFileNames = $state<string[]>([]);
	let avatarImportError = $state('');
	let isAnalyzingAvatarImport = $state(false);
	let isConfirmingAvatarImport = $state(false);
	let avatarImportBatch = $state<AvatarImportBatch | null>(null);
	let avatarImportItems = $state<AvatarImportBatchItem[]>([]);
	let avatarImportSelections = $state<Record<string, string>>({});
	let avatarImportSelectionQueries = $state<Record<string, string>>({});
	let avatarImportFilter = $state<
		'all' | 'matched' | 'ambiguous' | 'unmatched' | 'failed' | 'imported' | 'skipped'
	>('all');
	let avatarImportSearch = $state('');
	let avatarImportMatchMode = $state<'auto' | 'manual'>('auto');
	let avatarImportReplaceStrategy = $state<'replace' | 'keep'>('replace');
	let isAvatarImportDragActive = $state(false);
	let isAvatarPreviewModalOpen = $state(false);
	let avatarPreviewUrl = $state('');
	let avatarPreviewTitle = $state('');
	let selectedStudentIds = $state<string[]>([]);
	let bulkActionType = $state<'delete' | 'beltRank' | 'schedule' | 'status' | 'group' | 'club'>(
		'status'
	);
	let bulkClubId = $state('');
	let bulkGroupId = $state('');
	let bulkBeltRankId = $state('');
	let bulkStatus = $state<StudentStatus>('active');
	let bulkScheduleMode = $state<'inherit' | 'custom'>('inherit');
	let bulkScheduleDays = $state<Weekday[]>([]);
	let bulkActionError = $state('');
	let isApplyingBulkAction = $state(false);
	let pendingOpenStudentCode = $state('');
	let pendingOpenStudentId = $state('');
	let shouldAutoOpenStudent = $state(false);
	let hasHandledDeepLinkOpen = $state(false);

	const clubMap = $derived.by(() => new Map(clubs.map((club) => [club.id, club.name])));
	const groupMap = $derived.by(() => new Map(clubGroups.map((group) => [group.id, group.name])));
	const beltRankMap = $derived.by(
		() => new Map(beltRanks.map((beltRank) => [beltRank.id, beltRank.name]))
	);
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
	const studentScheduleProfileMap = $derived.by(
		() => new Map(studentScheduleProfiles.map((profile) => [profile.studentId, profile.mode]))
	);
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
	const availableClubTrainingDays = $derived.by(() =>
		form.clubId ? (clubScheduleMap.get(form.clubId) ?? []) : []
	);
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
		beltRanks.filter(
			(beltRank) => !beltRank.deletedAt && beltRank.syncStatus === 'synced' && beltRank.isActive
		)
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
	const filteredAvatarImportItems = $derived.by(() => {
		const query = normalizeSearchText(avatarImportSearch);

		return avatarImportItems.filter((item) => {
			const matchesFilter = avatarImportFilter === 'all' || item.status === avatarImportFilter;
			const selectedStudentName =
				students.find((student) => student.id === (avatarImportSelections[item.id] ?? ''))
					?.fullName ?? '';
			const matchesSearch =
				!query ||
				[item.originalFilename, item.guessedStudentName ?? '', selectedStudentName].some((value) =>
					normalizeSearchText(value).includes(query)
				);

			return matchesFilter && matchesSearch;
		});
	});
	const selectedAvatarImportCount = $derived.by(
		() =>
			avatarImportItems.filter(
				(item) =>
					item.status !== 'failed' &&
					item.status !== 'imported' &&
					Boolean(avatarImportSelections[item.id] ?? '')
			).length
	);
	const avatarImportStudentOptions = $derived.by(() =>
		students
			.filter((student) => !student.deletedAt)
			.map((student) => ({
				id: student.id,
				label: student.fullName,
				meta: student.studentCode ?? '',
				searchText: `${student.studentCode ?? ''} ${student.fullName}`
			}))
	);
	const selectableFilteredStudents = $derived.by(() =>
		filteredStudents.filter((student) => !student.deletedAt)
	);
	const selectedStudents = $derived.by(() =>
		students.filter((student) => selectedStudentIds.includes(student.id) && !student.deletedAt)
	);
	const selectedStudentCount = $derived.by(() => selectedStudents.length);
	const allFilteredStudentsSelected = $derived.by(
		() =>
			selectableFilteredStudents.length > 0 &&
			selectableFilteredStudents.every((student) => selectedStudentIds.includes(student.id))
	);
	const selectedStudentClubIds = $derived.by(() => [
		...new Set(selectedStudents.map((student) => student.clubId))
	]);
	const singleSelectedClubId = $derived.by(() =>
		selectedStudentClubIds.length === 1 ? selectedStudentClubIds[0] : ''
	);
	const bulkGroupOptions = $derived.by(() => {
		const clubId = bulkActionType === 'club' ? bulkClubId : singleSelectedClubId;
		if (!clubId) return [];
		return assignableGroups.filter((group) => group.clubId === clubId);
	});
	const bulkScheduleAvailableDays = $derived.by(() => {
		if (!singleSelectedClubId) return [];
		return clubScheduleMap.get(singleSelectedClubId) ?? [];
	});

	$effect(() => {
		search;
		selectedClubId;
		selectedGroupId;
		selectedBeltRankId;
		currentPage = 1;
	});

	$effect(() => {
		const existingIds = new Set(
			students.filter((student) => !student.deletedAt).map((student) => student.id)
		);
		const nextSelectedIds = selectedStudentIds.filter((id) => existingIds.has(id));
		if (nextSelectedIds.length !== selectedStudentIds.length) {
			selectedStudentIds = nextSelectedIds;
		}
	});

	$effect(() => {
		if (bulkActionType !== 'group') {
			bulkGroupId = '';
		}
		if (bulkActionType !== 'club') {
			bulkClubId = '';
		}
		if (bulkActionType !== 'beltRank') {
			bulkBeltRankId = '';
		}
		if (bulkActionType !== 'schedule') {
			bulkScheduleMode = 'inherit';
			bulkScheduleDays = [];
		}
		bulkActionError = '';
	});

	$effect(() => {
		if (
			bulkActionType === 'schedule' &&
			bulkScheduleMode === 'custom' &&
			bulkScheduleDays.length > 0
		) {
			const allowedDays = new Set(bulkScheduleAvailableDays);
			const nextDays = bulkScheduleDays.filter((weekday) => allowedDays.has(weekday));
			if (!areWeekdayListsEqual(bulkScheduleDays, nextDays)) {
				bulkScheduleDays = nextDays;
			}
		}
	});

	$effect(() => {
		if (
			selectedGroupId &&
			!clubGroups.some(
				(group) =>
					group.id === selectedGroupId && (!selectedClubId || group.clubId === selectedClubId)
			)
		) {
			selectedGroupId = '';
		}
	});

	$effect(() => {
		if (
			form.groupId &&
			!clubGroups.some((group) => group.id === form.groupId && group.clubId === form.clubId)
		) {
			form.groupId = '';
		}
	});

	$effect(() => {
		if (form.scheduleMode === 'custom' && selectedCustomScheduleDays.length > 0) {
			const available = new Set(availableClubTrainingDays);
			const nextSelectedDays = selectedCustomScheduleDays.filter((weekday) =>
				available.has(weekday)
			);
			if (!areWeekdayListsEqual(selectedCustomScheduleDays, nextSelectedDays)) {
				selectedCustomScheduleDays = nextSelectedDays;
			}
		}
	});

	$effect(() => {
		const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
		if (currentPage > totalPages) currentPage = totalPages;
	});

	$effect(() => {
		paginatedStudents;
		void refreshVisibleAvatarPreviews();
	});

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		pendingOpenStudentCode = (params.get('studentCode') ?? '').trim();
		pendingOpenStudentId = (params.get('studentId') ?? '').trim();
		shouldAutoOpenStudent = params.get('open') === '1';
		void loadData();

		return subscribeDataChanged((source) => {
			if (source === 'avatar' || source === 'avatar-sync') {
				void refreshVisibleAvatarPreviews();
				return;
			}
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
			const [clubScheduleRows, studentScheduleProfileRows, studentScheduleRows] = await Promise.all(
				[
					Promise.all(clubRows.map((club) => clubScheduleUseCases.listByClub(club.id))).then(
						(rows) => rows.flat()
					),
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
					Promise.all(
						studentRows.map((student) => studentScheduleUseCases.getWeekdays(student.id))
					).then((rows) =>
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
				]
			);

			students = studentRows;
			clubs = clubRows;
			clubGroups = clubGroupRows;
			beltRanks = beltRankRows;
			clubSchedules = clubScheduleRows;
			studentScheduleProfiles = studentScheduleProfileRows;
			studentSchedules = studentScheduleRows;
			applyDeepLinkOpen();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to load students.');
		} finally {
			isLoading = false;
		}
	}

	function clearDeepLinkQueryParams() {
		const url = new URL(window.location.href);
		url.searchParams.delete('studentCode');
		url.searchParams.delete('studentId');
		url.searchParams.delete('open');
		window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
	}

	function applyDeepLinkOpen() {
		if (hasHandledDeepLinkOpen || !shouldAutoOpenStudent) return;

		let targetStudent: Student | undefined;
		if (pendingOpenStudentCode) {
			const codeQuery = normalizeSearchText(pendingOpenStudentCode);
			targetStudent = students.find(
				(student) =>
					!student.deletedAt &&
					normalizeSearchText(student.studentCode ?? '') === codeQuery
			);
		}

		if (!targetStudent && pendingOpenStudentId) {
			targetStudent = students.find(
				(student) => !student.deletedAt && student.id === pendingOpenStudentId
			);
		}

		hasHandledDeepLinkOpen = true;
		shouldAutoOpenStudent = false;

		if (!targetStudent) {
			toastError('Không tìm thấy võ sinh theo liên kết đã mở.');
			clearDeepLinkQueryParams();
			return;
		}

		search = targetStudent.studentCode ?? targetStudent.fullName;
		startEdit(targetStudent);
		clearDeepLinkQueryParams();
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

	function isStudentSelected(studentId: string) {
		return selectedStudentIds.includes(studentId);
	}

	function toggleStudentSelection(studentId: string) {
		if (selectedStudentIds.includes(studentId)) {
			selectedStudentIds = selectedStudentIds.filter((id) => id !== studentId);
			return;
		}
		selectedStudentIds = [...selectedStudentIds, studentId];
	}

	function toggleSelectAllFilteredStudents() {
		if (allFilteredStudentsSelected) {
			selectedStudentIds = selectedStudentIds.filter(
				(id) => !selectableFilteredStudents.some((student) => student.id === id)
			);
			return;
		}

		const nextIds = new Set(selectedStudentIds);
		for (const student of selectableFilteredStudents) {
			nextIds.add(student.id);
		}
		selectedStudentIds = [...nextIds];
	}

	function clearStudentSelection() {
		selectedStudentIds = [];
	}

	function openBulkActionModal() {
		if (selectedStudentCount === 0) return;
		bulkActionType = 'status';
		bulkClubId = '';
		bulkGroupId = '';
		bulkBeltRankId = '';
		bulkStatus = 'active';
		bulkScheduleMode = 'inherit';
		bulkScheduleDays = [];
		bulkActionError = '';
		isBulkActionModalOpen = true;
	}

	function closeBulkActionModal() {
		isBulkActionModalOpen = false;
		bulkActionError = '';
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

	function resetAvatarImportState() {
		avatarImportFiles = [];
		avatarImportFileNames = [];
		avatarImportError = '';
		avatarImportBatch = null;
		avatarImportItems = [];
		avatarImportSelections = {};
		avatarImportSelectionQueries = {};
		avatarImportFilter = 'all';
		avatarImportSearch = '';
		avatarImportMatchMode = 'auto';
		avatarImportReplaceStrategy = 'replace';
		isAvatarImportDragActive = false;
	}

	function openAvatarImportModal() {
		resetAvatarImportState();
		isAvatarImportModalOpen = true;
	}

	function closeAvatarImportModal() {
		isAvatarImportModalOpen = false;
		resetAvatarImportState();
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
				await studentScheduleUseCases.save(
					editingId,
					form.scheduleMode,
					selectedCustomScheduleDays
				);
				toastSuccess('Student updated.');
			} else {
				const createdId = await studentUseCases.create(payload);
				await studentScheduleUseCases.save(
					createdId,
					form.scheduleMode,
					selectedCustomScheduleDays
				);
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

	function toggleBulkScheduleDay(weekday: Weekday) {
		const allowedDays = new Set(bulkScheduleAvailableDays);
		if (!allowedDays.has(weekday)) return;

		if (bulkScheduleDays.includes(weekday)) {
			bulkScheduleDays = bulkScheduleDays.filter((value) => value !== weekday);
			return;
		}

		bulkScheduleDays = sortWeekdays([...bulkScheduleDays, weekday]);
	}

	async function handleBulkActionApply() {
		if (selectedStudents.length === 0) {
			bulkActionError = 'Select at least one student.';
			return;
		}

		try {
			isApplyingBulkAction = true;
			bulkActionError = '';

			switch (bulkActionType) {
				case 'delete':
					await studentUseCases.bulkSoftDelete(
						selectedStudents.map((student) => student.id),
						false
					);
					toastSuccess(`Deleted ${selectedStudents.length} student(s).`);
					break;
				case 'beltRank':
					if (!bulkBeltRankId) throw new Error('Select a belt rank.');
					await studentUseCases.bulkUpdate(
						selectedStudents.map((student) => student.id),
						{ beltRankId: bulkBeltRankId },
						'pending',
						false
					);
					toastSuccess(`Updated belt rank for ${selectedStudents.length} student(s).`);
					break;
				case 'status':
					await studentUseCases.bulkUpdate(
						selectedStudents.map((student) => student.id),
						{ status: bulkStatus },
						'pending',
						false
					);
					toastSuccess(`Updated status for ${selectedStudents.length} student(s).`);
					break;
				case 'group':
					if (!singleSelectedClubId) {
						throw new Error(
							'Bulk group update requires all selected students to belong to the same club.'
						);
					}
					await studentUseCases.bulkUpdate(
						selectedStudents.map((student) => student.id),
						{ groupId: bulkGroupId || '' },
						'pending',
						false
					);
					toastSuccess(`Updated group for ${selectedStudents.length} student(s).`);
					break;
				case 'club':
					if (!bulkClubId) throw new Error('Select a club.');
					await studentUseCases.bulkUpdate(
						selectedStudents.map((student) => student.id),
						{ clubId: bulkClubId, groupId: '' },
						'pending',
						false
					);
					await studentScheduleUseCases.bulkSave(
						selectedStudents.map((student) => student.id),
						'inherit',
						[],
						false
					);
					toastSuccess(
						`Updated club for ${selectedStudents.length} student(s). Group was cleared and schedule reset to inherit.`
					);
					break;
				case 'schedule':
					if (bulkScheduleMode === 'custom') {
						if (!singleSelectedClubId) {
							throw new Error(
								'Bulk custom schedule requires all selected students to belong to the same club.'
							);
						}
						if (bulkScheduleDays.length === 0) {
							throw new Error('Select at least one training day for custom schedule.');
						}
					}
					await studentScheduleUseCases.bulkSave(
						selectedStudents.map((student) => student.id),
						bulkScheduleMode,
						bulkScheduleMode === 'custom' ? bulkScheduleDays : [],
						false
					);
					toastSuccess(`Updated schedule for ${selectedStudents.length} student(s).`);
					break;
			}

			emitDataChanged();
			clearStudentSelection();
			closeBulkActionModal();
			await loadData();
		} catch (error) {
			bulkActionError = error instanceof Error ? error.message : 'Failed to apply bulk action.';
			toastError(bulkActionError);
		} finally {
			isApplyingBulkAction = false;
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

	function handleAvatarImportFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		setAvatarImportFiles(files);
	}

	function setAvatarImportFiles(files: File[]) {
		const acceptedFiles = files.filter((file) =>
			['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
		);
		avatarImportFiles = acceptedFiles;
		avatarImportFileNames = acceptedFiles.map((file) => file.name);
		avatarImportError =
			acceptedFiles.length === 0 && files.length > 0
				? 'Only JPG, PNG, or WebP images are supported.'
				: '';
	}

	function handleAvatarImportDragEnter(event: DragEvent) {
		event.preventDefault();
		isAvatarImportDragActive = true;
	}

	function handleAvatarImportDragOver(event: DragEvent) {
		event.preventDefault();
		if (!isAvatarImportDragActive) {
			isAvatarImportDragActive = true;
		}
	}

	function handleAvatarImportDragLeave(event: DragEvent) {
		event.preventDefault();
		const nextTarget = event.relatedTarget as Node | null;
		if (
			nextTarget &&
			event.currentTarget instanceof HTMLElement &&
			event.currentTarget.contains(nextTarget)
		) {
			return;
		}
		isAvatarImportDragActive = false;
	}

	function handleAvatarImportDrop(event: DragEvent) {
		event.preventDefault();
		isAvatarImportDragActive = false;
		const files = Array.from(event.dataTransfer?.files ?? []);
		setAvatarImportFiles(files);
	}

	async function handleAvatarImportAnalyze(event: SubmitEvent) {
		event.preventDefault();
		if (avatarImportFiles.length === 0) {
			avatarImportError = 'Please select at least one image file.';
			return;
		}

		try {
			isAnalyzingAvatarImport = true;
			avatarImportError = '';
			const response = await studentMediaApi.analyzeAvatarImport(avatarImportFiles);
			avatarImportBatch = response.batch;
			avatarImportItems = response.items;
			avatarImportSelections = Object.fromEntries(
				response.items.map((item) => {
					const selectedStudentId =
						avatarImportMatchMode === 'auto'
							? (item.confirmedStudentId ?? item.guessedStudentId ?? '')
							: '';
					return [item.id, selectedStudentId];
				})
			);
			avatarImportSelectionQueries = Object.fromEntries(
				response.items.map((item) => {
					if (avatarImportMatchMode === 'manual') {
						return [item.id, ''];
					}
					const selectedStudentId = item.confirmedStudentId ?? item.guessedStudentId ?? '';
					const student = students.find((candidate) => candidate.id === selectedStudentId);
					return [item.id, student ? formatAvatarImportStudentLabel(student) : ''];
				})
			);
			if (response.items.length > 0) {
				toastSuccess(`Prepared ${response.items.length} avatar file(s) for review.`);
			}
		} catch (error) {
			avatarImportError =
				error instanceof Error ? error.message : 'Failed to analyze avatar import.';
			toastError(avatarImportError);
		} finally {
			isAnalyzingAvatarImport = false;
		}
	}

	async function handleAvatarImportConfirm() {
		if (!avatarImportBatch) return;

		const confirmedItems = avatarImportItems
			.map((item) => ({
				itemId: item.id,
				studentId: avatarImportSelections[item.id] ?? ''
			}))
			.filter((item) => item.studentId);

		if (confirmedItems.length === 0) {
			avatarImportError = 'Select at least one student before confirming import.';
			return;
		}

		try {
			isConfirmingAvatarImport = true;
			avatarImportError = '';
			const response = await studentMediaApi.confirmAvatarImport(
				avatarImportBatch.id,
				confirmedItems,
				avatarImportReplaceStrategy
			);
			avatarImportBatch = response.batch;
			avatarImportItems = response.items;
			avatarImportSelections = Object.fromEntries(
				response.items.map((item) => [
					item.id,
					item.confirmedStudentId ?? item.guessedStudentId ?? ''
				])
			);
			avatarImportSelectionQueries = Object.fromEntries(
				response.items.map((item) => {
					const selectedStudentId = item.confirmedStudentId ?? item.guessedStudentId ?? '';
					const student = students.find((candidate) => candidate.id === selectedStudentId);
					return [item.id, student ? formatAvatarImportStudentLabel(student) : ''];
				})
			);
			await refreshVisibleAvatarPreviews();
			emitDataChanged('avatar-sync');
			toastSuccess(`Imported ${response.importedCount} avatar(s).`);
		} catch (error) {
			avatarImportError =
				error instanceof Error ? error.message : 'Failed to confirm avatar import.';
			toastError(avatarImportError);
		} finally {
			isConfirmingAvatarImport = false;
		}
	}

	function getAvatarImportStatusClass(status: string) {
		switch (status) {
			case 'matched':
				return 'border-emerald-200 bg-emerald-50 text-emerald-700';
			case 'imported':
				return 'border-emerald-200 bg-emerald-50 text-emerald-700';
			case 'skipped':
				return 'border-indigo-200 bg-indigo-50 text-indigo-700';
			case 'ambiguous':
				return 'border-amber-200 bg-amber-50 text-amber-700';
			case 'failed':
				return 'border-red-200 bg-red-50 text-red-700';
			default:
				return 'border-slate-200 bg-slate-50 text-slate-600';
		}
	}

	function getAvatarImportStatusCount(
		status: 'matched' | 'ambiguous' | 'unmatched' | 'failed' | 'imported' | 'skipped'
	) {
		return avatarImportItems.filter((item) => item.status === status).length;
	}

	function selectAllMatchedAvatarImports() {
		const nextSelections = { ...avatarImportSelections };
		const nextQueries = { ...avatarImportSelectionQueries };
		for (const item of avatarImportItems) {
			if (item.status === 'matched' && (item.guessedStudentId ?? item.confirmedStudentId)) {
				const studentId = item.confirmedStudentId ?? item.guessedStudentId ?? '';
				nextSelections[item.id] = studentId;
				const student = students.find((candidate) => candidate.id === studentId);
				nextQueries[item.id] = student ? formatAvatarImportStudentLabel(student) : '';
			}
		}
		avatarImportSelections = nextSelections;
		avatarImportSelectionQueries = nextQueries;
	}

	function clearAllAvatarImportSelections() {
		const nextSelections = { ...avatarImportSelections };
		const nextQueries = { ...avatarImportSelectionQueries };
		for (const item of avatarImportItems) {
			nextSelections[item.id] = '';
			nextQueries[item.id] = '';
		}
		avatarImportSelections = nextSelections;
		avatarImportSelectionQueries = nextQueries;
	}

	function formatAvatarImportStudentLabel(student: Student): string {
		return student.studentCode ? `${student.studentCode} • ${student.fullName}` : student.fullName;
	}

	function handleAvatarSelectionInput(itemId: string, value: string) {
		const nextQueries = { ...avatarImportSelectionQueries, [itemId]: value };
		avatarImportSelectionQueries = nextQueries;

		const currentSelectionId = avatarImportSelections[itemId];
		if (!currentSelectionId) return;

		const selectedStudent = students.find((student) => student.id === currentSelectionId);
		if (!selectedStudent) {
			avatarImportSelections = { ...avatarImportSelections, [itemId]: '' };
			return;
		}

		if (formatAvatarImportStudentLabel(selectedStudent) !== value) {
			avatarImportSelections = { ...avatarImportSelections, [itemId]: '' };
		}
	}

	function chooseAvatarImportStudent(itemId: string, student: Student) {
		avatarImportSelections = { ...avatarImportSelections, [itemId]: student.id };
		avatarImportSelectionQueries = {
			...avatarImportSelectionQueries,
			[itemId]: formatAvatarImportStudentLabel(student)
		};
	}

	function clearAvatarImportStudentSelection(itemId: string) {
		avatarImportSelections = { ...avatarImportSelections, [itemId]: '' };
		avatarImportSelectionQueries = { ...avatarImportSelectionQueries, [itemId]: '' };
	}

	function openAvatarPreview(url: string, title: string) {
		if (!url) return;
		avatarPreviewUrl = url;
		avatarPreviewTitle = title;
		isAvatarPreviewModalOpen = true;
	}

	function closeAvatarPreview() {
		isAvatarPreviewModalOpen = false;
		avatarPreviewUrl = '';
		avatarPreviewTitle = '';
	}

	async function refreshVisibleAvatarPreviews() {
		const studentIds = paginatedStudents.map((student) => student.id);
		if (studentIds.length === 0) {
			avatarUrls = {};
			return;
		}

		avatarUrls = await loadStudentAvatarPreviewMap(studentIds);
	}
</script>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-8">
	<PageHeader
		eyebrow="Management"
		title="Students"
		description="Manage students, assign clubs, and track current belt ranks."
	/>

	<SectionCard title="Student list">
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
				icon="icon-[mdi--image-multiple-outline]"
				label="Import avatars"
				onclick={openAvatarImportModal}
				tooltipText={{ text: 'Import avatars', placement: 'bottom' }}
			/>
			<IconActionButton
				icon="icon-[mdi--plus]"
				label="Add student"
				variant="primary"
				onclick={openCreateModal}
				tooltipText={{ text: 'Add student', placement: 'bottom' }}
			/>
		{/snippet}

		<DataTableToolbar
			bind:searchValue={search}
			searchPlaceholder="Search by student, club, belt rank"
		>
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
		</DataTableToolbar>

		{#if selectableFilteredStudents.length > 0}
			<div
				class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
			>
				<div class="flex flex-wrap items-center gap-3">
					<label class="flex items-center gap-2 text-sm text-slate-700">
						<input
							type="checkbox"
							class="h-4 w-4 rounded-md border-slate-300"
							checked={allFilteredStudentsSelected}
							onchange={toggleSelectAllFilteredStudents}
						/>
						<span>Select all filtered</span>
					</label>
					<span class="text-sm text-slate-500">
						{selectedStudentCount} selected
					</span>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<button
						class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
						type="button"
						onclick={clearStudentSelection}
						disabled={selectedStudentCount === 0}
					>
						Clear selection
					</button>
					<button
						class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
						type="button"
						onclick={openBulkActionModal}
						disabled={selectedStudentCount === 0}
					>
						Bulk actions
					</button>
				</div>
			</div>
		{/if}

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
					{#if student.deletedAt}
						<div
							class={`rounded-xl border p-4 ${
								isStudentSelected(student.id)
									? 'border-slate-900 bg-slate-100'
									: 'border-slate-200 bg-slate-50'
							}`}
						>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<input
										type="checkbox"
										class="h-4 w-4 shrink-0 rounded-md border-slate-300"
										checked={isStudentSelected(student.id)}
										disabled={true}
									/>
									<StudentAvatarThumb name={student.fullName} src={avatarUrls[student.id]} />
									<h3 class="min-w-0 truncate font-semibold text-slate-900">{student.fullName}</h3>
								</div>
								<div class="space-y-1 text-sm">
									<p class="flex items-center gap-2 text-slate-500">
										<span class="icon-[mdi--card-account-details-outline] h-4 w-4 shrink-0"></span>
										<span class="truncate">{student.studentCode ?? 'Generated on sync'}</span>
									</p>
									<p class="flex items-center gap-2 text-slate-600">
										<span class="icon-[mdi--account-group-outline] h-4 w-4 shrink-0"></span>
										<span class="truncate">
											{clubMap.get(student.clubId) ?? '-'}{#if student.groupId}
												• {groupMap.get(student.groupId) ?? '-'}{/if} • {beltRankMap.get(
												student.beltRankId
											) ?? '-'}
										</span>
									</p>
									<p class="flex items-center gap-2 text-slate-500">
										<span class="icon-[mdi--calendar-week-outline] h-4 w-4 shrink-0"></span>
										<span class="truncate"
											>{getStudentScheduleSummary(student.id, student.clubId)}</span
										>
									</p>
									<p class="flex items-center gap-2 text-slate-600">
										<span class="icon-[mdi--sync-alert] h-4 w-4 shrink-0"></span>
										<span class="truncate">
											{student.syncStatus === 'failed' ? 'Delete failed' : 'Pending delete'}
										</span>
									</p>
								</div>
								<div class="flex justify-end gap-2 pt-1">
									<IconActionButton
										icon="icon-[mdi--restore]"
										label={`Restore ${student.fullName}`}
										onclick={(event) => {
											event.stopPropagation();
											void handleRestore(student.id);
										}}
									/>
								</div>
							</div>
						</div>
					{:else}
						<div
							class={`rounded-xl border p-4 ${
								isStudentSelected(student.id)
									? 'border-slate-900 bg-slate-100'
									: 'border-slate-200 bg-slate-50'
							} cursor-pointer`}
							role="button"
							tabindex="0"
							onclick={() => toggleStudentSelection(student.id)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									toggleStudentSelection(student.id);
								}
							}}
						>
							<div class="space-y-3">
								<div class="flex items-center gap-3">
									<input
										type="checkbox"
										class="h-4 w-4 shrink-0 rounded-md border-slate-300"
										checked={isStudentSelected(student.id)}
										disabled={false}
										onclick={(event) => event.stopPropagation()}
										onchange={() => toggleStudentSelection(student.id)}
									/>
									<StudentAvatarThumb name={student.fullName} src={avatarUrls[student.id]} />
									<h3 class="min-w-0 truncate font-semibold text-slate-900">{student.fullName}</h3>
								</div>
								<div class="space-y-1 text-sm">
									<p class="flex items-center gap-2 text-slate-500">
										<span class="icon-[mdi--card-account-details-outline] h-4 w-4 shrink-0"></span>
										<span class="truncate">{student.studentCode ?? 'Generated on sync'}</span>
									</p>
									<p class="flex items-center gap-2 text-slate-600">
										<span class="icon-[mdi--account-group-outline] h-4 w-4 shrink-0"></span>
										<span class="truncate">
											{clubMap.get(student.clubId) ?? '-'}{#if student.groupId}
												• {groupMap.get(student.groupId) ?? '-'}{/if} • {beltRankMap.get(
												student.beltRankId
											) ?? '-'}
										</span>
									</p>
									<p class="flex items-center gap-2 text-slate-500">
										<span class="icon-[mdi--calendar-week-outline] h-4 w-4 shrink-0"></span>
										<span class="truncate"
											>{getStudentScheduleSummary(student.id, student.clubId)}</span
										>
									</p>
									<p class="flex items-center gap-2 text-slate-600">
										<span class="icon-[mdi--account-check-outline] h-4 w-4 shrink-0"></span>
										<span class="truncate">{student.status}</span>
									</p>
								</div>
								<div class="flex justify-end gap-2 pt-1">
									<IconActionButton
										icon="icon-[mdi--pencil-outline]"
										label={`Edit ${student.fullName}`}
										onclick={(event) => {
											event.stopPropagation();
											startEdit(student);
										}}
									/>
									<IconActionButton
										icon="icon-[mdi--delete-outline]"
										label={`Delete ${student.fullName}`}
										variant="danger"
										onclick={(event) => {
											event.stopPropagation();
											void handleDelete(student.id);
										}}
									/>
								</div>
							</div>
						</div>
					{/if}
				{/each}
			</div>

			<div class="hidden overflow-x-auto md:block">
				<table class="min-w-full border-collapse text-sm">
					<thead>
						<tr class="border-b border-slate-200 text-left text-slate-600">
							<th class="py-2 pr-3">
								<input
									type="checkbox"
									class="h-4 w-4 rounded-md border-slate-300"
									checked={allFilteredStudentsSelected}
									onchange={toggleSelectAllFilteredStudents}
								/>
							</th>
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
							<tr
								class={`border-b border-slate-100 ${isStudentSelected(student.id) ? 'bg-slate-50' : ''} ${student.deletedAt ? '' : 'cursor-pointer'}`}
								onclick={() => !student.deletedAt && toggleStudentSelection(student.id)}
							>
								<td class="py-3 pr-3">
									<input
										type="checkbox"
										class="h-4 w-4 rounded-md border-slate-300"
										checked={isStudentSelected(student.id)}
										disabled={!!student.deletedAt}
										onclick={(event) => event.stopPropagation()}
										onchange={() => !student.deletedAt && toggleStudentSelection(student.id)}
									/>
								</td>
								<td class="py-3 pr-3">
									<div class="flex items-center gap-3">
										<StudentAvatarThumb
											name={student.fullName}
											src={avatarUrls[student.id]}
											sizeClass="size-9"
											textClass="text-xs"
										/>
										<span class="font-medium text-slate-900">{student.fullName}</span>
									</div>
								</td>
								<td class="py-3 pr-3 text-slate-700"
									>{student.studentCode ?? 'Generated on sync'}</td
								>
								<td class="py-3 pr-3 text-slate-700">{clubMap.get(student.clubId) ?? '-'}</td>
								<td class="py-3 pr-3 text-slate-700"
									>{groupMap.get(student.groupId ?? '') ?? '-'}</td
								>
								<td class="py-3 pr-3 text-slate-700"
									>{beltRankMap.get(student.beltRankId) ?? '-'}</td
								>
								<td class="py-3 pr-3 text-slate-700"
									>{getStudentScheduleSummary(student.id, student.clubId)}</td
								>
								<td class="py-3 pr-3 text-slate-700">
									{#if student.deletedAt}
										{student.syncStatus === 'failed' ? 'Delete failed' : 'Pending delete'}
									{:else}
										{student.status}
									{/if}
								</td>
								<td class="py-3 pr-0 pl-3 text-right">
									<div class="inline-flex gap-2">
										{#if student.deletedAt}
											<IconActionButton
												icon="icon-[mdi--restore]"
												label={`Restore ${student.fullName}`}
												onclick={(event) => {
													event.stopPropagation();
													void handleRestore(student.id);
												}}
											/>
										{:else}
											<IconActionButton
												icon="icon-[mdi--pencil-outline]"
												label={`Edit ${student.fullName}`}
												onclick={(event) => {
													event.stopPropagation();
													startEdit(student);
												}}
											/>
											<IconActionButton
												icon="icon-[mdi--delete-outline]"
												label={`Delete ${student.fullName}`}
												variant="danger"
												onclick={(event) => {
													event.stopPropagation();
													void handleDelete(student.id);
												}}
											/>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<DataPagination bind:currentPage totalItems={filteredStudents.length} {pageSize} />
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
				<span class="font-medium text-slate-900">beltRank</span>, and optional:
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
				Date fields must use <code>YYYY-MM-DD</code>. Leave <code>scheduleMode</code> empty to
				inherit the club schedule. Use comma-separated weekdays like <code>mon,wed,fri</code> for
				<code>scheduleDays</code>. If <code>studentCode</code> is blank, backend sync will generate it
				later.
			</p>
		</div>

		<label
			class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center"
		>
			<span class="icon-[mdi--file-excel-outline] h-8 w-8 text-slate-500"></span>
			<span class="text-sm font-medium text-slate-700"
				>{importFileName || 'Choose an Excel file (.xlsx, .xls)'}</span
			>
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
				<p class="text-xs tracking-[0.2em] text-slate-500 uppercase">Imported</p>
				<p class="mt-2 text-2xl font-semibold text-slate-900">
					{importSummary?.importedCount ?? 0}
				</p>
			</div>
			<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
				<p class="text-xs tracking-[0.2em] text-slate-500 uppercase">Errors</p>
				<p class="mt-2 text-2xl font-semibold text-slate-900">
					{importSummary?.errors.length ?? 0}
				</p>
			</div>
		</div>

		{#if importErrors.length === 0}
			<p
				class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
			>
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

<AppModal
	open={isAvatarImportModalOpen}
	title="Import avatars"
	onClose={closeAvatarImportModal}
	size="xl"
>
	{#if !avatarImportBatch}
		<form class="space-y-4" onsubmit={handleAvatarImportAnalyze}>
			<div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
				<p class="text-sm text-slate-700">
					Upload multiple avatar images. Backend will auto-match by
					<code>studentCode</code> first, then by normalized full name. You can review and adjust before
					confirming.
				</p>
				<div class="flex flex-wrap gap-2 pt-1">
					<label
						class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
					>
						<input type="radio" bind:group={avatarImportMatchMode} value="auto" />
						<span>Auto match</span>
					</label>
					<label
						class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
					>
						<input type="radio" bind:group={avatarImportMatchMode} value="manual" />
						<span>Manual match</span>
					</label>
				</div>
			</div>

			<label
				class={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition ${
					isAvatarImportDragActive
						? 'border-slate-900 bg-slate-100'
						: 'border-slate-300 bg-slate-50'
				}`}
				ondragenter={handleAvatarImportDragEnter}
				ondragover={handleAvatarImportDragOver}
				ondragleave={handleAvatarImportDragLeave}
				ondrop={handleAvatarImportDrop}
			>
				<span class="icon-[mdi--image-multiple-outline] h-8 w-8 text-slate-500"></span>
				<span class="text-sm font-medium text-slate-700">
					{avatarImportFileNames.length > 0
						? `${avatarImportFileNames.length} file(s) selected`
						: isAvatarImportDragActive
							? 'Drop image files here'
							: 'Choose image files or drag and drop'}
				</span>
				{#if avatarImportFileNames.length > 0}
					<span class="max-w-full truncate text-xs text-slate-500"
						>{avatarImportFileNames.join(', ')}</span
					>
				{/if}
				<input
					class="hidden"
					type="file"
					accept="image/jpeg,image/png,image/webp"
					multiple
					onchange={handleAvatarImportFileChange}
				/>
			</label>

			{#if avatarImportError}
				<p class="text-sm text-red-600">{avatarImportError}</p>
			{/if}

			<div class="flex justify-end gap-3">
				<button
					class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
					type="button"
					onclick={closeAvatarImportModal}
				>
					Cancel
				</button>
				<button
					class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
					type="submit"
					disabled={isAnalyzingAvatarImport}
				>
					{isAnalyzingAvatarImport ? 'Analyzing...' : 'Analyze files'}
				</button>
			</div>
		</form>
	{:else}
		<div class="space-y-4">
			<div class="grid gap-3 sm:grid-cols-4">
				<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
					<p class="text-xs tracking-[0.2em] text-slate-500 uppercase">Total</p>
					<p class="mt-2 text-2xl font-semibold text-slate-900">{avatarImportBatch.totalItems}</p>
				</div>
				<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
					<p class="text-xs tracking-[0.2em] text-slate-500 uppercase">Matched</p>
					<p class="mt-2 text-2xl font-semibold text-emerald-700">
						{avatarImportBatch.matchedItems}
					</p>
				</div>
				<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
					<p class="text-xs tracking-[0.2em] text-slate-500 uppercase">Ambiguous</p>
					<p class="mt-2 text-2xl font-semibold text-amber-700">
						{avatarImportBatch.ambiguousItems}
					</p>
				</div>
				<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
					<p class="text-xs tracking-[0.2em] text-slate-500 uppercase">Unmatched</p>
					<p class="mt-2 text-2xl font-semibold text-slate-700">
						{avatarImportBatch.unmatchedItems}
					</p>
				</div>
			</div>

			<div
				class="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
			>
				<div class="space-y-2">
					<p class="text-sm font-medium text-slate-700">Existing avatar strategy</p>
					<div class="flex flex-wrap gap-2">
						<label
							class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
						>
							<input type="radio" bind:group={avatarImportReplaceStrategy} value="replace" />
							<span>Replace existing avatars</span>
						</label>
						<label
							class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
						>
							<input type="radio" bind:group={avatarImportReplaceStrategy} value="keep" />
							<span>Keep existing and skip</span>
						</label>
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
						onclick={selectAllMatchedAvatarImports}
						disabled={avatarImportMatchMode === 'manual'}
					>
						Select all matched
					</button>
					<button
						type="button"
						class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
						onclick={clearAllAvatarImportSelections}
					>
						Clear all
					</button>
				</div>
			</div>

			<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
				<input
					type="search"
					class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
					placeholder="Search by file or student"
					bind:value={avatarImportSearch}
				/>
				<div class="flex flex-wrap gap-2">
					{#each [{ value: 'all', label: 'All', count: avatarImportItems.length }, { value: 'matched', label: 'Matched', count: getAvatarImportStatusCount('matched') }, { value: 'ambiguous', label: 'Ambiguous', count: getAvatarImportStatusCount('ambiguous') }, { value: 'unmatched', label: 'Unmatched', count: getAvatarImportStatusCount('unmatched') }, { value: 'failed', label: 'Failed', count: getAvatarImportStatusCount('failed') }, { value: 'skipped', label: 'Skipped', count: getAvatarImportStatusCount('skipped') }, { value: 'imported', label: 'Imported', count: getAvatarImportStatusCount('imported') }] as filterOption (filterOption.value)}
						<button
							type="button"
							class={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
								avatarImportFilter === filterOption.value
									? 'border-slate-900 bg-slate-900 text-white'
									: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
							}`}
							onclick={() => (avatarImportFilter = filterOption.value as typeof avatarImportFilter)}
						>
							{filterOption.label}
							{filterOption.count}
						</button>
					{/each}
				</div>
			</div>

			{#if avatarImportError}
				<p class="text-sm text-red-600">{avatarImportError}</p>
			{/if}

			<div class="max-h-[60dvh] space-y-3 overflow-y-auto pr-1">
				{#if filteredAvatarImportItems.length === 0}
					<p
						class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
					>
						No files match the current filter.
					</p>
				{/if}
				{#each filteredAvatarImportItems as item (item.id)}
					<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
						<div class="flex flex-col gap-4 md:flex-row">
							<div class="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-200">
								{#if item.previewUrl}
									<button
										type="button"
										class="h-full w-full"
										onclick={() => openAvatarPreview(item.previewUrl ?? '', item.originalFilename)}
									>
										<img
											class="h-full w-full object-cover"
											src={item.previewUrl}
											alt={item.originalFilename}
										/>
									</button>
								{/if}
							</div>
							<div class="min-w-0 flex-1 space-y-3">
								<div class="flex flex-wrap items-center gap-2">
									<p class="truncate text-sm font-semibold text-slate-900">
										{item.originalFilename}
									</p>
									<span
										class={`rounded-full border px-2.5 py-1 text-xs font-medium ${getAvatarImportStatusClass(item.status)}`}
									>
										{item.status}
									</span>
									{#if item.matchMethod}
										<span
											class="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600"
										>
											{item.matchMethod}
										</span>
									{/if}
								</div>
								{#if item.errorMessage}
									<p class="text-sm text-red-600">{item.errorMessage}</p>
								{/if}
								<p class="text-sm text-slate-600">
									Auto match:
									<span class="font-medium text-slate-800"
										>{item.guessedStudentName ?? 'No match'}</span
									>
								</p>
								<div class="relative space-y-2">
									<div class="flex gap-2">
										<div class="min-w-0 flex-1">
											<SuggestionInput
												value={avatarImportSelectionQueries[item.id] ?? ''}
												options={avatarImportStudentOptions}
												placeholder="Search student by code or name"
												disabled={item.status === 'failed' || item.status === 'imported'}
												maxSuggestions={5}
												emptyText="No student found."
												onInputChange={(nextValue) =>
													handleAvatarSelectionInput(item.id, nextValue)}
												onSelect={(option) => {
													const selectedStudent = students.find(
														(student) => student.id === option.id
													);
													if (selectedStudent) {
														chooseAvatarImportStudent(item.id, selectedStudent);
													}
												}}
											/>
										</div>
										<button
											type="button"
											class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
											disabled={item.status === 'failed' || item.status === 'imported'}
											onclick={() => clearAvatarImportStudentSelection(item.id)}
										>
											Skip
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="flex justify-end gap-3">
				<button
					class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
					type="button"
					onclick={closeAvatarImportModal}
				>
					Close
				</button>
				<button
					class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
					type="button"
					onclick={() => void handleAvatarImportConfirm()}
					disabled={isConfirmingAvatarImport || selectedAvatarImportCount === 0}
				>
					{isConfirmingAvatarImport
						? 'Confirming...'
						: `Confirm import (${selectedAvatarImportCount})`}
				</button>
			</div>
		</div>
	{/if}
</AppModal>

<ImagePreviewModal
	open={isAvatarPreviewModalOpen}
	src={avatarPreviewUrl}
	title={avatarPreviewTitle || 'Avatar preview'}
	onClose={closeAvatarPreview}
/>

<AppModal open={isBulkActionModalOpen} title="Bulk update students" onClose={closeBulkActionModal}>
	<div class="space-y-5 p-1">
		<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
			Applying changes to <span class="font-semibold text-slate-900">{selectedStudentCount}</span> selected
			student(s).
		</div>

		<div class="mb-2 space-y-1">
			<span class="text-sm font-medium text-slate-700">Action</span>
			<select class="w-full rounded-lg border border-slate-300" bind:value={bulkActionType}>
				<option value="delete">Delete selected students</option>
				<option value="beltRank">Update belt rank</option>
				<option value="schedule">Update schedule</option>
				<option value="status">Update status</option>
				<option value="group">Update group</option>
				<option value="club">Update club</option>
			</select>
		</div>

		{#if bulkActionType === 'beltRank'}
			<div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
				<label class="space-y-1">
					<span class="text-sm font-medium text-slate-700">Belt rank</span>
					<select class="w-full rounded-lg border border-slate-300" bind:value={bulkBeltRankId}>
						<option value="">Select belt rank</option>
						{#each assignableBeltRanks as beltRank (beltRank.id)}
							<option value={beltRank.id}>{beltRank.name}</option>
						{/each}
					</select>
				</label>
			</div>
		{/if}

		{#if bulkActionType === 'status'}
			<div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
				<label class="space-y-1">
					<span class="text-sm font-medium text-slate-700">Status</span>
					<select class="w-full rounded-lg border border-slate-300" bind:value={bulkStatus}>
						{#each statusOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			</div>
		{/if}

		{#if bulkActionType === 'group'}
			<div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
				<p class="text-sm text-slate-600">
					{#if singleSelectedClubId}
						Update group for students in
						<span class="font-medium text-slate-900"
							>{clubMap.get(singleSelectedClubId) ?? 'selected club'}</span
						>.
					{:else}
						All selected students must belong to the same club to change group.
					{/if}
				</p>
				<select
					class="w-full rounded-lg border border-slate-300"
					bind:value={bulkGroupId}
					disabled={!singleSelectedClubId}
				>
					<option value="">No group</option>
					{#each bulkGroupOptions as group (group.id)}
						<option value={group.id}>{group.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		{#if bulkActionType === 'club'}
			<div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
				<label class="space-y-1">
					<span class="text-sm font-medium text-slate-700">Club</span>
					<select class="w-full rounded-lg border border-slate-300" bind:value={bulkClubId}>
						<option value="">Select club</option>
						{#each assignableClubs as club (club.id)}
							<option value={club.id}>{club.name}</option>
						{/each}
					</select>
				</label>
				<p class="text-xs text-slate-500">
					Changing club will clear group and reset schedule to inherit from the new club.
				</p>
			</div>
		{/if}

		{#if bulkActionType === 'schedule'}
			<div class="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
				<div class="flex flex-wrap gap-3">
					<label
						class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
					>
						<input type="radio" bind:group={bulkScheduleMode} value="inherit" />
						<span>Inherit club schedule</span>
					</label>
					<label
						class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
					>
						<input type="radio" bind:group={bulkScheduleMode} value="custom" />
						<span>Custom schedule</span>
					</label>
				</div>

				{#if bulkScheduleMode === 'custom'}
					<p class="text-sm text-slate-600">
						{#if singleSelectedClubId}
							Choose training days within
							<span class="font-medium text-slate-900"
								>{clubMap.get(singleSelectedClubId) ?? 'selected club'}</span
							>.
						{:else}
							All selected students must belong to the same club to apply a custom schedule.
						{/if}
					</p>
					<div class="flex flex-wrap gap-2">
						{#each [{ value: 'mon', label: 'Mon' }, { value: 'tue', label: 'Tue' }, { value: 'wed', label: 'Wed' }, { value: 'thu', label: 'Thu' }, { value: 'fri', label: 'Fri' }, { value: 'sat', label: 'Sat' }, { value: 'sun', label: 'Sun' }] as weekdayOption (weekdayOption.value)}
							<button
								type="button"
								class={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
									bulkScheduleDays.includes(weekdayOption.value as Weekday)
										? 'border-slate-900 bg-slate-900 text-white'
										: 'border-slate-300 bg-white text-slate-700'
								}`}
								disabled={!bulkScheduleAvailableDays.includes(weekdayOption.value as Weekday)}
								onclick={() => toggleBulkScheduleDay(weekdayOption.value as Weekday)}
							>
								{weekdayOption.label}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if bulkActionType === 'delete'}
			<p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				This will soft delete all selected students.
			</p>
		{/if}

		{#if bulkActionError}
			<p class="text-sm text-red-600">{bulkActionError}</p>
		{/if}

		<div class="flex justify-end gap-3">
			<button
				class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
				type="button"
				onclick={closeBulkActionModal}
			>
				Cancel
			</button>
			<button
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
				type="button"
				onclick={() => void handleBulkActionApply()}
				disabled={isApplyingBulkAction}
			>
				{isApplyingBulkAction ? 'Applying...' : 'Apply'}
			</button>
		</div>
	</div>
</AppModal>

<StudentFormModal
	open={isModalOpen}
	title={editingId ? 'Edit student' : 'Create student'}
	studentId={editingId}
	bind:form
	{errors}
	bind:selectedCustomScheduleDays
	availableClubs={assignableClubs}
	availableGroups={assignableGroups}
	availableBeltRanks={assignableBeltRanks}
	{availableClubTrainingDays}
	onClose={closeModal}
	onSubmit={() => void handleSubmit()}
	submitLabel={editingId ? 'Update student' : 'Create student'}
	{isSubmitting}
	showScheduleSection={true}
	showClubSelector={true}
	showStatusField={!!editingId}
	studentCodeDisplay={editingId ? form.studentCode || 'Generated on sync' : 'Generated on sync'}
	statusOptions={[...statusOptions]}
/>
