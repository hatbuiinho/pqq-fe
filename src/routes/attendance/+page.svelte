<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AppDatePicker,
		AppModal,
		EmptyState,
		IconActionButton,
		loadStudentAvatarPreviewMap,
		PageHeader,
		SectionCard,
		StudentAvatarThumb,
		StudentFormModal,
		getTodayIsoDate,
		normalizeDateInput,
		subscribeDataChanged,
		tooltip
	} from '$lib';
	import {
		attendanceUseCases,
		beltRankUseCases,
		clubGroupUseCases,
		clubScheduleUseCases,
		clubUseCases,
		studentScheduleUseCases,
		studentUseCases
	} from '$lib/app/services';
	import { toastError, toastSuccess } from '$lib/app/toast';
	import { normalizeSearchText } from '$lib/domain/string-utils';
	import { validateStudentForm } from '$lib/domain/student-form-validation';
	import type { StudentFormErrors, StudentFormValue } from '$lib/ui/components/student-form';
	import type {
		AttendanceRecord,
		AttendanceSession,
		AttendanceStatus,
		BeltRank,
		Club,
		ClubGroup,
		Gender,
		ClubSchedule,
		Weekday,
		Student
	} from '$lib/domain/models';

	type AttendanceItem = {
		student: Student;
		record: AttendanceRecord;
	};

	type SummaryItem = {
		label: string;
		value: number;
		tone: string;
		icon: string;
		bgClass: string;
	};

	type SessionFormErrors = Partial<Record<'clubId' | 'sessionDate', string>>;

	function formatDateLabel(value: string): string {
		const date = new Date(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleDateString();
	}

	function formatWeekdayLabel(value: string): string {
		const date = new Date(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleDateString(undefined, { weekday: 'short' });
	}

	function createInitialStudentDetailForm(): StudentFormValue {
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
			joinedAt: '',
			status: 'active',
			notes: ''
		};
	}

	const attendanceStatuses: Array<{
		label: string;
		value: AttendanceStatus;
		icon: string;
		activeClass: string;
		inactiveClass: string;
	}> = [
		{
			label: 'Present',
			value: 'present',
			icon: 'icon-[mdi--check]',
			activeClass: 'border-emerald-600 bg-emerald-600 text-white',
			inactiveClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300'
		},
		{
			label: 'Late',
			value: 'late',
			icon: 'icon-[mdi--clock-outline]',
			activeClass: 'border-amber-500 bg-amber-500 text-white',
			inactiveClass: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300'
		},
		{
			label: 'Excused',
			value: 'excused',
			icon: 'icon-[mdi--email-outline]',
			activeClass: 'border-sky-600 bg-sky-600 text-white',
			inactiveClass: 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300'
		},
		{
			label: 'Absent',
			value: 'absent',
			icon: 'icon-[mdi--close]',
			activeClass: 'border-rose-600 bg-rose-600 text-white',
			inactiveClass: 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300'
		}
	];

	let clubs = $state<Club[]>([]);
	let clubGroups = $state<ClubGroup[]>([]);
	let clubSchedules = $state<ClubSchedule[]>([]);
	let beltRanks = $state<BeltRank[]>([]);
	let sessions = $state<AttendanceSession[]>([]);
	let attendanceRecords = $state<AttendanceRecord[]>([]);
	let selectedSessionId = $state('');
	let session = $state<AttendanceSession | null>(null);
	let sessionClub = $state<Club | null>(null);
	let items = $state<AttendanceItem[]>([]);
	let sessionSearch = $state('');
	let sessionDateFilter = $state('');
	let studentSearch = $state('');
	let selectedGroupId = $state('');
	let selectedGender = $state<Gender | ''>('');
	let selectedBeltRankId = $state('');
	let setupClubId = $state('');
	let setupDate = $state(getTodayIsoDate());
	let setupNotes = $state('');
	let isSetupModalOpen = $state(false);
	let formErrors = $state<SessionFormErrors>({});
	let isBootstrapping = $state(false);
	let isLoadingDetail = $state(false);
	let isCreating = $state(false);
	let isApplyingBulk = $state(false);
	let isChangingStatus = $state(false);
	let isTogglingSessionStatus = $state(false);
	let isDeletingSession = $state(false);
	let isSavingSessionNotes = $state(false);
	let isStudentNoteModalOpen = $state(false);
	let isSavingStudentNote = $state(false);
	let isDeleteConfirmOpen = $state(false);
	let deleteTargetSessionId = $state('');
	let showMobileDetail = $state(false);
	let suppressLocalRefresh = $state(false);
	let sessionNoteDraft = $state('');
	let selectedStudentNoteId = $state('');
	let selectedStudentNoteName = $state('');
	let studentNoteDraft = $state('');
	let isStudentDetailModalOpen = $state(false);
	let isSavingStudentDetail = $state(false);
	let selectedStudentDetailId = $state('');
	let selectedStudentDetailCode = $state('');
	let studentDetailForm = $state<StudentFormValue>(createInitialStudentDetailForm());
	let studentDetailErrors = $state<StudentFormErrors>({});
	let studentDetailCustomScheduleDays = $state<Weekday[]>([]);
	let avatarUrls = $state<Record<string, string>>({});

	const studentStatusOptions = [
		{ label: 'Active', value: 'active' },
		{ label: 'Inactive', value: 'inactive' },
		{ label: 'Suspended', value: 'suspended' }
	] as const;

	const clubMap = $derived.by(() => new Map(clubs.map((club) => [club.id, club])));
	const groupMap = $derived.by(() => new Map(clubGroups.map((group) => [group.id, group.name])));
	const beltRankMap = $derived.by(
		() => new Map(beltRanks.map((beltRank) => [beltRank.id, beltRank.name]))
	);
	const availableClubs = $derived.by(() =>
		clubs.filter((club) => !club.deletedAt && club.isActive && club.syncStatus === 'synced')
	);
	const availableGroupsForSession = $derived.by(() => {
		if (!sessionClub) return [];
		const currentSessionClub = sessionClub;
		return clubGroups.filter(
			(group) =>
				!group.deletedAt &&
				group.isActive &&
				group.syncStatus === 'synced' &&
				group.clubId === currentSessionClub.id
		);
	});
	const clubScheduleMap = $derived.by(() => {
		const map = new Map<string, Weekday[]>();
		for (const schedule of clubSchedules) {
			if (schedule.deletedAt || !schedule.isActive) continue;
			const existing = map.get(schedule.clubId) ?? [];
			existing.push(schedule.weekday);
			map.set(schedule.clubId, existing);
		}
		return map;
	});
	const availableStudentDetailGroups = $derived.by(() => {
		if (!sessionClub) return [];
		return availableGroupsForSession;
	});
	const availableStudentDetailTrainingDays = $derived.by(() =>
		studentDetailForm.clubId ? (clubScheduleMap.get(studentDetailForm.clubId) ?? []) : []
	);
	const availableBeltRanksForSession = $derived.by(() => {
		const beltRankIds = new Set(items.map((item) => item.student.beltRankId).filter(Boolean));
		return beltRanks.filter((beltRank) => !beltRank.deletedAt && beltRankIds.has(beltRank.id));
	});
	const assignableBeltRanks = $derived.by(() =>
		beltRanks.filter(
			(beltRank) => !beltRank.deletedAt && beltRank.syncStatus === 'synced' && beltRank.isActive
		)
	);
	const filteredSessions = $derived.by(() => {
		const query = normalizeSearchText(sessionSearch);
		const dateFilter = sessionDateFilter;
		if (!query && !dateFilter) return sessions;

		return sessions.filter((sessionItem) => {
			const clubName = clubMap.get(sessionItem.clubId)?.name ?? '';
			const matchesQuery =
				!query ||
				normalizeSearchText(clubName).includes(query) ||
				normalizeSearchText(sessionItem.sessionDate).includes(query);
			const matchesDate = !dateFilter || sessionItem.sessionDate === dateFilter;
			return matchesQuery && matchesDate;
		});
	});
	const filteredItems = $derived.by(() => {
		const query = normalizeSearchText(studentSearch);
		return items.filter(({ student }) => {
			const beltRankName = beltRankMap.get(student.beltRankId) ?? '';
			const groupName = groupMap.get(student.groupId ?? '') ?? '';
			const matchesQuery =
				!query ||
				normalizeSearchText(student.fullName).includes(query) ||
				normalizeSearchText(student.studentCode ?? '').includes(query) ||
				normalizeSearchText(beltRankName).includes(query) ||
				normalizeSearchText(groupName).includes(query);
			const matchesGroup = !selectedGroupId || student.groupId === selectedGroupId;
			const matchesGender = !selectedGender || student.gender === selectedGender;
			const matchesBeltRank = !selectedBeltRankId || student.beltRankId === selectedBeltRankId;

			return matchesQuery && matchesGroup && matchesGender && matchesBeltRank;
		});
	});
	const summary = $derived.by<SummaryItem[]>(() => {
		const counts = {
			unmarked: items.filter((item) => item.record.attendanceStatus === 'unmarked').length,
			present: items.filter((item) => item.record.attendanceStatus === 'present').length,
			late: items.filter((item) => item.record.attendanceStatus === 'late').length,
			excused: items.filter((item) => item.record.attendanceStatus === 'excused').length,
			absent: items.filter((item) => item.record.attendanceStatus === 'absent').length
		};

		return [
			{
				label: 'Present',
				value: counts.present,
				tone: 'text-emerald-700',
				icon: 'icon-[mdi--check-circle-outline]',
				bgClass: 'bg-emerald-50 border-emerald-200'
			},
			{
				label: 'Late',
				value: counts.late,
				tone: 'text-amber-700',
				icon: 'icon-[mdi--clock-outline]',
				bgClass: 'bg-amber-50 border-amber-200'
			},
			{
				label: 'Excused',
				value: counts.excused,
				tone: 'text-sky-700',
				icon: 'icon-[mdi--email-outline]',
				bgClass: 'bg-sky-50 border-sky-200'
			},
			{
				label: 'Absent',
				value: counts.absent,
				tone: 'text-rose-700',
				icon: 'icon-[mdi--close-circle-outline]',
				bgClass: 'bg-rose-50 border-rose-200'
			},
			{
				label: 'Unmarked',
				value: counts.unmarked,
				tone: 'text-slate-600',
				icon: 'icon-[mdi--help-circle-outline]',
				bgClass: 'bg-slate-50 border-slate-200'
			}
		];
	});
	const sessionStatsMap = $derived.by(() => {
		const map = new Map<
			string,
			{ present: number; late: number; excused: number; absent: number; unmarked: number }
		>();

		for (const record of attendanceRecords) {
			const current = map.get(record.sessionId) ?? {
				present: 0,
				late: 0,
				excused: 0,
				absent: 0,
				unmarked: 0
			};
			current[record.attendanceStatus] += 1;
			map.set(record.sessionId, current);
		}

		return map;
	});
	const hasClubs = $derived.by(() => availableClubs.length > 0);
	const isCompleted = $derived.by(() => session?.status === 'completed');

	onMount(() => {
		void loadInitialData();

		return subscribeDataChanged((source) => {
			if (source === 'avatar' || source === 'avatar-sync') {
				void refreshVisibleAvatarPreviews();
				return;
			}
			if (source === 'attendance') return;
			if (source === 'local' && suppressLocalRefresh) {
				return;
			}
			void refreshCurrentView();
		});
	});

	$effect(() => {
		filteredItems;
		void refreshVisibleAvatarPreviews();
	});

	async function loadInitialData() {
		try {
			isBootstrapping = true;
			const [clubRows, clubGroupRows, beltRankRows, sessionRows, attendanceRecordRows] = await Promise.all([
				clubUseCases.list(),
				clubGroupUseCases.list(),
				beltRankUseCases.list(),
				attendanceUseCases.listSessions(),
				attendanceUseCases.listRecords()
			]);
			const clubScheduleRows = (
				await Promise.all(clubRows.map((club) => clubScheduleUseCases.listByClub(club.id)))
			).flat();

			clubs = clubRows;
			clubGroups = clubGroupRows;
			clubSchedules = clubScheduleRows;
			beltRanks = beltRankRows;
			sessions = sessionRows;
			attendanceRecords = attendanceRecordRows;

			const defaultClub =
				clubRows.find((club) => !club.deletedAt && club.isActive && club.syncStatus === 'synced') ??
				null;
			setupClubId = defaultClub?.id ?? '';
			setupNotes = '';
			selectedSessionId = sessionRows[0]?.id ?? '';
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to load attendance data.');
		} finally {
			isBootstrapping = false;
		}
		await loadSelectedSession();
	}

	async function refreshCurrentView() {
		const [clubRows, clubGroupRows, beltRankRows, sessionRows, attendanceRecordRows] = await Promise.all([
			clubUseCases.list(),
			clubGroupUseCases.list(),
			beltRankUseCases.list(),
			attendanceUseCases.listSessions(),
			attendanceUseCases.listRecords()
		]);
		const clubScheduleRows = (
			await Promise.all(clubRows.map((club) => clubScheduleUseCases.listByClub(club.id)))
		).flat();

		clubs = clubRows;
		clubGroups = clubGroupRows;
		clubSchedules = clubScheduleRows;
		beltRanks = beltRankRows;
		sessions = sessionRows;
		attendanceRecords = attendanceRecordRows;

		if (!setupClubId) {
			setupClubId = availableClubs[0]?.id ?? '';
		}

		if (
			selectedSessionId &&
			!sessionRows.some((sessionItem) => sessionItem.id === selectedSessionId)
		) {
			selectedSessionId = sessionRows[0]?.id ?? '';
		}

		if (!selectedSessionId && sessionRows.length > 0) {
			selectedSessionId = sessionRows[0].id;
		}

		await loadSelectedSession();
	}

	async function loadSelectedSession() {
		if (!selectedSessionId) {
			session = null;
			sessionClub = null;
			items = [];
			sessionNoteDraft = '';
			studentSearch = '';
			selectedGroupId = '';
			selectedGender = '';
			selectedBeltRankId = '';
			return;
		}

		try {
			isLoadingDetail = true;
			const details = await attendanceUseCases.getSessionDetails(selectedSessionId);
			session = details.session;
			sessionClub = details.club;
			items = details.items;
			sessionNoteDraft = details.session.notes ?? '';
			if (
				selectedGroupId &&
				!details.items.some((item) => item.student.groupId === selectedGroupId)
			) {
				selectedGroupId = '';
			}
			if (
				selectedBeltRankId &&
				!details.items.some((item) => item.student.beltRankId === selectedBeltRankId)
			) {
				selectedBeltRankId = '';
			}
		} catch (error) {
			session = null;
			sessionClub = null;
			items = [];
			sessionNoteDraft = '';
			toastError(error instanceof Error ? error.message : 'Failed to load attendance session.');
		} finally {
			isLoadingDetail = false;
		}
	}

	function openSetupModal() {
		formErrors = {};
		if (!setupClubId) {
			setupClubId = availableClubs[0]?.id ?? '';
		}
		setupDate = getTodayIsoDate();
		setupNotes = '';
		isSetupModalOpen = true;
	}

	function closeSetupModal() {
		isSetupModalOpen = false;
		formErrors = {};
	}

	function validateSetupForm(): boolean {
		const nextErrors: SessionFormErrors = {};

		if (!setupClubId) {
			nextErrors.clubId = 'Club is required.';
		}

		if (!setupDate) {
			nextErrors.sessionDate = 'Session date is required.';
		}

		formErrors = nextErrors;
		return Object.keys(nextErrors).length === 0;
	}

	async function handleCreateSession() {
		if (!validateSetupForm()) return;

		try {
			isCreating = true;
			const createdSession = await attendanceUseCases.createSession({
				clubId: setupClubId,
				sessionDate: setupDate,
				notes: setupNotes
			});
			closeSetupModal();
			await refreshCurrentView();
			selectedSessionId = createdSession.id;
			showMobileDetail = true;
			await loadSelectedSession();
			toastSuccess('Attendance session created.');
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to create attendance session.');
		} finally {
			isCreating = false;
		}
	}

	function handleCreateSessionSubmit(event: SubmitEvent) {
		event.preventDefault();
		void handleCreateSession();
	}

	async function handleMarkAllPresent() {
		if (!session) return;

		try {
			isApplyingBulk = true;
			suppressLocalRefresh = true;
			await attendanceUseCases.markAllPresent(session.id);
			applyMarkAllPresentLocally();
			toastSuccess('All students marked as present.');
		} catch (error) {
			toastError(
				error instanceof Error ? error.message : 'Failed to mark all students as present.'
			);
		} finally {
			suppressLocalRefresh = false;
			isApplyingBulk = false;
		}
	}

	async function handleSessionStatusToggle() {
		if (!session) return;

		try {
			isTogglingSessionStatus = true;
			suppressLocalRefresh = true;
			if (session.status === 'completed') {
				await attendanceUseCases.reopenSession(session.id);
				applySessionStatusLocally('draft');
				toastSuccess('Attendance session reopened.');
			} else {
				await attendanceUseCases.completeSession(session.id);
				applySessionStatusLocally('completed');
				toastSuccess('Attendance session completed.');
			}
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to update attendance session.');
		} finally {
			suppressLocalRefresh = false;
			isTogglingSessionStatus = false;
		}
	}

	async function handleDeleteSession(sessionId: string) {
		try {
			isDeletingSession = true;
			suppressLocalRefresh = true;
			await attendanceUseCases.deleteSession(sessionId);
			applyDeleteSessionLocally(sessionId);
			toastSuccess('Attendance session deleted.');
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to delete attendance session.');
		} finally {
			suppressLocalRefresh = false;
			isDeletingSession = false;
		}
	}

	async function handleSaveSessionNotes() {
		if (!session) return;

		try {
			isSavingSessionNotes = true;
			suppressLocalRefresh = true;
			await attendanceUseCases.updateSessionNotes(session.id, sessionNoteDraft);
			applySessionNotesLocally(sessionNoteDraft);
			toastSuccess('Session note updated.');
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to update session note.');
		} finally {
			suppressLocalRefresh = false;
			isSavingSessionNotes = false;
		}
	}

	function openDeleteConfirm(sessionId: string) {
		deleteTargetSessionId = sessionId;
		isDeleteConfirmOpen = true;
	}

	function closeDeleteConfirm() {
		deleteTargetSessionId = '';
		isDeleteConfirmOpen = false;
	}

	async function handleConfirmDeleteSession() {
		if (!deleteTargetSessionId) return;
		const targetId = deleteTargetSessionId;
		closeDeleteConfirm();
		await handleDeleteSession(targetId);
	}

	async function handleStatusChange(studentId: string, attendanceStatus: AttendanceStatus) {
		if (!session) return;

		try {
			isChangingStatus = true;
			suppressLocalRefresh = true;
			await attendanceUseCases.updateAttendance({
				sessionId: session.id,
				studentId,
				attendanceStatus
			});
			applyAttendanceStatusLocally(studentId, attendanceStatus);
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to update attendance status.');
		} finally {
			suppressLocalRefresh = false;
			isChangingStatus = false;
		}
	}

	function openStudentNoteModal(item: AttendanceItem) {
		selectedStudentNoteId = item.student.id;
		selectedStudentNoteName = item.student.fullName;
		studentNoteDraft = item.record.notes ?? '';
		isStudentNoteModalOpen = true;
	}

	function closeStudentNoteModal() {
		isStudentNoteModalOpen = false;
		selectedStudentNoteId = '';
		selectedStudentNoteName = '';
		studentNoteDraft = '';
	}

	async function openStudentDetailModal(item: AttendanceItem) {
		selectedStudentDetailId = item.student.id;
		selectedStudentDetailCode = item.student.studentCode ?? '';
		studentDetailErrors = {};
		studentDetailForm = {
			fullName: item.student.fullName,
			studentCode: item.student.studentCode ?? '',
			dateOfBirth: normalizeDateInput(item.student.dateOfBirth),
			gender: item.student.gender ?? '',
			phone: item.student.phone ?? '',
			email: item.student.email ?? '',
			address: item.student.address ?? '',
			clubId: item.student.clubId,
			groupId: item.student.groupId ?? '',
			beltRankId: item.student.beltRankId,
			scheduleMode: 'inherit',
			joinedAt: normalizeDateInput(item.student.joinedAt),
			status: item.student.status,
			notes: item.student.notes ?? ''
		};
		studentDetailCustomScheduleDays = await studentScheduleUseCases.getWeekdays(item.student.id);
		studentDetailForm.scheduleMode = await studentScheduleUseCases.getMode(item.student.id);
		isStudentDetailModalOpen = true;
	}

	function closeStudentDetailModal() {
		isStudentDetailModalOpen = false;
		selectedStudentDetailId = '';
		selectedStudentDetailCode = '';
		studentDetailForm = createInitialStudentDetailForm();
		studentDetailErrors = {};
		studentDetailCustomScheduleDays = [];
	}

	function validateStudentDetailForm(): boolean {
		const result = validateStudentForm(studentDetailForm, {
			requireClub: true,
			groups: availableStudentDetailGroups,
			availableClubTrainingDays: availableStudentDetailTrainingDays,
			selectedCustomScheduleDays: studentDetailCustomScheduleDays,
			joinedAtBeforeBirthMessage: 'Joined date must be on or after date of birth.',
			invalidPhoneMessage: 'Phone number is invalid.',
			invalidEmailMessage: 'Email is invalid.'
		});
		studentDetailForm = result.form;
		studentDetailErrors = result.errors;
		return Object.keys(result.errors).length === 0;
	}

	async function handleSaveStudentDetail() {
		if (!selectedStudentDetailId || !sessionClub) return;
		if (!validateStudentDetailForm()) return;

		try {
			isSavingStudentDetail = true;
			suppressLocalRefresh = true;
			await studentUseCases.update(selectedStudentDetailId, {
				fullName: studentDetailForm.fullName,
				dateOfBirth: studentDetailForm.dateOfBirth || undefined,
				gender: studentDetailForm.gender || undefined,
				phone: studentDetailForm.phone,
				email: studentDetailForm.email,
				address: studentDetailForm.address,
				clubId: sessionClub.id,
				groupId: studentDetailForm.groupId,
				beltRankId: studentDetailForm.beltRankId,
				joinedAt: studentDetailForm.joinedAt || undefined,
				status: studentDetailForm.status,
				notes: studentDetailForm.notes
			});
			await studentScheduleUseCases.save(
				selectedStudentDetailId,
				studentDetailForm.scheduleMode,
				studentDetailCustomScheduleDays
			);
			applyStudentDetailsLocally(selectedStudentDetailId, studentDetailForm);
			toastSuccess('Student updated.');
			closeStudentDetailModal();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to update student.');
		} finally {
			suppressLocalRefresh = false;
			isSavingStudentDetail = false;
		}
	}

	async function handleSaveStudentNote() {
		if (!session || !selectedStudentNoteId) return;

		try {
			isSavingStudentNote = true;
			suppressLocalRefresh = true;
			await attendanceUseCases.updateAttendance({
				sessionId: session.id,
				studentId: selectedStudentNoteId,
				attendanceStatus:
					items.find((item) => item.student.id === selectedStudentNoteId)?.record
						.attendanceStatus ?? 'unmarked',
				notes: studentNoteDraft
			});
			applyAttendanceNoteLocally(selectedStudentNoteId, studentNoteDraft);
			toastSuccess('Student note updated.');
			closeStudentNoteModal();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Failed to update student note.');
		} finally {
			suppressLocalRefresh = false;
			isSavingStudentNote = false;
		}
	}

	function selectSession(sessionId: string) {
		if (sessionId === selectedSessionId) {
			showMobileDetail = true;
			return;
		}
		selectedSessionId = sessionId;
		showMobileDetail = true;
		studentSearch = '';
		void loadSelectedSession();
	}

	function backToSessionList() {
		showMobileDetail = false;
	}

	function getStatusButtonClass(current: AttendanceStatus, value: AttendanceStatus): string {
		const option = attendanceStatuses.find((item) => item.value === value);
		if (!option) return '';
		return current === value ? option.activeClass : option.inactiveClass;
	}

	function getSessionStatusLabel(value?: AttendanceSession['status']): string {
		return value === 'completed' ? 'Completed' : 'Draft';
	}

	function applyAttendanceStatusLocally(studentId: string, attendanceStatus: AttendanceStatus) {
		const now = new Date().toISOString();
		items = items.map((item) =>
			item.student.id === studentId
				? {
						...item,
						record: {
							...item.record,
							attendanceStatus,
							checkInAt:
								attendanceStatus === 'present' || attendanceStatus === 'late' ? now : undefined,
							updatedAt: now,
							lastModifiedAt: now
						}
					}
				: item
		);
		attendanceRecords = attendanceRecords.map((record) =>
			record.sessionId === selectedSessionId && record.studentId === studentId
				? {
						...record,
						attendanceStatus,
						checkInAt: attendanceStatus === 'present' || attendanceStatus === 'late' ? now : undefined,
						updatedAt: now,
						lastModifiedAt: now,
						syncStatus: 'pending',
						syncError: undefined
					}
				: record
		);
	}

	function applyMarkAllPresentLocally() {
		const now = new Date().toISOString();
		items = items.map((item) => ({
			...item,
			record: {
				...item.record,
				attendanceStatus: 'present',
				checkInAt: now,
				updatedAt: now,
				lastModifiedAt: now
			}
		}));
		attendanceRecords = attendanceRecords.map((record) =>
			record.sessionId === selectedSessionId
				? {
						...record,
						attendanceStatus: 'present',
						checkInAt: now,
						updatedAt: now,
						lastModifiedAt: now,
						syncStatus: 'pending',
						syncError: undefined
					}
				: record
		);
	}

	function applyAttendanceNoteLocally(studentId: string, notes: string) {
		const now = new Date().toISOString();
		const normalizedNotes = notes.trim() || undefined;
		items = items.map((item) =>
			item.student.id === studentId
				? {
						...item,
						record: {
							...item.record,
							notes: normalizedNotes,
							updatedAt: now,
							lastModifiedAt: now
						}
					}
				: item
		);
		attendanceRecords = attendanceRecords.map((record) =>
			record.sessionId === selectedSessionId && record.studentId === studentId
				? {
						...record,
						notes: normalizedNotes,
						updatedAt: now,
						lastModifiedAt: now,
						syncStatus: 'pending',
						syncError: undefined
					}
				: record
		);
	}

	function applyStudentDetailsLocally(studentId: string, nextForm: StudentFormValue) {
		const normalizedDateOfBirth = nextForm.dateOfBirth || undefined;
		const normalizedJoinedAt = nextForm.joinedAt || undefined;
		const normalizedGroupId = nextForm.groupId || undefined;
		const normalizedPhone = nextForm.phone.trim() || undefined;
		const normalizedEmail = nextForm.email.trim() || undefined;
		const normalizedAddress = nextForm.address.trim() || undefined;
		const normalizedNotes = nextForm.notes.trim() || undefined;
		const now = new Date().toISOString();

		items = items.map((item) =>
			item.student.id === studentId
				? {
						...item,
						student: {
							...item.student,
							fullName: nextForm.fullName.trim(),
							dateOfBirth: normalizedDateOfBirth,
							gender: nextForm.gender || undefined,
							phone: normalizedPhone,
							email: normalizedEmail,
							address: normalizedAddress,
							groupId: normalizedGroupId,
							beltRankId: nextForm.beltRankId,
							joinedAt: normalizedJoinedAt,
							status: nextForm.status,
							notes: normalizedNotes,
							updatedAt: now,
							lastModifiedAt: now,
							syncStatus: 'pending',
							syncError: undefined
						}
					}
				: item
		);
	}

	function applySessionStatusLocally(status: AttendanceSession['status']) {
		if (!session) return;
		const currentSession = session;

		const now = new Date().toISOString();
		session = {
			...currentSession,
			status,
			updatedAt: now,
			lastModifiedAt: now
		};
		sessions = sessions.map((sessionItem) =>
			sessionItem.id === currentSession.id
				? {
						...sessionItem,
						status,
						updatedAt: now,
						lastModifiedAt: now
					}
				: sessionItem
		);
	}

	function applySessionNotesLocally(notes: string) {
		if (!session) return;
		const currentSession = session;
		const normalizedNotes = notes.trim() || undefined;
		const now = new Date().toISOString();
		session = {
			...currentSession,
			notes: normalizedNotes,
			updatedAt: now,
			lastModifiedAt: now
		};
		sessions = sessions.map((sessionItem) =>
			sessionItem.id === currentSession.id
				? {
						...sessionItem,
						notes: normalizedNotes,
						updatedAt: now,
						lastModifiedAt: now
					}
				: sessionItem
		);
		sessionNoteDraft = normalizedNotes ?? '';
	}

	function applyDeleteSessionLocally(sessionId: string) {
		sessions = sessions.filter((sessionItem) => sessionItem.id !== sessionId);
		attendanceRecords = attendanceRecords.filter((record) => record.sessionId !== sessionId);
		if (selectedSessionId === sessionId) {
			selectedSessionId = sessions[0]?.id ?? '';
			showMobileDetail = false;
			session = null;
			sessionClub = null;
			items = [];
			sessionNoteDraft = '';
			studentSearch = '';
			selectedGroupId = '';
			selectedGender = '';
			selectedBeltRankId = '';
			if (selectedSessionId) {
				void loadSelectedSession();
			}
		}
	}

	async function refreshVisibleAvatarPreviews() {
		const studentIds = filteredItems.map((item) => item.student.id);
		if (studentIds.length === 0) {
			avatarUrls = {};
			return;
		}

		avatarUrls = await loadStudentAvatarPreviewMap(studentIds);
	}
</script>

<main class="mx-auto max-w-7xl space-y-8 px-4 py-8">
	<PageHeader eyebrow="Attendance" title="Daily attendance" description="">
		{#snippet actions()}
			<IconActionButton
				icon="icon-[mdi--plus]"
				label="Add attendance session"
				variant="primary"
				onclick={openSetupModal}
				tooltipText={{ text: 'Add attendance session', placement: 'bottom' }}
			/>
			{#if showMobileDetail}
				<div class="xl:hidden">
					<IconActionButton
						icon="icon-[mdi--arrow-left]"
						label="Back to sessions"
						onclick={backToSessionList}
					/>
				</div>
			{/if}
		{/snippet}
	</PageHeader>

	<section class="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
		<div class:hidden={showMobileDetail} class:xl:block={showMobileDetail}>
			<SectionCard
				title="Sessions"
				description="Newest sessions appear first. Click one to view detail."
			>
				<div class="space-y-4">
					<div class="grid gap-2 sm:grid-cols-2">
						<input
							type="search"
							class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
							placeholder="Search by club or date"
							bind:value={sessionSearch}
						/>
						<AppDatePicker bind:value={sessionDateFilter} placeholder="Filter by date" />
					</div>

					{#if !hasClubs}
						<EmptyState
							title="No clubs available"
							description="Create and sync at least one active club before creating attendance sessions."
						/>
					{:else if filteredSessions.length === 0}
						<EmptyState
							title="No attendance sessions yet"
							description="Use the add button to create the first session for a club."
						/>
					{:else}
						<div class="space-y-3">
							{#each filteredSessions as sessionItem (sessionItem.id)}
								{@const club = clubMap.get(sessionItem.clubId)}
								{@const sessionStats = sessionStatsMap.get(sessionItem.id)}
								<button
									type="button"
									class={`w-full rounded-2xl border px-4 py-4 text-left transition ${
										selectedSessionId === sessionItem.id
											? 'border-slate-900 bg-slate-900 text-white shadow-sm'
											: 'border-slate-200 bg-slate-50/70 text-slate-900 hover:border-slate-300 hover:bg-slate-50'
									}`}
									onclick={() => selectSession(sessionItem.id)}
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<p class="truncate text-base font-semibold">
												{club?.name ?? 'Unknown club'}
											</p>
											<p
												class={`mt-1 text-sm ${selectedSessionId === sessionItem.id ? 'text-white/75' : 'text-slate-500'}`}
											>
												{formatWeekdayLabel(sessionItem.sessionDate)} • {formatDateLabel(sessionItem.sessionDate)}
											</p>
											{#if sessionItem.notes}
												<p
													class={`mt-2 line-clamp-2 text-sm ${
														selectedSessionId === sessionItem.id ? 'text-white/70' : 'text-slate-600'
													}`}
												>
													{sessionItem.notes}
												</p>
											{/if}
											{#if sessionStats}
												<div class="mt-3 flex flex-wrap gap-1.5">
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-emerald-500/15 text-emerald-100'
																: 'border border-emerald-200 bg-emerald-50 text-emerald-700'
														}`}
													>
														P {sessionStats.present}
													</span>
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-amber-500/15 text-amber-100'
																: 'border border-amber-200 bg-amber-50 text-amber-700'
														}`}
													>
														L {sessionStats.late}
													</span>
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-sky-500/15 text-sky-100'
																: 'border border-sky-200 bg-sky-50 text-sky-700'
														}`}
													>
														E {sessionStats.excused}
													</span>
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-rose-500/15 text-rose-100'
																: 'border border-rose-200 bg-rose-50 text-rose-700'
														}`}
													>
														A {sessionStats.absent}
													</span>
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-white/12 text-white/80'
																: 'border border-slate-200 bg-slate-50 text-slate-600'
														}`}
													>
														U {sessionStats.unmarked}
													</span>
												</div>
											{/if}
										</div>
										<span
											class={`rounded-full px-2.5 py-1 text-xs font-medium ${
												selectedSessionId === sessionItem.id
													? 'bg-white/14 text-white'
													: sessionItem.status === 'completed'
														? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
														: 'border border-amber-200 bg-amber-50 text-amber-700'
											}`}
										>
											{getSessionStatusLabel(sessionItem.status)}
										</span>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</SectionCard>
		</div>

		{#if isLoadingDetail}
			<div class:hidden={!showMobileDetail} class:xl:block={!showMobileDetail}>
				<SectionCard title="Session detail" description="Loading selected session">
					<p class="text-sm text-slate-500">Loading attendance detail...</p>
				</SectionCard>
			</div>
		{:else if session && sessionClub}
			{@const currentSession = session}
			<section
				class:hidden={!showMobileDetail}
				class:xl:block={!showMobileDetail}
				class="space-y-6"
			>
				<SectionCard
					title={sessionClub.name}
					description={`Attendance for ${formatDateLabel(currentSession.sessionDate)}`}
				>
					{#snippet actions()}
						<div class="flex flex-wrap items-center gap-2">
							<span
								class={`rounded-full px-3 py-1 text-sm font-medium ${
									currentSession.status === 'completed'
										? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
										: 'border border-amber-200 bg-amber-50 text-amber-700'
								}`}
							>
								{getSessionStatusLabel(currentSession.status)}
							</span>
							<button
								type="button"
								class="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
								onclick={handleMarkAllPresent}
								disabled={isCompleted || isApplyingBulk || isChangingStatus}
							>
								{isApplyingBulk ? 'Applying...' : 'Mark all present'}
							</button>
							<button
								type="button"
								class={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
									isCompleted
										? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
										: 'bg-slate-900 text-white hover:bg-slate-800'
								}`}
								onclick={handleSessionStatusToggle}
								disabled={isTogglingSessionStatus}
							>
								{#if isTogglingSessionStatus}
									Saving...
								{:else if isCompleted}
									Reopen session
								{:else}
									Complete session
								{/if}
							</button>
							<button
								type="button"
								class="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
								onclick={() => openDeleteConfirm(currentSession.id)}
								disabled={isDeletingSession}
							>
								{isDeletingSession ? 'Deleting...' : 'Delete session'}
							</button>
						</div>
					{/snippet}

					<div class="hidden gap-4 md:grid md:grid-cols-5">
						{#each summary as item (item.label)}
							<article class="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
								<p class="text-sm font-medium text-slate-500">{item.label}</p>
								<p class={`mt-2 text-3xl font-bold ${item.tone}`}>{item.value}</p>
							</article>
						{/each}
					</div>
				</SectionCard>

				<SectionCard
					title="Session note"
					description="Keep quick context for this attendance session."
				>
					<div class="space-y-3">
						<textarea
							class="min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
							placeholder="Add a note for this session"
							bind:value={sessionNoteDraft}
						></textarea>
						<div class="flex justify-end">
							<button
								type="button"
								class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
								onclick={handleSaveSessionNotes}
								disabled={isSavingSessionNotes || sessionNoteDraft === (session?.notes ?? '')}
							>
								{isSavingSessionNotes ? 'Saving...' : 'Save note'}
							</button>
						</div>
					</div>
				</SectionCard>

				<div class="sticky top-3 z-10 -mx-1 overflow-x-auto px-1 pb-1 md:hidden">
					<div class="flex min-w-max gap-2">
						{#each summary as item (item.label)}
							<div
								class={`flex items-center gap-2 rounded-full border px-3 py-2 shadow-sm ${item.bgClass}`}
								aria-label={`${item.label}: ${item.value}`}
								title={`${item.label}: ${item.value}`}
							>
								<span class={`${item.icon} size-4 ${item.tone}`}></span>
								<span class={`text-sm font-semibold ${item.tone}`}>{item.value}</span>
							</div>
						{/each}
					</div>
				</div>

				<SectionCard title="Attendance sheet" description="Update each student in place.">
					{#snippet actions()}
						<div class="grid w-full gap-2 md:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
							<input
								type="search"
								class="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 xl:w-64"
								placeholder="Search student or belt rank"
								bind:value={studentSearch}
							/>
							<select
								class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 xl:w-48"
								bind:value={selectedGroupId}
							>
								<option value="">All groups</option>
								{#each availableGroupsForSession as group (group.id)}
									<option value={group.id}>{group.name}</option>
								{/each}
							</select>
							<select
								class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 xl:w-40"
								bind:value={selectedGender}
							>
								<option value="">All genders</option>
								<option value="male">Male</option>
								<option value="female">Female</option>
							</select>
							<select
								class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 xl:w-48"
								bind:value={selectedBeltRankId}
							>
								<option value="">All belt ranks</option>
								{#each availableBeltRanksForSession as beltRank (beltRank.id)}
									<option value={beltRank.id}>{beltRank.name}</option>
								{/each}
							</select>
						</div>
					{/snippet}

					{#if items.length === 0}
						<EmptyState
							title="No active students in this club"
							description="Only active students are loaded into a new attendance session."
						/>
					{:else if filteredItems.length === 0}
						<EmptyState
							title="No matching students"
							description="Adjust the search query to view more rows."
						/>
					{:else}
						<div class="space-y-3">
							{#each filteredItems as item (item.record.id)}
								<div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
									<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
										<div class="flex min-w-0 items-start gap-3">
											<StudentAvatarThumb
												name={item.student.fullName}
												src={avatarUrls[item.student.id]}
												sizeClass="size-12"
											/>
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-2">
													<p class="truncate text-base font-semibold text-slate-900">
														{item.student.fullName}
													</p>
												{#if item.student.studentCode}
													<span
														class="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500"
													>
														{item.student.studentCode}
													</span>
												{/if}
												{#if item.record.notes}
													<span
														class="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700"
													>
														Note
													</span>
												{/if}
											</div>
												<p class="mt-1 text-sm text-slate-500">
													{#if item.student.groupId}
														{groupMap.get(item.student.groupId) ?? 'Unknown group'} •
													{/if}
													{beltRankMap.get(item.student.beltRankId) ?? 'Unknown belt rank'}
												</p>
												{#if item.record.notes}
													<p class="mt-2 line-clamp-2 text-sm text-slate-600">{item.record.notes}</p>
												{/if}
											</div>
										</div>

										<div class="flex flex-wrap gap-2">
											<button
												type="button"
												class="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
												onclick={() => void openStudentDetailModal(item)}
											>
												<span class="mr-1.5 icon-[mdi--account-edit-outline] size-4"></span>
												Student
											</button>
											<button
												type="button"
												class="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
												onclick={() => openStudentNoteModal(item)}
											>
												<span class="mr-1.5 icon-[mdi--note-text-outline] size-4"></span>
												Note
											</button>
											{#each attendanceStatuses as statusOption (statusOption.value)}
												<button
													type="button"
													class={`inline-flex size-10 items-center justify-center rounded-full border text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${getStatusButtonClass(item.record.attendanceStatus, statusOption.value)}`}
													onclick={() => handleStatusChange(item.student.id, statusOption.value)}
													disabled={isCompleted || isChangingStatus}
													aria-label={statusOption.label}
													title={statusOption.label}
													use:tooltip={{ text: statusOption.label, placement: 'top' }}
												>
													<span class={`${statusOption.icon} size-4`}></span>
												</button>
											{/each}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</SectionCard>
			</section>
		{:else}
			<div class:hidden={!showMobileDetail} class:xl:block={!showMobileDetail}>
				<SectionCard title="Session detail" description="Choose a session from the left side.">
					<EmptyState
						title="No session selected"
						description="Pick a session to start marking attendance, or create a new session for today."
					/>
				</SectionCard>
			</div>
		{/if}
	</section>
</main>

<AppModal
	open={isSetupModalOpen}
	title="Setup attendance session"
	description="Create a new attendance session. The app will preload all active students in the selected club."
	size="md"
	allowOverflow={true}
	onClose={closeSetupModal}
>
	<form class="space-y-4" onsubmit={handleCreateSessionSubmit}>
		<label class="space-y-2">
			<span class="text-sm font-medium text-slate-700">Club *</span>
			<select
				class:border-red-300={!!formErrors.clubId}
				class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
				bind:value={setupClubId}
			>
				<option value="">Select a club</option>
				{#each availableClubs as club (club.id)}
					<option value={club.id}>{club.name}</option>
				{/each}
			</select>
			{#if formErrors.clubId}
				<span class="block text-xs text-red-600">{formErrors.clubId}</span>
			{/if}
		</label>

		<label class="space-y-2">
			<span class="text-sm font-medium text-slate-700">Session date *</span>
			<AppDatePicker bind:value={setupDate} placeholder="Select date" />
			{#if formErrors.sessionDate}
				<span class="block text-xs text-red-600">{formErrors.sessionDate}</span>
			{/if}
		</label>

		<label class="space-y-2">
			<span class="text-sm font-medium text-slate-700">Note</span>
			<textarea
				class="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
				placeholder="Add a note for this session"
				bind:value={setupNotes}
			></textarea>
		</label>

		<div class="flex justify-end gap-3">
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
				onclick={closeSetupModal}
			>
				Cancel
			</button>
			<button
				type="submit"
				class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
				disabled={!hasClubs || isCreating}
			>
				{isCreating ? 'Creating...' : 'Create session'}
			</button>
		</div>
	</form>
</AppModal>

<AppModal
	open={isDeleteConfirmOpen}
	title="Delete attendance session"
	description="This will remove the selected attendance session and all attendance records inside it from the current device."
	size="sm"
	onClose={closeDeleteConfirm}
>
	<div class="space-y-4">
		<p class="text-sm text-slate-600">
			This action cannot be undone from the attendance screen. Continue only if you want to remove
			the whole session.
		</p>
		<div class="flex justify-end gap-3">
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
				onclick={closeDeleteConfirm}
			>
				Cancel
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
				onclick={handleConfirmDeleteSession}
				disabled={isDeletingSession}
			>
				Confirm delete
			</button>
		</div>
	</div>
</AppModal>

<StudentFormModal
	open={isStudentDetailModalOpen}
	title="Student detail"
	description="Update the student directly from the attendance sheet."
	studentId={selectedStudentDetailId}
	bind:form={studentDetailForm}
	errors={studentDetailErrors}
	bind:selectedCustomScheduleDays={studentDetailCustomScheduleDays}
	availableGroups={availableStudentDetailGroups}
	availableBeltRanks={assignableBeltRanks}
	availableClubTrainingDays={availableStudentDetailTrainingDays}
	onClose={closeStudentDetailModal}
	onSubmit={() => void handleSaveStudentDetail()}
	submitLabel="Save student"
	isSubmitting={isSavingStudentDetail}
	showScheduleSection={true}
	showClubSelector={false}
	clubReadonlyName={sessionClub?.name ?? ''}
	showStatusField={true}
	studentCodeDisplay={selectedStudentDetailCode || 'Generated on sync'}
	statusOptions={[...studentStatusOptions]}
/>

<AppModal
	open={isStudentNoteModalOpen}
	title="Student note"
	description={selectedStudentNoteName
		? `Add a note for ${selectedStudentNoteName}.`
		: 'Add a note for this student.'}
	size="md"
	onClose={closeStudentNoteModal}
>
	<div class="space-y-4">
		<textarea
			class="min-h-32 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
			placeholder="Write a note for this student"
			bind:value={studentNoteDraft}
		></textarea>
		<div class="flex justify-end gap-3">
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
				onclick={closeStudentNoteModal}
			>
				Cancel
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
				onclick={handleSaveStudentNote}
				disabled={isSavingStudentNote}
			>
				{isSavingStudentNote ? 'Saving...' : 'Save note'}
			</button>
		</div>
	</div>
</AppModal>
