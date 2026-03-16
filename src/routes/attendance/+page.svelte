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
		status: AttendanceStatus;
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
		shortLabel: string;
		value: AttendanceStatus;
		icon: string;
		activeClass: string;
		inactiveClass: string;
	}> = [
		{
			label: 'Có mặt',
			shortLabel: 'Có mặt',
			value: 'present',
			icon: 'icon-[mdi--check]',
			activeClass: 'border-emerald-600 bg-emerald-600 text-white',
			inactiveClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300'
		},
		{
			label: 'Đi trễ',
			shortLabel: 'Trễ',
			value: 'late',
			icon: 'icon-[mdi--clock-outline]',
			activeClass: 'border-amber-500 bg-amber-500 text-white',
			inactiveClass: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300'
		},
		{
			label: 'Có phép',
			shortLabel: 'Phép',
			value: 'excused',
			icon: 'icon-[mdi--email-outline]',
			activeClass: 'border-sky-600 bg-sky-600 text-white',
			inactiveClass: 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300'
		},
		{
			label: 'Về sớm',
			shortLabel: 'Sớm',
			value: 'left_early',
			icon: 'icon-[mdi--exit-run]',
			activeClass: 'border-cyan-600 bg-cyan-600 text-white',
			inactiveClass: 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:border-cyan-300'
		},
		{
			label: 'Vắng',
			shortLabel: 'Vắng',
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
	let selectedAttendanceStatus = $state<AttendanceStatus | ''>('');
	let setupClubId = $state('');
	let setupDate = $state(getTodayIsoDate());
	let setupNotes = $state('');
	let isSetupModalOpen = $state(false);
	let formErrors = $state<SessionFormErrors>({});
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
	let suppressSyncRefreshUntil = $state(0);
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
		{ label: 'Đang học', value: 'active' },
		{ label: 'Ngưng học', value: 'inactive' },
		{ label: 'Tạm dừng', value: 'suspended' }
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
		const map: Record<string, Weekday[]> = {};
		for (const schedule of clubSchedules) {
			if (schedule.deletedAt || !schedule.isActive) continue;
			const existing = map[schedule.clubId] ?? [];
			map[schedule.clubId] = [...existing, schedule.weekday];
		}
		return map;
	});
	const availableStudentDetailGroups = $derived.by(() => {
		if (!sessionClub) return [];
		return availableGroupsForSession;
	});
	const availableStudentDetailTrainingDays = $derived.by(() =>
		studentDetailForm.clubId ? (clubScheduleMap[studentDetailForm.clubId] ?? []) : []
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
		return items.filter(({ student, record }) => {
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
			const matchesStatus =
				!selectedAttendanceStatus || record.attendanceStatus === selectedAttendanceStatus;

			return matchesQuery && matchesGroup && matchesGender && matchesBeltRank && matchesStatus;
		});
	});
	const summary = $derived.by<SummaryItem[]>(() => {
		const counts = {
			unmarked: items.filter((item) => item.record.attendanceStatus === 'unmarked').length,
			present: items.filter((item) => item.record.attendanceStatus === 'present').length,
			late: items.filter((item) => item.record.attendanceStatus === 'late').length,
			excused: items.filter((item) => item.record.attendanceStatus === 'excused').length,
			leftEarly: items.filter((item) => item.record.attendanceStatus === 'left_early').length,
			absent: items.filter((item) => item.record.attendanceStatus === 'absent').length
		};

		return [
			{
				status: 'present',
				label: 'Có mặt',
				value: counts.present,
				tone: 'text-emerald-700',
				icon: 'icon-[mdi--check-circle-outline]',
				bgClass: 'bg-emerald-50 border-emerald-200'
			},
			{
				status: 'late',
				label: 'Đi trễ',
				value: counts.late,
				tone: 'text-amber-700',
				icon: 'icon-[mdi--clock-outline]',
				bgClass: 'bg-amber-50 border-amber-200'
			},
			{
				status: 'excused',
				label: 'Có phép',
				value: counts.excused,
				tone: 'text-sky-700',
				icon: 'icon-[mdi--email-outline]',
				bgClass: 'bg-sky-50 border-sky-200'
			},
			{
				status: 'left_early',
				label: 'Về sớm',
				value: counts.leftEarly,
				tone: 'text-cyan-700',
				icon: 'icon-[mdi--exit-run]',
				bgClass: 'bg-cyan-50 border-cyan-200'
			},
			{
				status: 'absent',
				label: 'Vắng',
				value: counts.absent,
				tone: 'text-rose-700',
				icon: 'icon-[mdi--close-circle-outline]',
				bgClass: 'bg-rose-50 border-rose-200'
			},
			{
				status: 'unmarked',
				label: 'Chưa điểm danh',
				value: counts.unmarked,
				tone: 'text-slate-600',
				icon: 'icon-[mdi--help-circle-outline]',
				bgClass: 'bg-slate-50 border-slate-200'
			}
		];
	});
	const sessionStatsMap = $derived.by(() => {
		const map: Record<
			string,
			{
				present: number;
				late: number;
				excused: number;
				left_early: number;
				absent: number;
				unmarked: number;
			}
		> = {};

		for (const record of attendanceRecords) {
			const current = map[record.sessionId] ?? {
				present: 0,
				late: 0,
				excused: 0,
				left_early: 0,
				absent: 0,
				unmarked: 0
			};
			current[record.attendanceStatus] += 1;
			map[record.sessionId] = current;
		}

		return map;
	});
	const hasClubs = $derived.by(() => availableClubs.length > 0);
	const isCompleted = $derived.by(() => session?.status === 'completed');
	const canReopenSelectedSession = $derived.by(() => {
		if (!session || session.status !== 'completed') return true;
		return session.sessionDate === getTodayIsoDate();
	});
	const sessionStatusToggleDisabled = $derived.by(() => {
		if (isTogglingSessionStatus) return true;
		if (session?.status === 'completed' && !canReopenSelectedSession) return true;
		return false;
	});

	onMount(() => {
		void loadInitialData();

		return subscribeDataChanged((source) => {
			if (source === 'avatar' || source === 'avatar-sync') {
				void refreshVisibleAvatarPreviews();
				return;
			}
			if (source === 'attendance') return;
			if (source === 'sync' && Date.now() < suppressSyncRefreshUntil) {
				return;
			}
			if (source === 'local' && suppressLocalRefresh) {
				return;
			}
			void refreshCurrentView();
		});
	});

	function suppressSyncRefreshWindow(durationMs = 4000) {
		suppressSyncRefreshUntil = Date.now() + durationMs;
	}

	$effect(() => {
		const _filtered = filteredItems;
		if (_filtered) {
			// no-op: keep dependency on filtered list for avatar preview refresh
		}
		void refreshVisibleAvatarPreviews();
	});

	async function loadInitialData() {
		try {
			const [clubRows, clubGroupRows, beltRankRows, sessionRows, attendanceRecordRows] =
				await Promise.all([
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
			toastError(error instanceof Error ? error.message : 'Không thể tải dữ liệu điểm danh.');
		}
		await loadSelectedSession();
	}

	async function refreshCurrentView() {
		const [clubRows, clubGroupRows, beltRankRows, sessionRows, attendanceRecordRows] =
			await Promise.all([
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
			selectedAttendanceStatus = '';
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
			toastError(error instanceof Error ? error.message : 'Không thể tải buổi điểm danh.');
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
			nextErrors.clubId = 'Vui lòng chọn CLB.';
		}

		if (!setupDate) {
			nextErrors.sessionDate = 'Vui lòng chọn ngày điểm danh.';
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
			toastSuccess('Đã tạo buổi điểm danh.');
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể tạo buổi điểm danh.');
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
			suppressSyncRefreshWindow();
			await attendanceUseCases.markAllPresent(session.id);
			applyMarkAllPresentLocally();
			toastSuccess('Đã điểm danh có mặt cho tất cả võ sinh.');
		} catch (error) {
			toastError(
				error instanceof Error ? error.message : 'Không thể điểm danh có mặt cho tất cả võ sinh.'
			);
		} finally {
			suppressLocalRefresh = false;
			isApplyingBulk = false;
		}
	}

	async function handleSessionStatusToggle() {
		if (!session) return;

		try {
			if (session.status === 'completed' && session.sessionDate !== getTodayIsoDate()) {
				toastError('Chỉ có thể mở lại buổi điểm danh trong ngày.');
				return;
			}
			isTogglingSessionStatus = true;
			suppressLocalRefresh = true;
			suppressSyncRefreshWindow();
			if (session.status === 'completed') {
				await attendanceUseCases.reopenSession(session.id);
				applySessionStatusLocally('draft');
				toastSuccess('Đã mở lại buổi điểm danh.');
			} else {
				await attendanceUseCases.completeSession(session.id);
				applySessionStatusLocally('completed');
				toastSuccess('Đã chốt buổi điểm danh.');
			}
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể cập nhật buổi điểm danh.');
		} finally {
			suppressLocalRefresh = false;
			isTogglingSessionStatus = false;
		}
	}

	async function handleDeleteSession(sessionId: string) {
		try {
			isDeletingSession = true;
			suppressLocalRefresh = true;
			suppressSyncRefreshWindow();
			await attendanceUseCases.deleteSession(sessionId);
			applyDeleteSessionLocally(sessionId);
			toastSuccess('Đã xóa buổi điểm danh.');
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể xóa buổi điểm danh.');
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
			suppressSyncRefreshWindow();
			await attendanceUseCases.updateSessionNotes(session.id, sessionNoteDraft);
			applySessionNotesLocally(sessionNoteDraft);
			toastSuccess('Đã cập nhật ghi chú buổi học.');
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể cập nhật ghi chú buổi học.');
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
			suppressSyncRefreshWindow();
			await attendanceUseCases.updateAttendance({
				sessionId: session.id,
				studentId,
				attendanceStatus
			});
			applyAttendanceStatusLocally(studentId, attendanceStatus);
		} catch (error) {
			toastError(
				error instanceof Error ? error.message : 'Không thể cập nhật trạng thái điểm danh.'
			);
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
			joinedAtBeforeBirthMessage: 'Ngày tham gia phải bằng hoặc sau ngày sinh.',
			invalidPhoneMessage: 'Số điện thoại không hợp lệ.',
			invalidEmailMessage: 'Email không hợp lệ.'
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
			toastSuccess('Đã cập nhật võ sinh.');
			closeStudentDetailModal();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể cập nhật võ sinh.');
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
			suppressSyncRefreshWindow();
			await attendanceUseCases.updateAttendance({
				sessionId: session.id,
				studentId: selectedStudentNoteId,
				attendanceStatus:
					items.find((item) => item.student.id === selectedStudentNoteId)?.record
						.attendanceStatus ?? 'unmarked',
				notes: studentNoteDraft
			});
			applyAttendanceNoteLocally(selectedStudentNoteId, studentNoteDraft);
			toastSuccess('Đã cập nhật ghi chú võ sinh.');
			closeStudentNoteModal();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể cập nhật ghi chú võ sinh.');
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
		selectedAttendanceStatus = '';
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
		return value === 'completed' ? 'Đã chốt' : 'Bản nháp';
	}

	function handleSummaryStatusFilter(status: AttendanceStatus) {
		selectedAttendanceStatus = selectedAttendanceStatus === status ? '' : status;
	}

	function getSummaryActiveClass(status: AttendanceStatus): string {
		switch (status) {
			case 'present':
				return 'border-emerald-700 bg-emerald-700 text-white';
			case 'late':
				return 'border-amber-600 bg-amber-600 text-white';
			case 'excused':
				return 'border-sky-700 bg-sky-700 text-white';
			case 'left_early':
				return 'border-cyan-700 bg-cyan-700 text-white';
			case 'absent':
				return 'border-rose-700 bg-rose-700 text-white';
			case 'unmarked':
			default:
				return 'border-slate-700 bg-slate-700 text-white';
		}
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
						checkInAt:
							attendanceStatus === 'present' || attendanceStatus === 'late' ? now : undefined,
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
	<PageHeader eyebrow="Điểm danh" title="Điểm danh hằng ngày" description="">
		{#snippet actions()}
			<IconActionButton
				icon="icon-[mdi--plus]"
				label="Tạo buổi điểm danh"
				variant="primary"
				onclick={openSetupModal}
				tooltipText={{ text: 'Tạo buổi điểm danh', placement: 'bottom' }}
			/>
			{#if showMobileDetail}
				<div class="xl:hidden">
					<IconActionButton
						icon="icon-[mdi--arrow-left]"
						label="Quay lại danh sách"
						onclick={backToSessionList}
					/>
				</div>
			{/if}
		{/snippet}
	</PageHeader>

	<section class="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
		<div class:hidden={showMobileDetail} class:xl:block={showMobileDetail}>
			<SectionCard
				title="Danh sách buổi điểm danh"
				description="Buổi mới nhất hiển thị trước. Chọn một buổi để xem chi tiết."
			>
				<div class="space-y-4">
					<div class="grid gap-2 sm:grid-cols-2">
						<input
							type="search"
							class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
							placeholder="Tìm theo CLB hoặc ngày"
							bind:value={sessionSearch}
						/>
						<AppDatePicker bind:value={sessionDateFilter} placeholder="Lọc theo ngày" />
					</div>

					{#if !hasClubs}
						<EmptyState
							title="Chưa có CLB"
							description="Hãy tạo và đồng bộ ít nhất một CLB đang hoạt động trước khi tạo buổi điểm danh."
						/>
					{:else if filteredSessions.length === 0}
						<EmptyState
							title="Chưa có buổi điểm danh"
							description="Bấm nút thêm để tạo buổi điểm danh đầu tiên cho CLB."
						/>
					{:else}
						<div class="space-y-3">
							{#each filteredSessions as sessionItem (sessionItem.id)}
								{@const club = clubMap.get(sessionItem.clubId)}
								{@const sessionStats = sessionStatsMap[sessionItem.id]}
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
												{club?.name ?? 'CLB không xác định'}
											</p>
											<p
												class={`mt-1 text-sm ${selectedSessionId === sessionItem.id ? 'text-white/75' : 'text-slate-500'}`}
											>
												{formatWeekdayLabel(sessionItem.sessionDate)} • {formatDateLabel(
													sessionItem.sessionDate
												)}
											</p>
											{#if sessionItem.notes}
												<p
													class={`mt-2 line-clamp-2 text-sm ${
														selectedSessionId === sessionItem.id
															? 'text-white/70'
															: 'text-slate-600'
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
														Có mặt {sessionStats.present}
													</span>
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-amber-500/15 text-amber-100'
																: 'border border-amber-200 bg-amber-50 text-amber-700'
														}`}
													>
														Trễ {sessionStats.late}
													</span>
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-sky-500/15 text-sky-100'
																: 'border border-sky-200 bg-sky-50 text-sky-700'
														}`}
													>
														Phép {sessionStats.excused}
													</span>
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-cyan-500/15 text-cyan-100'
																: 'border border-cyan-200 bg-cyan-50 text-cyan-700'
														}`}
													>
														Về sớm {sessionStats.left_early}
													</span>
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-rose-500/15 text-rose-100'
																: 'border border-rose-200 bg-rose-50 text-rose-700'
														}`}
													>
														Vắng {sessionStats.absent}
													</span>
													<span
														class={`rounded-full px-2 py-1 text-[11px] font-medium ${
															selectedSessionId === sessionItem.id
																? 'bg-white/12 text-white/80'
																: 'border border-slate-200 bg-slate-50 text-slate-600'
														}`}
													>
														Chưa {sessionStats.unmarked}
													</span>
												</div>
											{/if}
										</div>
										<span
											class={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-center text-xs font-medium ${
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
				<SectionCard title="Chi tiết buổi điểm danh" description="Đang tải dữ liệu">
					<p class="text-sm text-slate-500">Đang tải chi tiết điểm danh...</p>
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
					description={`Điểm danh ngày ${formatDateLabel(currentSession.sessionDate)}`}
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
								{isApplyingBulk ? 'Đang cập nhật...' : 'Điểm danh có mặt tất cả'}
							</button>
							<button
								type="button"
								class={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
									isCompleted
										? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
										: 'bg-slate-900 text-white hover:bg-slate-800'
								} disabled:opacity-60`}
								onclick={handleSessionStatusToggle}
								disabled={sessionStatusToggleDisabled}
								title={isCompleted && !canReopenSelectedSession
									? 'Chỉ có thể mở lại buổi điểm danh trong ngày.'
									: undefined}
							>
								{#if isTogglingSessionStatus}
									Đang lưu...
								{:else if isCompleted}
									Mở lại buổi
								{:else}
									Chốt buổi
								{/if}
							</button>
							<button
								type="button"
								class="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
								onclick={() => openDeleteConfirm(currentSession.id)}
								disabled={isDeletingSession}
							>
								{isDeletingSession ? 'Đang xóa...' : 'Xóa buổi'}
							</button>
						</div>
					{/snippet}
				</SectionCard>

				<div class="sticky top-3 z-10 px-1 py-1 md:hidden">
					<div class="grid grid-cols-3 gap-2">
						{#each summary as item (item.label)}
							<button
								type="button"
								class={`flex min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2 py-2 shadow-sm transition ${
									selectedAttendanceStatus === item.status
										? getSummaryActiveClass(item.status)
										: item.bgClass
								}`}
								aria-label={`${item.label}: ${item.value}`}
								title={`${item.label}: ${item.value}${selectedAttendanceStatus === item.status ? ' (đang lọc)' : ''}`}
								onclick={() => handleSummaryStatusFilter(item.status)}
							>
								<span
									class={`${item.icon} size-4 ${selectedAttendanceStatus === item.status ? 'text-white' : item.tone}`}
								></span>
								<span
									class={`truncate text-xs font-semibold ${selectedAttendanceStatus === item.status ? 'text-white' : item.tone}`}
								>
									{item.value}
								</span>
							</button>
						{/each}
					</div>
				</div>

				<SectionCard
					title="Bảng điểm danh"
					description="Cập nhật trạng thái trực tiếp cho từng võ sinh."
				>
					{#snippet actions()}
						<div class="grid w-full gap-2 md:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
							<input
								type="search"
								class="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 xl:w-64"
								placeholder="Tìm võ sinh hoặc cấp đai"
								bind:value={studentSearch}
							/>
							<select
								class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 xl:w-48"
								bind:value={selectedGroupId}
							>
								<option value="">Tất cả nhóm</option>
								{#each availableGroupsForSession as group (group.id)}
									<option value={group.id}>{group.name}</option>
								{/each}
							</select>
							<select
								class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 xl:w-40"
								bind:value={selectedGender}
							>
								<option value="">Tất cả giới tính</option>
								<option value="male">Nam</option>
								<option value="female">Nữ</option>
							</select>
							<select
								class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 xl:w-48"
								bind:value={selectedBeltRankId}
							>
								<option value="">Tất cả cấp đai</option>
								{#each availableBeltRanksForSession as beltRank (beltRank.id)}
									<option value={beltRank.id}>{beltRank.name}</option>
								{/each}
							</select>
						</div>
					{/snippet}

					<div class="mb-4 hidden gap-3 p-1 md:sticky md:top-20 md:z-20 md:grid md:grid-cols-5">
						{#each summary as item (item.label)}
							<button
								type="button"
								class={`rounded-2xl border px-3 py-2 text-left shadow-sm transition ${
									selectedAttendanceStatus === item.status
										? getSummaryActiveClass(item.status)
										: item.bgClass
								}`}
								onclick={() => handleSummaryStatusFilter(item.status)}
								aria-pressed={selectedAttendanceStatus === item.status}
							>
								<p
									class={`text-xs font-medium ${selectedAttendanceStatus === item.status ? 'text-white/85' : 'text-slate-500'}`}
								>
									{item.label}
								</p>
								<p
									class={`mt-1 text-2xl font-bold ${selectedAttendanceStatus === item.status ? 'text-white' : item.tone}`}
								>
									{item.value}
								</p>
							</button>
						{/each}
					</div>

					{#if items.length === 0}
						<EmptyState
							title="CLB chưa có võ sinh đang hoạt động"
							description="Chỉ võ sinh đang hoạt động mới được nạp vào buổi điểm danh mới."
						/>
					{:else if filteredItems.length === 0}
						<EmptyState
							title="Không có kết quả phù hợp"
							description="Thử thay đổi điều kiện tìm kiếm hoặc bộ lọc."
						/>
					{:else}
						<div class="space-y-3">
							{#each filteredItems as item (item.record.id)}
								<div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
									<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
										<div class="flex min-w-0 items-start gap-3">
											<button
												type="button"
												class="cursor-pointer rounded-full"
												onclick={() => void openStudentDetailModal(item)}
												aria-label="Sửa thông tin võ sinh"
												title="Sửa thông tin võ sinh"
												use:tooltip={{ text: 'Sửa thông tin võ sinh', placement: 'top' }}
											>
												<StudentAvatarThumb
													name={item.student.fullName}
													src={avatarUrls[item.student.id]}
													sizeClass="size-12"
												/>
											</button>
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-2">
													<button
														type="button"
														class="cursor-pointer truncate text-left text-base font-semibold text-slate-900 transition hover:text-slate-700 hover:underline"
														onclick={() => void openStudentDetailModal(item)}
														aria-label={`Sửa thông tin võ sinh ${item.student.fullName}`}
														title="Sửa thông tin võ sinh"
														use:tooltip={{ text: 'Sửa thông tin võ sinh', placement: 'top' }}
													>
														{item.student.fullName}
													</button>
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
															Ghi chú
														</span>
													{/if}
												</div>
												<p class="mt-1 text-sm text-slate-500">
													{#if item.student.groupId}
														{groupMap.get(item.student.groupId) ?? 'Nhóm không xác định'} •
													{/if}
													{beltRankMap.get(item.student.beltRankId) ?? 'Cấp đai không xác định'}
												</p>
												{#if item.record.notes}
													<p class="mt-2 line-clamp-2 text-sm text-slate-600">
														{item.record.notes}
													</p>
												{/if}
											</div>
										</div>

										<div class="flex flex-wrap gap-2">
											<button
												type="button"
												class="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
												onclick={() => openStudentNoteModal(item)}
												aria-label="Ghi chú võ sinh"
												title="Ghi chú võ sinh"
												use:tooltip={{ text: 'Ghi chú võ sinh', placement: 'top' }}
											>
												<span class="icon-[mdi--note-text-outline] size-4"></span>
											</button>
											{#each attendanceStatuses as statusOption (statusOption.value)}
												<button
													type="button"
													class={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${getStatusButtonClass(item.record.attendanceStatus, statusOption.value)}`}
													onclick={() => handleStatusChange(item.student.id, statusOption.value)}
													disabled={isCompleted || isChangingStatus}
													aria-label={statusOption.label}
													title={statusOption.label}
													use:tooltip={{ text: statusOption.label, placement: 'top' }}
												>
													<span class={`${statusOption.icon} size-4`}></span>
													<span>{statusOption.shortLabel}</span>
												</button>
											{/each}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<div class="mt-4 border-t border-slate-200 pt-4">
						<label for="session-note-inline" class="mb-2 block text-sm font-medium text-slate-700"
							>Ghi chú buổi học</label
						>
						<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
							<input
								id="session-note-inline"
								type="text"
								class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
								placeholder="Thêm ghi chú ngắn cho buổi học"
								bind:value={sessionNoteDraft}
								maxlength="180"
							/>
							<button
								type="button"
								class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:shrink-0"
								onclick={handleSaveSessionNotes}
								disabled={isSavingSessionNotes || sessionNoteDraft === (session?.notes ?? '')}
							>
								{isSavingSessionNotes ? 'Đang lưu...' : 'Lưu'}
							</button>
						</div>
					</div>
				</SectionCard>
			</section>
		{:else}
			<div class:hidden={!showMobileDetail} class:xl:block={!showMobileDetail}>
				<SectionCard
					title="Chi tiết buổi điểm danh"
					description="Hãy chọn một buổi ở danh sách bên trái."
				>
					<EmptyState
						title="Chưa chọn buổi điểm danh"
						description="Chọn một buổi để bắt đầu điểm danh, hoặc tạo buổi mới cho hôm nay."
					/>
				</SectionCard>
			</div>
		{/if}
	</section>
</main>

<AppModal
	open={isSetupModalOpen}
	title="Tạo buổi điểm danh"
	description="Tạo buổi điểm danh mới. Hệ thống sẽ nạp sẵn võ sinh đang hoạt động trong CLB đã chọn."
	size="md"
	allowOverflow={true}
	onClose={closeSetupModal}
>
	<form class="space-y-4" onsubmit={handleCreateSessionSubmit}>
		<label class="space-y-2">
			<span class="text-sm font-medium text-slate-700">CLB *</span>
			<select
				class:border-red-300={!!formErrors.clubId}
				class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
				bind:value={setupClubId}
			>
				<option value="">Chọn CLB</option>
				{#each availableClubs as club (club.id)}
					<option value={club.id}>{club.name}</option>
				{/each}
			</select>
			{#if formErrors.clubId}
				<span class="block text-xs text-red-600">{formErrors.clubId}</span>
			{/if}
		</label>

		<label class="space-y-2">
			<span class="text-sm font-medium text-slate-700">Ngày điểm danh *</span>
			<AppDatePicker bind:value={setupDate} placeholder="Chọn ngày" />
			{#if formErrors.sessionDate}
				<span class="block text-xs text-red-600">{formErrors.sessionDate}</span>
			{/if}
		</label>

		<label class="space-y-2">
			<span class="text-sm font-medium text-slate-700">Ghi chú</span>
			<textarea
				class="min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
				placeholder="Thêm ghi chú cho buổi học"
				bind:value={setupNotes}
			></textarea>
		</label>

		<div class="flex justify-end gap-3">
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
				onclick={closeSetupModal}
			>
				Hủy
			</button>
			<button
				type="submit"
				class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
				disabled={!hasClubs || isCreating}
			>
				{isCreating ? 'Đang tạo...' : 'Tạo buổi'}
			</button>
		</div>
	</form>
</AppModal>

<AppModal
	open={isDeleteConfirmOpen}
	title="Xóa buổi điểm danh"
	description="Thao tác này sẽ xóa buổi điểm danh đã chọn và toàn bộ chi tiết điểm danh trên thiết bị hiện tại."
	size="sm"
	onClose={closeDeleteConfirm}
>
	<div class="space-y-4">
		<p class="text-sm text-slate-600">
			Bạn sẽ không thể hoàn tác trực tiếp từ màn hình điểm danh. Chỉ tiếp tục nếu muốn xóa toàn bộ
			buổi học.
		</p>
		<div class="flex justify-end gap-3">
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
				onclick={closeDeleteConfirm}
			>
				Hủy
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300"
				onclick={handleConfirmDeleteSession}
				disabled={isDeletingSession}
			>
				Xác nhận xóa
			</button>
		</div>
	</div>
</AppModal>

<StudentFormModal
	open={isStudentDetailModalOpen}
	title="Chi tiết võ sinh"
	description="Cập nhật thông tin võ sinh trực tiếp từ bảng điểm danh."
	studentId={selectedStudentDetailId}
	bind:form={studentDetailForm}
	errors={studentDetailErrors}
	bind:selectedCustomScheduleDays={studentDetailCustomScheduleDays}
	availableGroups={availableStudentDetailGroups}
	availableBeltRanks={assignableBeltRanks}
	availableClubTrainingDays={availableStudentDetailTrainingDays}
	onClose={closeStudentDetailModal}
	onSubmit={() => void handleSaveStudentDetail()}
	submitLabel="Lưu võ sinh"
	isSubmitting={isSavingStudentDetail}
	showScheduleSection={true}
	showClubSelector={false}
	clubReadonlyName={sessionClub?.name ?? ''}
	showStatusField={true}
	studentCodeDisplay={selectedStudentDetailCode || 'Sẽ tạo khi đồng bộ'}
	statusOptions={[...studentStatusOptions]}
/>

<AppModal
	open={isStudentNoteModalOpen}
	title="Ghi chú võ sinh"
	description={selectedStudentNoteName
		? `Thêm ghi chú cho ${selectedStudentNoteName}.`
		: 'Thêm ghi chú cho võ sinh này.'}
	size="md"
	onClose={closeStudentNoteModal}
>
	<div class="space-y-4">
		<textarea
			class="min-h-32 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
			placeholder="Nhập ghi chú cho võ sinh"
			bind:value={studentNoteDraft}
		></textarea>
		<div class="flex justify-end gap-3">
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
				onclick={closeStudentNoteModal}
			>
				Hủy
			</button>
			<button
				type="button"
				class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
				onclick={handleSaveStudentNote}
				disabled={isSavingStudentNote}
			>
				{isSavingStudentNote ? 'Đang lưu...' : 'Lưu ghi chú'}
			</button>
		</div>
	</div>
</AppModal>
