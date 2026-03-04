<script lang="ts">
	type Props = {
		name: string;
		src?: string;
		sizeClass?: string;
		textClass?: string;
	};

	let {
		name,
		src = '',
		sizeClass = 'size-10',
		textClass = 'text-sm'
	}: Props = $props();

	const initials = $derived.by(() =>
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);
</script>

<div class={`${sizeClass} shrink-0 overflow-hidden rounded-full bg-slate-200 ring-1 ring-slate-200`}>
	{#if src}
		<img class="h-full w-full object-cover" src={src} alt={name} />
	{:else}
		<div class={`flex h-full w-full items-center justify-center bg-slate-900/85 font-semibold text-white ${textClass}`}>
			{initials}
		</div>
	{/if}
</div>
