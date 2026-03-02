<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		eyebrow?: string;
		title: string;
		description?: string;
		actions?: Snippet;
	};

	let { eyebrow, title, description, actions }: Props = $props();
</script>

<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
	<div class="space-y-2">
		{#if eyebrow}
			<p class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{eyebrow}</p>
		{/if}
		<h1 class="text-3xl font-bold text-slate-900">{title}</h1>
		{#if description}
			<p class="max-w-2xl text-slate-600">{description}</p>
		{/if}
	</div>

	{#if actions}
		<div class="flex flex-wrap items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</header>
