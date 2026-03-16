<script lang="ts">
	import AppModal from '$lib/ui/components/AppModal.svelte';

	type Props = {
		open: boolean;
		src?: string;
		title?: string;
		onClose?: () => void;
	};

	let { open, src = '', title = 'Image preview', onClose }: Props = $props();
</script>

<AppModal {open} {title} {onClose} size="xl">
	<div class="flex items-center justify-center">
		{#if src}
			<img
				{src}
				alt={title}
				class="max-h-[70dvh] w-auto max-w-full rounded-xl border border-slate-200 bg-slate-50 object-contain"
			/>
		{/if}
	</div>
</AppModal>
