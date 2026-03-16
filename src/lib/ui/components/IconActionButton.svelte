<script lang="ts">
	import { tooltip, type TooltipOptions } from '$lib';

	type Props = {
		icon: string;
		label: string;
		variant?: 'default' | 'primary' | 'danger';
		tooltipText?: string | TooltipOptions;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		onclick?: (event: MouseEvent) => void;
	};

	let {
		icon,
		label,
		variant = 'default',
		tooltipText,
		type = 'button',
		disabled = false,
		onclick
	}: Props = $props();

	const variantClass = $derived.by(() => {
		if (variant === 'primary') return 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800';
		if (variant === 'danger') return 'border-red-300 text-red-700 bg-white hover:bg-red-50';
		return 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50';
	});
</script>

<button
	{type}
	class={`inline-flex size-10 items-center justify-center rounded-lg border transition ${variantClass}`}
	use:tooltip={tooltipText ?? label}
	aria-label={label}
	{disabled}
	{onclick}
>
	<span class={`${icon} size-4`}></span>
</button>
