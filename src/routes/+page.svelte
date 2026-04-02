<script lang="ts">
	import { onMount } from 'svelte';
	import { AppModal, EmptyState, PageHeader, SectionCard, subscribeDataChanged, tooltip } from '$lib';
	import type {
		AttendanceRecord,
		AttendanceSession,
		AttendanceStatus,
		BeltRank,
		Club,
		Student
	} from '$lib/domain/models';
	import {
		attendanceUseCases,
		beltRankUseCases,
		clubUseCases,
		studentUseCases
	} from '$lib/app/services';

	type RangeDays = 7 | 30 | 90;

	type SummaryCard = {
		label: string;
		value: string;
		icon: string;
		description: string;
		tone: string;
	};

	type StudentAttendanceInsight = {
		student: Student;
		total: number;
		marked: number;
		attended: number;
		absent: number;
		late: number;
		excused: number;
		leftEarly: number;
		unmarked: number;
		rate: number;
		streakAbsent: number;
		reasons: string[];
		riskScore: number;
	};

	type WeeklyTrendRow = {
		weekKey: string;
		label: string;
		present: number;
		late: number;
		excused: number;
		leftEarly: number;
		absent: number;
		unmarked: number;
		total: number;
	};

	type ClubAttendanceInsight = {
		club: Club;
		sessionCount: number;
		total: number;
		marked: number;
		attended: number;
		absent: number;
		late: number;
		rate: number;
	};

	const ATTENDED_STATUSES = new Set<AttendanceStatus>(['present', 'late', 'left_early']);

	let rangeDays = $state<RangeDays>(30);
	let clubs = $state<Club[]>([]);
	let beltRanks = $state<BeltRank[]>([]);
	let students = $state<Student[]>([]);
	let sessions = $state<AttendanceSession[]>([]);
	let attendanceRecords = $state<AttendanceRecord[]>([]);
	let selectedStudentId = $state('');
	let isQuickProfileModalOpen = $state(false);
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

			const [clubRows, beltRankRows, studentRows, sessionRows, recordRows] = await Promise.all([
				clubUseCases.list(),
				beltRankUseCases.list(),
				studentUseCases.list(),
				attendanceUseCases.listSessions(),
				attendanceUseCases.listRecords()
			]);

			clubs = clubRows;
			beltRanks = beltRankRows;
			students = studentRows;
			sessions = sessionRows;
			attendanceRecords = recordRows;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Không thể tải dữ liệu tổng quan.';
		} finally {
			isLoading = false;
		}
	}

	function toIsoDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function parseIsoDate(value: string): Date {
		return new Date(`${value}T00:00:00`);
	}

	function getTodayIso(): string {
		return toIsoDate(new Date());
	}

	function getRangeStartIso(days: RangeDays): string {
		const date = new Date();
		date.setDate(date.getDate() - days + 1);
		return toIsoDate(date);
	}

	function formatPercent(value: number): string {
		return `${value.toFixed(1)}%`;
	}

	function formatDate(value: string): string {
		const date = parseIsoDate(value);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleDateString();
	}

	function getWeekStartIso(isoDate: string): string {
		const date = parseIsoDate(isoDate);
		if (Number.isNaN(date.getTime())) return isoDate;
		const weekday = (date.getDay() + 6) % 7;
		date.setDate(date.getDate() - weekday);
		return toIsoDate(date);
	}

	function setRange(days: RangeDays) {
		rangeDays = days;
	}

	function openQuickProfile(studentId: string) {
		selectedStudentId = studentId;
		isQuickProfileModalOpen = true;
	}

	function closeQuickProfileModal() {
		isQuickProfileModalOpen = false;
	}

	function getStatusLabel(status: AttendanceStatus): string {
		switch (status) {
			case 'present':
				return 'Có mặt';
			case 'late':
				return 'Đi trễ';
			case 'excused':
				return 'Có phép';
			case 'left_early':
				return 'Về sớm';
			case 'absent':
				return 'Vắng';
			case 'unmarked':
			default:
				return 'Chưa điểm danh';
		}
	}

	function getStatusDotClass(status: AttendanceStatus): string {
		switch (status) {
			case 'present':
				return 'bg-emerald-500';
			case 'late':
				return 'bg-amber-500';
			case 'excused':
				return 'bg-sky-500';
			case 'left_early':
				return 'bg-cyan-500';
			case 'absent':
				return 'bg-rose-500';
			case 'unmarked':
			default:
				return 'bg-slate-400';
		}
	}

	const activeClubs = $derived.by(() =>
		clubs.filter((club) => !club.deletedAt && club.isActive)
	);
	const activeStudents = $derived.by(() =>
		students.filter((student) => !student.deletedAt && student.status === 'active')
	);
	const pendingChangesCount = $derived.by(
		() =>
			[...clubs, ...beltRanks, ...students, ...sessions, ...attendanceRecords].filter(
				(item) => item.syncStatus !== 'synced'
			).length
	);
	const studentsWithoutCodeCount = $derived.by(
		() => students.filter((student) => !student.deletedAt && !student.studentCode).length
	);
	const todayIso = $derived.by(() => getTodayIso());
	const rangeStartIso = $derived.by(() => getRangeStartIso(rangeDays));

	const sessionMap = $derived.by(
		() =>
			new Map(
				sessions
					.filter((session) => !session.deletedAt)
					.map((session) => [session.id, session])
			)
	);
	const clubMap = $derived.by(() => new Map(clubs.map((club) => [club.id, club])));

	const sessionsInRange = $derived.by(() =>
		sessions
			.filter(
				(session) =>
					!session.deletedAt &&
					session.sessionDate >= rangeStartIso &&
					session.sessionDate <= todayIso
			)
			.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
	);

	const sessionIdSetInRange = $derived.by(() => new Set(sessionsInRange.map((session) => session.id)));

	const recordsInRange = $derived.by(() =>
		attendanceRecords.filter(
			(record) =>
				!record.deletedAt &&
				sessionIdSetInRange.has(record.sessionId) &&
				sessionMap.has(record.sessionId)
		)
	);

	const attendanceTotals = $derived.by(() => {
		const totals = {
			total: 0,
			marked: 0,
			present: 0,
			late: 0,
			excused: 0,
			leftEarly: 0,
			absent: 0,
			unmarked: 0
		};

		for (const record of recordsInRange) {
			totals.total += 1;
			if (record.attendanceStatus !== 'unmarked') totals.marked += 1;
			if (record.attendanceStatus === 'present') totals.present += 1;
			if (record.attendanceStatus === 'late') totals.late += 1;
			if (record.attendanceStatus === 'excused') totals.excused += 1;
			if (record.attendanceStatus === 'left_early') totals.leftEarly += 1;
			if (record.attendanceStatus === 'absent') totals.absent += 1;
			if (record.attendanceStatus === 'unmarked') totals.unmarked += 1;
		}

		return totals;
	});

	const overallAttendanceRate = $derived.by(() => {
		if (attendanceTotals.marked === 0) return 0;
		const attended = attendanceTotals.present + attendanceTotals.late + attendanceTotals.leftEarly;
		return (attended / attendanceTotals.marked) * 100;
	});

	const sessionCompletionRate = $derived.by(() => {
		if (attendanceTotals.total === 0) return 0;
		return (attendanceTotals.marked / attendanceTotals.total) * 100;
	});

	const studentInsightMap = $derived.by(() => {
		const grouped = new Map<string, AttendanceRecord[]>();
		for (const record of recordsInRange) {
			const existing = grouped.get(record.studentId) ?? [];
			existing.push(record);
			grouped.set(record.studentId, existing);
		}

		const next = new Map<string, StudentAttendanceInsight>();
		for (const student of activeStudents) {
			const studentRecords = grouped.get(student.id) ?? [];
			if (studentRecords.length === 0) continue;

			let marked = 0;
			let attended = 0;
			let absent = 0;
			let late = 0;
			let excused = 0;
			let leftEarly = 0;
			let unmarked = 0;

			const sortedByDate = [...studentRecords].sort((a, b) => {
				const sessionA = sessionMap.get(a.sessionId);
				const sessionB = sessionMap.get(b.sessionId);
				return (sessionB?.sessionDate ?? '').localeCompare(sessionA?.sessionDate ?? '');
			});

			let streakAbsent = 0;
			for (const record of sortedByDate) {
				if (record.attendanceStatus === 'unmarked') {
					unmarked += 1;
					continue;
				}
				marked += 1;
				if (ATTENDED_STATUSES.has(record.attendanceStatus)) attended += 1;
				if (record.attendanceStatus === 'absent') absent += 1;
				if (record.attendanceStatus === 'late') late += 1;
				if (record.attendanceStatus === 'excused') excused += 1;
				if (record.attendanceStatus === 'left_early') leftEarly += 1;
			}

			for (const record of sortedByDate) {
				if (record.attendanceStatus === 'absent') {
					streakAbsent += 1;
					continue;
				}
				if (record.attendanceStatus === 'unmarked') continue;
				break;
			}

			const rate = marked > 0 ? (attended / marked) * 100 : 0;
			const reasons: string[] = [];
			if (absent >= 3) reasons.push(`Vắng ${absent} buổi`);
			if (late >= 4) reasons.push(`Đi trễ ${late} buổi`);
			if (streakAbsent >= 2) reasons.push(`Vắng liên tiếp ${streakAbsent} buổi`);
			if (marked >= 4 && rate < 70) reasons.push(`Tỷ lệ chuyên cần ${formatPercent(rate)}`);

			const riskScore = absent * 3 + late * 2 + streakAbsent * 4 + Math.max(0, 70 - rate);

			next.set(student.id, {
				student,
				total: studentRecords.length,
				marked,
				attended,
				absent,
				late,
				excused,
				leftEarly,
				unmarked,
				rate,
				streakAbsent,
				reasons,
				riskScore
			});
		}

		return next;
	});

	const warningStudents = $derived.by(() =>
		[...studentInsightMap.values()]
			.filter((item) => item.reasons.length > 0)
			.sort((a, b) => b.riskScore - a.riskScore)
			.slice(0, 8)
	);

	const topStudents = $derived.by(() =>
		[...studentInsightMap.values()]
			.filter((item) => item.marked >= 4)
			.sort((a, b) => {
				if (b.rate !== a.rate) return b.rate - a.rate;
				if (b.attended !== a.attended) return b.attended - a.attended;
				return a.student.fullName.localeCompare(b.student.fullName);
			})
			.slice(0, 8)
	);

	const weeklyTrends = $derived.by<WeeklyTrendRow[]>(() => {
		const weekCount = rangeDays === 7 ? 4 : rangeDays === 30 ? 8 : 14;
		const currentWeekStartIso = getWeekStartIso(todayIso);
		const currentWeekStart = parseIsoDate(currentWeekStartIso);
		if (Number.isNaN(currentWeekStart.getTime())) return [];

		const rows: WeeklyTrendRow[] = [];
		const map = new Map<string, WeeklyTrendRow>();
		for (let index = weekCount - 1; index >= 0; index -= 1) {
			const date = new Date(currentWeekStart);
			date.setDate(date.getDate() - index * 7);
			const weekKey = toIsoDate(date);
			const label = `${date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}`;
			const row: WeeklyTrendRow = {
				weekKey,
				label,
				present: 0,
				late: 0,
				excused: 0,
				leftEarly: 0,
				absent: 0,
				unmarked: 0,
				total: 0
			};
			rows.push(row);
			map.set(weekKey, row);
		}

		for (const record of recordsInRange) {
			const session = sessionMap.get(record.sessionId);
			if (!session) continue;
			const weekKey = getWeekStartIso(session.sessionDate);
			const row = map.get(weekKey);
			if (!row) continue;
			row.total += 1;
			if (record.attendanceStatus === 'present') row.present += 1;
			if (record.attendanceStatus === 'late') row.late += 1;
			if (record.attendanceStatus === 'excused') row.excused += 1;
			if (record.attendanceStatus === 'left_early') row.leftEarly += 1;
			if (record.attendanceStatus === 'absent') row.absent += 1;
			if (record.attendanceStatus === 'unmarked') row.unmarked += 1;
		}

		return rows;
	});

	const clubPerformance = $derived.by<ClubAttendanceInsight[]>(() => {
		const sessionIdsByClub = new Map<string, Set<string>>();
		for (const session of sessionsInRange) {
			const set = sessionIdsByClub.get(session.clubId) ?? new Set<string>();
			set.add(session.id);
			sessionIdsByClub.set(session.clubId, set);
		}

		return activeClubs
			.map((club) => {
				const sessionIds = sessionIdsByClub.get(club.id) ?? new Set<string>();
				const clubRecords = recordsInRange.filter((record) => sessionIds.has(record.sessionId));
				const marked = clubRecords.filter((record) => record.attendanceStatus !== 'unmarked').length;
				const attended = clubRecords.filter((record) => ATTENDED_STATUSES.has(record.attendanceStatus))
					.length;
				const absent = clubRecords.filter((record) => record.attendanceStatus === 'absent').length;
				const late = clubRecords.filter((record) => record.attendanceStatus === 'late').length;
				const rate = marked > 0 ? (attended / marked) * 100 : 0;
				return {
					club,
					sessionCount: sessionIds.size,
					total: clubRecords.length,
					marked,
					attended,
					absent,
					late,
					rate
				};
			})
			.filter((item) => item.total > 0)
			.sort((a, b) => a.rate - b.rate);
	});

	const selectedStudentInsight = $derived.by(() => {
		if (!selectedStudentId) return null;
		return studentInsightMap.get(selectedStudentId) ?? null;
	});

	const selectedStudentRecentHistory = $derived.by(() => {
		if (!selectedStudentId) return [];
		return recordsInRange
			.filter((record) => record.studentId === selectedStudentId)
			.map((record) => {
				const session = sessionMap.get(record.sessionId);
				const club = session ? clubMap.get(session.clubId) : undefined;
				return {
					record,
					sessionDate: session?.sessionDate ?? '',
					clubName: club?.name ?? 'N/A'
				};
			})
			.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
			.slice(0, 10);
	});

	const summaryCards = $derived.by<SummaryCard[]>(() => [
		{
			label: 'Tỷ lệ chuyên cần',
			value: formatPercent(overallAttendanceRate),
			icon: 'icon-[mdi--chart-line]',
			description: 'Có mặt + đi trễ + về sớm trên các bản ghi đã điểm danh',
			tone: 'text-emerald-700'
		},
		{
			label: 'Mức hoàn tất điểm danh',
			value: formatPercent(sessionCompletionRate),
			icon: 'icon-[mdi--clipboard-check-outline]',
			description: `${attendanceTotals.marked}/${attendanceTotals.total} bản ghi đã được đánh dấu trạng thái`,
			tone: 'text-sky-700'
		},
		{
			label: 'Võ sinh cần chú ý',
			value: String(warningStudents.length),
			icon: 'icon-[mdi--alert-outline]',
			description: 'Có dấu hiệu vắng nhiều, trễ nhiều hoặc chuyên cần thấp',
			tone: 'text-rose-700'
		},
		{
			label: 'Võ sinh hoạt động',
			value: String(activeStudents.length),
			icon: 'icon-[mdi--account-check-outline]',
			description: `Theo dõi trong ${rangeDays} ngày gần nhất`,
			tone: 'text-slate-700'
		}
	]);

	$effect(() => {
		const candidateId = warningStudents[0]?.student.id ?? topStudents[0]?.student.id ?? '';
		if (!selectedStudentId && candidateId) {
			selectedStudentId = candidateId;
			return;
		}

		if (!selectedStudentId) return;
		if (studentInsightMap.has(selectedStudentId)) return;
		selectedStudentId = candidateId;
	});
</script>

<main class="mx-auto max-w-7xl space-y-6 px-4 py-6">
	<PageHeader
		eyebrow="Tổng quan"
		title="Đánh giá điểm danh võ sinh"
		description="Tập trung vào chất lượng chuyên cần, cảnh báo sớm và xu hướng điểm danh theo CLB."
	>
		{#snippet actions()}
			<a
				class="inline-flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-slate-300"
				href="/attendance"
				use:tooltip={{ text: 'Mở điểm danh', placement: 'bottom' }}
				aria-label="Mở điểm danh"
			>
				<span class="icon-[mdi--clipboard-check-outline] size-4"></span>
			</a>
			<a
				class="inline-flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:border-slate-300"
				href="/students"
				use:tooltip={{ text: 'Quản lý võ sinh', placement: 'bottom' }}
				aria-label="Quản lý võ sinh"
			>
				<span class="icon-[mdi--account-school-outline] size-4"></span>
			</a>
		{/snippet}
	</PageHeader>

	<div class="flex flex-wrap items-center gap-2">
		<span class="text-sm font-medium text-slate-600">Khung thời gian:</span>
		{#each [7, 30, 90] as dayOption (dayOption)}
			<button
				type="button"
				class={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
					rangeDays === dayOption
						? 'border-slate-900 bg-slate-900 text-white'
						: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
				}`}
				onclick={() => setRange(dayOption as RangeDays)}
			>
				{dayOption} ngày
			</button>
		{/each}
		<span class="text-sm text-slate-500">{formatDate(rangeStartIso)} - {formatDate(todayIso)}</span>
	</div>

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
						<p class={`text-3xl font-bold ${card.tone}`}>{isLoading ? '...' : card.value}</p>
					</div>
					<div class="rounded-xl bg-slate-900 p-3 text-white">
						<span class={`${card.icon} size-5`}></span>
					</div>
				</div>
				<p class="mt-4 text-sm text-slate-600">{card.description}</p>
			</article>
		{/each}
	</section>

	<section class="grid gap-6 xl:grid-cols-2">
		<SectionCard title="Cảnh báo sớm" description="Ưu tiên các võ sinh có rủi ro chuyên cần cao">
			{#if warningStudents.length === 0}
				<EmptyState
					title="Chưa có cảnh báo"
					description="Không phát hiện võ sinh vượt ngưỡng cảnh báo trong khung thời gian đã chọn."
				/>
			{:else}
				<div class="space-y-3">
					{#each warningStudents as item (item.student.id)}
						<button
							type="button"
							class={`w-full rounded-xl border px-4 py-3 text-left transition ${
								selectedStudentId === item.student.id
									? 'border-rose-300 bg-rose-50'
									: 'border-slate-200 bg-white hover:border-slate-300'
							}`}
							onclick={() => openQuickProfile(item.student.id)}
						>
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="font-semibold text-slate-900">{item.student.fullName}</p>
									<p class="text-sm text-slate-500">
										{item.student.studentCode ?? 'Chưa có mã'} • {formatPercent(item.rate)}
									</p>
								</div>
								<span class="rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700"
									>Risk {Math.round(item.riskScore)}</span
								>
							</div>
							<p class="mt-2 text-sm text-rose-700">{item.reasons.join(' • ')}</p>
						</button>
					{/each}
				</div>
			{/if}
		</SectionCard>

		<SectionCard
			title="Top chuyên cần"
			description="Võ sinh có tỷ lệ chuyên cần tốt nhất (tối thiểu 4 buổi đã điểm danh)"
		>
			{#if topStudents.length === 0}
				<EmptyState
					title="Chưa đủ dữ liệu"
					description="Cần thêm dữ liệu điểm danh để xếp hạng chuyên cần."
				/>
			{:else}
				<div class="space-y-3">
					{#each topStudents as item, index (item.student.id)}
						<button
							type="button"
							class={`w-full rounded-xl border px-4 py-3 text-left transition ${
								selectedStudentId === item.student.id
									? 'border-emerald-300 bg-emerald-50'
									: 'border-slate-200 bg-white hover:border-slate-300'
							}`}
							onclick={() => (selectedStudentId = item.student.id)}
						>
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="font-semibold text-slate-900">#{index + 1} {item.student.fullName}</p>
									<p class="text-sm text-slate-500">
										{item.attended}/{item.marked} buổi đạt chuyên cần
									</p>
								</div>
								<span class="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700"
									>{formatPercent(item.rate)}</span
								>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</SectionCard>
	</section>

	<section class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
		<SectionCard title="Xu hướng điểm danh theo tuần" description="Theo dõi biến động trạng thái qua từng tuần">
			{#if weeklyTrends.length === 0}
				<EmptyState
					title="Chưa có dữ liệu xu hướng"
					description="Tạo và cập nhật điểm danh để xem xu hướng tuần."
				/>
			{:else}
				<div class="space-y-3">
					{#each weeklyTrends as row (row.weekKey)}
						<div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
							<div class="mb-2 flex items-center justify-between text-sm">
								<p class="font-semibold text-slate-800">Tuần {row.label}</p>
								<p class="text-slate-500">{row.total} bản ghi</p>
							</div>
							<div class="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
								<div class="rounded-lg bg-emerald-100 px-2 py-1 text-emerald-700">CM: {row.present}</div>
								<div class="rounded-lg bg-amber-100 px-2 py-1 text-amber-700">Trễ: {row.late}</div>
								<div class="rounded-lg bg-sky-100 px-2 py-1 text-sky-700">Phép: {row.excused}</div>
								<div class="rounded-lg bg-cyan-100 px-2 py-1 text-cyan-700">Sớm: {row.leftEarly}</div>
								<div class="rounded-lg bg-rose-100 px-2 py-1 text-rose-700">Vắng: {row.absent}</div>
								<div class="rounded-lg bg-slate-200 px-2 py-1 text-slate-700">Chưa: {row.unmarked}</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</SectionCard>

		<SectionCard title="Hiệu suất theo CLB" description="Khoanh vùng CLB đang có tỷ lệ chuyên cần thấp">
			{#if clubPerformance.length === 0}
				<EmptyState
					title="Chưa có dữ liệu CLB"
					description="Chưa có bản ghi điểm danh trong khung thời gian đã chọn."
				/>
			{:else}
				<div class="space-y-3">
					{#each clubPerformance as item (item.club.id)}
						<div class="rounded-xl border border-slate-200 bg-white px-4 py-3">
							<div class="flex items-center justify-between gap-3">
								<p class="font-semibold text-slate-900">{item.club.name}</p>
								<span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
									>{item.sessionCount} buổi</span
								>
							</div>
							<div class="mt-2 flex items-center justify-between text-sm text-slate-600">
								<span>Chuyên cần</span>
								<span class="font-semibold text-slate-900">{formatPercent(item.rate)}</span>
							</div>
							<div class="mt-2 h-2 rounded-full bg-slate-100">
								<div class="h-2 rounded-full bg-slate-900" style={`width: ${Math.min(item.rate, 100)}%`}></div>
							</div>
							<p class="mt-2 text-xs text-slate-500">
								Vắng: {item.absent} • Trễ: {item.late} • Đã điểm danh: {item.marked}/{item.total}
							</p>
						</div>
					{/each}
				</div>
			{/if}
		</SectionCard>
	</section>

	<section>
		<SectionCard title="Tình trạng dữ liệu" description="Thông tin hỗ trợ theo dõi sync và chuẩn hóa dữ liệu">
			<div class="space-y-3">
				<div class="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
					<div>
						<p class="font-medium text-slate-900">Thay đổi cục bộ chờ đồng bộ</p>
						<p class="text-sm text-slate-500">Bao gồm CLB, cấp đai, võ sinh, điểm danh</p>
					</div>
					<p class="text-2xl font-bold text-slate-900">{pendingChangesCount}</p>
				</div>

				<div class="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
					<div>
						<p class="font-medium text-slate-900">Võ sinh chưa có mã</p>
						<p class="text-sm text-slate-500">Mã sẽ tạo ở backend khi sync</p>
					</div>
					<p class="text-2xl font-bold text-slate-900">{studentsWithoutCodeCount}</p>
				</div>

				<div class="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
					<div>
						<p class="font-medium text-slate-900">Buổi điểm danh trong kỳ</p>
						<p class="text-sm text-slate-500">Số buổi dùng để tính KPI hiện tại</p>
					</div>
					<p class="text-2xl font-bold text-slate-900">{sessionsInRange.length}</p>
				</div>
			</div>

			{#if activeClubs.length === 0 || activeStudents.length === 0}
				<div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					{#if activeClubs.length === 0}
						Chưa có CLB hoạt động để tính điểm danh.
					{:else}
						Chưa có võ sinh hoạt động để đánh giá chuyên cần.
					{/if}
				</div>
			{/if}
		</SectionCard>
	</section>
</main>

<AppModal
	open={isQuickProfileModalOpen}
	title="Hồ sơ nhanh võ sinh"
	description="Xem nhanh kết quả điểm danh gần nhất."
	size="lg"
	onClose={closeQuickProfileModal}
>
	{#if !selectedStudentInsight}
		<EmptyState
			title="Chưa chọn võ sinh"
			description="Hãy chọn một võ sinh ở danh sách Cảnh báo sớm."
		/>
	{:else}
		<div class="space-y-4">
			<div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="text-lg font-semibold text-slate-900">
							{selectedStudentInsight.student.fullName}
						</p>
						<p class="text-sm text-slate-500">
							{selectedStudentInsight.student.studentCode ?? 'Chưa có mã'}
						</p>
					</div>
					<a
						href={
							selectedStudentInsight.student.studentCode
								? `/students/${encodeURIComponent(selectedStudentInsight.student.studentCode)}`
								: `/students?studentId=${encodeURIComponent(selectedStudentInsight.student.id)}&open=1`
						}
						class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						<span class="icon-[mdi--open-in-new] size-4"></span>
						<span>Mở trang hồ sơ</span>
					</a>
				</div>
				<div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
					<div class="rounded-lg bg-white px-3 py-2 text-sm">
						<p class="text-slate-500">Chuyên cần</p>
						<p class="font-semibold text-slate-900">{formatPercent(selectedStudentInsight.rate)}</p>
					</div>
					<div class="rounded-lg bg-white px-3 py-2 text-sm">
						<p class="text-slate-500">Vắng</p>
						<p class="font-semibold text-rose-700">{selectedStudentInsight.absent}</p>
					</div>
					<div class="rounded-lg bg-white px-3 py-2 text-sm">
						<p class="text-slate-500">Đi trễ</p>
						<p class="font-semibold text-amber-700">{selectedStudentInsight.late}</p>
					</div>
					<div class="rounded-lg bg-white px-3 py-2 text-sm">
						<p class="text-slate-500">Vắng liên tiếp</p>
						<p class="font-semibold text-slate-900">{selectedStudentInsight.streakAbsent}</p>
					</div>
				</div>
			</div>

			{#if selectedStudentRecentHistory.length === 0}
				<EmptyState
					title="Chưa có lịch sử điểm danh"
					description="Võ sinh này chưa có dữ liệu trong khung thời gian đã chọn."
				/>
			{:else}
				<div class="space-y-2">
					{#each selectedStudentRecentHistory as item (`quick-modal:${item.record.id}:${item.sessionDate}`)}
						<div
							class="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
						>
							<div>
								<p class="text-sm font-medium text-slate-800">{formatDate(item.sessionDate)}</p>
								<p class="text-xs text-slate-500">{item.clubName}</p>
							</div>
							<div
								class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
							>
								<span
									class={`size-2 rounded-full ${getStatusDotClass(item.record.attendanceStatus)}`}
								></span>
								<span>{getStatusLabel(item.record.attendanceStatus)}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</AppModal>
