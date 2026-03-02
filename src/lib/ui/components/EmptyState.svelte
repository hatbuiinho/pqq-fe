<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		description: string;
		action?: Snippet;
	};

	let { title, description, action }: Props = $props();
</script>

<div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center">
	<div class="mx-auto max-w-md space-y-2">
		<h3 class="text-base font-semibold text-slate-900">{title}</h3>
		<p class="text-sm text-slate-500">{description}</p>
	</div>

	{#if action}
		<div class="mt-4 flex justify-center">
			{@render action()}
		</div>
	{/if}
</div>
