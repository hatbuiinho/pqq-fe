<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

	type Props = {
		open: boolean;
		title: string;
		description?: string;
		size?: ModalSize;
		fullScreenOnMobile?: boolean;
		allowOverflow?: boolean;
		closeOnBackdrop?: boolean;
		closeOnEscape?: boolean;
		children?: Snippet;
		footer?: Snippet;
		onClose?: () => void;
	};

	let {
		open,
		title,
		description,
		size = 'lg',
		fullScreenOnMobile = false,
		allowOverflow = false,
		closeOnBackdrop = true,
		closeOnEscape = true,
		children,
		footer,
		onClose
	}: Props = $props();

	const sizeClasses: Record<ModalSize, string> = {
		sm: 'max-w-lg',
		md: 'max-w-2xl',
		lg: 'max-w-4xl',
		xl: 'max-w-6xl'
	};

	function requestClose() {
		onClose?.();
	}

	function handleBackdropClick() {
		if (!closeOnBackdrop) return;
		requestClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open || !closeOnEscape) return;
		if (event.key !== 'Escape') return;
		event.preventDefault();
		requestClose();
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);

		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if open}
	<div class={`fixed inset-0 z-50 flex items-center justify-center ${fullScreenOnMobile ? 'p-0 sm:p-4' : 'p-4'}`}>
		<button
			type="button"
			class="absolute inset-0 bg-slate-900/45"
			onclick={handleBackdropClick}
			aria-label="Close modal"
		></button>
		<div
			class={`relative flex w-full min-w-0 flex-col bg-white shadow-xl ${
				fullScreenOnMobile
					? `h-dvh max-h-dvh rounded-none sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl ${sizeClasses[size]}`
					: `max-h-[90dvh] rounded-2xl ${sizeClasses[size]}`
			} ${allowOverflow ? 'overflow-visible' : 'overflow-hidden'}`}
			role="dialog"
			aria-modal="true"
			aria-label={title}
		>
			<header class="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:px-5">
				<div class="min-w-0 space-y-1">
					<h2 class="text-lg font-semibold text-slate-900">{title}</h2>
					{#if description}
						<p class="text-sm text-slate-500">{description}</p>
					{/if}
				</div>
				<button
					type="button"
					class="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
					onclick={requestClose}
					aria-label="Close modal"
				>
					<span class="icon-[mdi--close] size-5"></span>
				</button>
			</header>
			<div class={`min-w-0 flex-1 p-4 sm:px-5 ${allowOverflow ? 'overflow-visible' : 'overflow-y-auto'}`}>
				{@render children?.()}
			</div>
			{#if footer}
				<footer class="border-t border-slate-200 p-4 sm:px-5">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</div>
{/if}
