<script lang="ts">
	type Props = {
		currentPage: number;
		totalItems: number;
		pageSize?: number;
		onPageChange?: (page: number) => void;
	};

	let { currentPage = $bindable(), totalItems, pageSize = 10, onPageChange }: Props = $props();

	const totalPages = $derived.by(() => Math.max(1, Math.ceil(totalItems / pageSize)));
	const startItem = $derived.by(() => (totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1));
	const endItem = $derived.by(() => Math.min(currentPage * pageSize, totalItems));

	function goTo(page: number) {
		const nextPage = Math.min(Math.max(page, 1), totalPages);
		currentPage = nextPage;
		onPageChange?.(nextPage);
	}
</script>

<div class="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
	<p class="text-sm text-slate-500">
		Showing {startItem}-{endItem} of {totalItems}
	</p>

	<div class="flex items-center gap-2 self-end sm:self-auto">
		<button
			type="button"
			class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
			onclick={() => goTo(currentPage - 1)}
			disabled={currentPage <= 1}
		>
			Previous
		</button>
		<span class="min-w-20 text-center text-sm font-medium text-slate-700">{currentPage} / {totalPages}</span>
		<button
			type="button"
			class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
			onclick={() => goTo(currentPage + 1)}
			disabled={currentPage >= totalPages}
		>
			Next
		</button>
	</div>
</div>
