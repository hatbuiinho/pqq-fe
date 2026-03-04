<script lang="ts">
	import { onMount } from 'svelte';
	import { normalizeSearchText } from '$lib/domain/string-utils';

	export type SuggestionOption = {
		id: string;
		label: string;
		meta?: string;
		searchText?: string;
	};

	type Props = {
		value: string;
		options: SuggestionOption[];
		placeholder?: string;
		disabled?: boolean;
		maxSuggestions?: number;
		emptyText?: string;
		onInputChange?: (value: string) => void;
		onSelect?: (option: SuggestionOption) => void;
	};

	let {
		value,
		options,
		placeholder = 'Search',
		disabled = false,
		maxSuggestions = 5,
		emptyText = 'No results.',
		onInputChange,
		onSelect
	}: Props = $props();

	let isOpen = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	let dropdownStyle = $state('');

	const filteredOptions = $derived.by(() => {
		const normalizedQuery = normalizeSearchText(value);
		if (!normalizedQuery) {
			return options.slice(0, maxSuggestions);
		}

		return options
			.filter((option) =>
				normalizeSearchText(option.searchText ?? `${option.label} ${option.meta ?? ''}`).includes(
					normalizedQuery
				)
			)
			.slice(0, maxSuggestions);
	});

	function handleFocus() {
		if (disabled) return;
		isOpen = true;
		updateDropdownPosition();
	}

	function handleBlur() {
		window.setTimeout(() => {
			isOpen = false;
		}, 120);
	}

	function handleInput(event: Event) {
		const nextValue = (event.currentTarget as HTMLInputElement).value;
		onInputChange?.(nextValue);
		isOpen = true;
		updateDropdownPosition();
	}

	function handleSelect(option: SuggestionOption) {
		onSelect?.(option);
		isOpen = false;
	}

	function updateDropdownPosition() {
		if (!inputEl) return;
		const rect = inputEl.getBoundingClientRect();
		const top = rect.bottom + 6;
		dropdownStyle = `top:${top}px;left:${rect.left}px;width:${rect.width}px;`;
	}

	function handleViewportChange() {
		if (!isOpen) return;
		updateDropdownPosition();
	}

	onMount(() => {
		window.addEventListener('resize', handleViewportChange);
		window.addEventListener('scroll', handleViewportChange, true);
		return () => {
			window.removeEventListener('resize', handleViewportChange);
			window.removeEventListener('scroll', handleViewportChange, true);
		};
	});
</script>

<div class="relative">
	<input
		bind:this={inputEl}
		type="text"
		class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
		{placeholder}
		{value}
		{disabled}
		onfocus={handleFocus}
		onblur={handleBlur}
		oninput={handleInput}
	/>

	{#if isOpen && !disabled}
		<div
			class="fixed z-70 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
			style={dropdownStyle}
		>
			{#if filteredOptions.length === 0}
				<p class="px-3 py-2 text-sm text-slate-500">{emptyText}</p>
			{:else}
				{#each filteredOptions as option (option.id)}
					<button
						type="button"
						class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
						onmousedown={(event) => {
							event.preventDefault();
							handleSelect(option);
						}}
					>
						<span class="truncate">{option.label}</span>
						{#if option.meta}
							<span class="shrink-0 text-xs text-slate-500">{option.meta}</span>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
