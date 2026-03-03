<script lang="ts">
	import type { BeltRank, Club, ClubGroup, Gender, StudentStatus, Weekday } from '$lib/domain/models';
	import { formatWeekdayList, sortWeekdays, WEEKDAY_OPTIONS } from '$lib/domain/schedule-utils';
	import AppDatePicker from '$lib/ui/components/AppDatePicker.svelte';
	import AppModal from '$lib/ui/components/AppModal.svelte';
	import type { StudentFormErrors, StudentFormValue } from '$lib/ui/components/student-form';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		form: StudentFormValue;
		errors?: StudentFormErrors;
		selectedCustomScheduleDays?: Weekday[];
		availableClubs?: Club[];
		availableGroups?: ClubGroup[];
		availableBeltRanks?: BeltRank[];
		availableClubTrainingDays?: Weekday[];
		onClose?: () => void;
		onSubmit?: () => void;
		submitLabel?: string;
		cancelLabel?: string;
		isSubmitting?: boolean;
		showScheduleSection?: boolean;
		showClubSelector?: boolean;
		clubReadonlyName?: string;
		showStatusField?: boolean;
		studentCodeDisplay?: string;
		showStudentCode?: boolean;
		statusOptions?: Array<{ label: string; value: StudentStatus }>;
	};

	const genderOptions: Array<{ label: string; value: Gender }> = [
		{ label: 'Male', value: 'male' },
		{ label: 'Female', value: 'female' }
	];

	const defaultStatusOptions: Array<{ label: string; value: StudentStatus }> = [
		{ label: 'Active', value: 'active' },
		{ label: 'Inactive', value: 'inactive' },
		{ label: 'Suspended', value: 'suspended' }
	];

	let {
		open,
		title,
		description = '',
		form = $bindable(),
		errors = {},
		selectedCustomScheduleDays = $bindable([]),
		availableClubs = [],
		availableGroups = [],
		availableBeltRanks = [],
		availableClubTrainingDays = [],
		onClose,
		onSubmit,
		submitLabel = 'Save student',
		cancelLabel = 'Cancel',
		isSubmitting = false,
		showScheduleSection = true,
		showClubSelector = true,
		clubReadonlyName = '',
		showStatusField = true,
		studentCodeDisplay = 'Generated on sync',
		showStudentCode = true,
		statusOptions = defaultStatusOptions
	}: Props = $props();

	function toggleCustomScheduleDay(weekday: Weekday) {
		const allowedDays = new Set(availableClubTrainingDays);
		if (!allowedDays.has(weekday)) return;

		if (selectedCustomScheduleDays.includes(weekday)) {
			selectedCustomScheduleDays = selectedCustomScheduleDays.filter((value) => value !== weekday);
			return;
		}

		selectedCustomScheduleDays = sortWeekdays([...selectedCustomScheduleDays, weekday]);
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onSubmit?.();
	}
</script>

<AppModal open={open} title={title} description={description} onClose={onClose}>
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

		{#if showStudentCode}
			<label class="min-w-0 space-y-1">
				<span class="text-sm font-medium text-slate-700">Student code</span>
				<input
					class="w-full rounded-lg border-slate-300 bg-slate-100 text-slate-500"
					value={studentCodeDisplay}
					readonly
					disabled
				/>
				<span class="block text-xs text-slate-500">Backend sync will generate code in the format `PQQ-000001`.</span>
			</label>
		{/if}

		{#if showClubSelector}
			<label class="min-w-0 space-y-1">
				<span class="text-sm font-medium text-slate-700">Club *</span>
				<select class:border-red-300={!!errors.clubId} class="w-full rounded-lg border-slate-300" bind:value={form.clubId} required>
					<option value="">Select a club</option>
					{#each availableClubs as club (club.id)}
						<option value={club.id}>{club.name}</option>
					{/each}
				</select>
				{#if errors.clubId}
					<span class="block text-xs text-red-600">{errors.clubId}</span>
				{/if}
			</label>
		{:else if clubReadonlyName}
			<label class="min-w-0 space-y-1">
				<span class="text-sm font-medium text-slate-700">Club</span>
				<input class="w-full rounded-lg border-slate-300 bg-slate-100 text-slate-500" value={clubReadonlyName} readonly disabled />
			</label>
		{/if}

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Group</span>
			<select class:border-red-300={!!errors.groupId} class="w-full rounded-lg border-slate-300" bind:value={form.groupId}>
				<option value="">No group</option>
				{#each availableGroups as group (group.id)}
					<option value={group.id}>{group.name}</option>
				{/each}
			</select>
			{#if errors.groupId}
				<span class="block text-xs text-red-600">{errors.groupId}</span>
			{/if}
		</label>

		<label class="min-w-0 space-y-1">
			<span class="text-sm font-medium text-slate-700">Belt rank *</span>
			<select class:border-red-300={!!errors.beltRankId} class="w-full rounded-lg border-slate-300" bind:value={form.beltRankId} required>
				<option value="">Select a belt rank</option>
				{#each availableBeltRanks as beltRank (beltRank.id)}
					<option value={beltRank.id}>{beltRank.name}</option>
				{/each}
			</select>
			{#if errors.beltRankId}
				<span class="block text-xs text-red-600">{errors.beltRankId}</span>
			{/if}
		</label>

		{#if showClubSelector}
			<p class="text-xs text-slate-500 md:col-span-2">
				Only synced active clubs and belt ranks can be assigned to students.
			</p>
		{/if}

		{#if showScheduleSection}
			<div class="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
				<div class="space-y-1">
					<span class="text-sm font-medium text-slate-700">Schedule</span>
					<p class="text-xs text-slate-500">
						Students can inherit the club schedule or use a custom subset of the club training days.
					</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
						<input type="radio" name="scheduleMode" bind:group={form.scheduleMode} value="inherit" />
						<span>Use club schedule</span>
					</label>
					<label class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
						<input type="radio" name="scheduleMode" bind:group={form.scheduleMode} value="custom" />
						<span>Custom schedule</span>
					</label>
				</div>
				<p class="text-xs text-slate-500">
					Club training days: {formatWeekdayList(availableClubTrainingDays) || 'No training days configured for this club yet.'}
				</p>
				{#if form.scheduleMode === 'custom'}
					<div class="space-y-2">
						<div class="flex flex-wrap gap-2">
							{#each WEEKDAY_OPTIONS as option (option.value)}
								<button
									type="button"
									class={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
										selectedCustomScheduleDays.includes(option.value)
											? 'border-slate-900 bg-slate-900 text-white'
											: availableClubTrainingDays.includes(option.value)
												? 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
												: 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
									}`}
									onclick={() => toggleCustomScheduleDay(option.value)}
									disabled={!availableClubTrainingDays.includes(option.value)}
								>
									{option.shortLabel}
								</button>
							{/each}
						</div>
						{#if errors.scheduleDays}
							<span class="block text-xs text-red-600">{errors.scheduleDays}</span>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

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

		{#if showStatusField}
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
				{isSubmitting ? 'Saving...' : submitLabel}
			</button>
			<button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium" type="button" onclick={onClose}>
				{cancelLabel}
			</button>
		</div>
	</form>
</AppModal>
