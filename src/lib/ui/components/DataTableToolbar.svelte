<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		searchValue?: string;
		searchPlaceholder?: string;
		filters?: Snippet;
		actions?: Snippet;
	};

	let {
		searchValue = $bindable(''),
		searchPlaceholder = 'Search',
		filters,
		actions
	}: Props = $props();
</script>

<div class="mb-2 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
	<div class="grid gap-2 md:grid-cols-2 xl:flex xl:min-w-0 xl:flex-1 xl:items-center">
		<input
			class="w-full rounded-lg border-slate-300 xl:min-w-0 xl:flex-1"
			placeholder={searchPlaceholder}
			bind:value={searchValue}
		/>

		{#if filters}
			{@render filters()}
		{/if}
	</div>

	{#if actions}
		<div class="flex items-center justify-end gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
