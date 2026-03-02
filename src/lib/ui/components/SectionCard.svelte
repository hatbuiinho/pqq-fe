<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title?: string;
		description?: string;
		actions?: Snippet;
		children?: Snippet;
		class?: string;
	};

	let { title, description, actions, children, class: className = '' }: Props = $props();
</script>

<section class={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
	{#if title || description || actions}
		<div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div>
				{#if title}
					<h2 class="text-lg font-semibold text-slate-900">{title}</h2>
				{/if}
				{#if description}
					<p class="text-sm text-slate-500">{description}</p>
				{/if}
			</div>

			{#if actions}
				<div class="flex flex-wrap items-center gap-2">
					{@render actions()}
				</div>
			{/if}
		</div>
	{/if}

	{@render children?.()}
</section>
