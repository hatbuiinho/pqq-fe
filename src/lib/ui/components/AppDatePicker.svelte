<script lang="ts">
	import { DatePicker } from '@svelte-plugins/datepicker';

	type Props = {
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		showAgePresets?: boolean;
		showYearPresets?: boolean;
		minAge?: number;
		maxAge?: number;
		minYear?: number;
		maxYear?: number;
		iconOnly?: boolean;
	};

	let {
		value = $bindable(''),
		placeholder = 'Select date',
		disabled = false,
		showAgePresets = false,
		showYearPresets = false,
		minAge = 8,
		maxAge = 50,
		minYear,
		maxYear,
		iconOnly = false
	}: Props = $props();

	let isOpen = $state(false);
	let startDate = $state<Date | string | number | null>(normalizeDate(value));
	let lastSerializedValue = $state(value);

	function normalizeDate(dateValue: Date | string | number | null | undefined): Date | null {
		if (!dateValue) return null;

		if (dateValue instanceof Date) {
			return Number.isNaN(dateValue.getTime()) ? null : dateValue;
		}

		if (typeof dateValue === 'number') {
			const parsed = new Date(dateValue);
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}

		if (typeof dateValue === 'string') {
			const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
			if (isoMatch) {
				const [, year, month, day] = isoMatch;
				const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
				return Number.isNaN(parsed.getTime()) ? null : parsed;
			}

			const parsed = new Date(dateValue);
			return Number.isNaN(parsed.getTime()) ? null : parsed;
		}

		return null;
	}

	function formatDate(dateValue: Date | string | number | null): string {
		const normalized = normalizeDate(dateValue);
		if (!normalized) return '';

		const year = normalized.getFullYear();
		const month = String(normalized.getMonth() + 1).padStart(2, '0');
		const day = String(normalized.getDate()).padStart(2, '0');

		return `${year}-${month}-${day}`;
	}

	function handleInputClick() {
		if (!disabled) {
			isOpen = !isOpen;
		}
	}

	function createDateFromYear(year: number): Date {
		const base = normalizeDate(startDate) ?? new Date();
		return new Date(year, base.getMonth(), base.getDate(), 12, 0, 0);
	}

	const yearPresetOptions = $derived.by(() => {
		if (!showAgePresets && !showYearPresets) return [];

		const now = new Date();
		const computedNewestYear = now.getFullYear() - minAge;
		const computedOldestYear = now.getFullYear() - maxAge;
		const newestYear = maxYear ?? computedNewestYear;
		const oldestYear = minYear ?? computedOldestYear;
		if (newestYear < oldestYear) return [];

		const length = newestYear - oldestYear + 1;
		return Array.from({ length }, (_, index) => {
			const year = newestYear - index;
			return {
				year,
				value: formatDate(createDateFromYear(year))
			};
		});
	});

	function applyYearPreset(year: number) {
		const presetDate = createDateFromYear(year);
		startDate = presetDate;
		isOpen = false;
	}

	$effect(() => {
		if (value !== lastSerializedValue) {
			startDate = normalizeDate(value);
			lastSerializedValue = value;
		}
	});

	$effect(() => {
		const nextValue = formatDate(startDate);
		if (nextValue !== lastSerializedValue) {
			value = nextValue;
			lastSerializedValue = nextValue;
			isOpen = false;
		}
	});
</script>

<div class="space-y-2">
	<DatePicker bind:isOpen bind:startDate includeFont={false} enableFutureDates={false}>
		<button
			type="button"
			class={`disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
				iconOnly
					? 'inline-flex size-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
					: 'flex w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900'
			}`}
			onclick={handleInputClick}
			{disabled}
			aria-label={placeholder}
			title={placeholder}
		>
			<span class="icon-[mdi--calendar-month-outline] size-4 shrink-0 text-slate-500"></span>
			{#if !iconOnly}
				<span class={`truncate ${value ? 'text-slate-900' : 'text-slate-400'}`}>
					{value || placeholder}
				</span>
			{/if}
		</button>
	</DatePicker>

	{#if showAgePresets || showYearPresets}
		<div class="-mx-1 overflow-x-auto px-1 pb-1">
			<div class="flex min-w-max gap-2">
				{#each yearPresetOptions as option (option.year)}
					<button
						type="button"
						class={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
							value === option.value
								? 'border-slate-900 bg-slate-900 text-white'
								: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
						}`}
						onclick={() => applyYearPreset(option.year)}
						{disabled}
					>
						{option.year}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
