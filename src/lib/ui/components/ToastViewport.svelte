<script lang="ts">
	import { removeToast, toasts, type ToastItem } from '$lib/app/toast';

	function toastStyles(toast: ToastItem): string {
		if (toast.type === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
		if (toast.type === 'error') return 'border-red-200 bg-red-50 text-red-800';
		return 'border-sky-200 bg-sky-50 text-sky-800';
	}

	function iconClass(toast: ToastItem): string {
		if (toast.type === 'success') return 'icon-[mdi--check-circle-outline]';
		if (toast.type === 'error') return 'icon-[mdi--alert-circle-outline]';
		return 'icon-[mdi--information-outline]';
	}
</script>

<div class="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
	{#each $toasts as toast (toast.id)}
		<div class={`pointer-events-auto rounded-xl border px-3 py-2 shadow-sm ${toastStyles(toast)}`}>
			<div class="flex items-start gap-2">
				<span class={`${iconClass(toast)} mt-0.5 size-5 shrink-0`}></span>
				<p class="flex-1 text-sm font-medium">{toast.message}</p>
				<button
					type="button"
					class="rounded p-0.5 hover:bg-black/5"
					aria-label="Dismiss notification"
					onclick={() => removeToast(toast.id)}
				>
					<span class="icon-[mdi--close] size-4"></span>
				</button>
			</div>
		</div>
	{/each}
</div>
