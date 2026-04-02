<script lang="ts">
	let { data } = $props();

	function formatDate(value?: string): string {
		if (!value) return '-';
		const date = new Date(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return value;
		return date.toLocaleDateString('vi-VN');
	}

	function formatGender(value?: string): string {
		if (value === 'male') return 'Nam';
		if (value === 'female') return 'Nữ';
		return '-';
	}
</script>

<svelte:head>
	<title>{data.seo.title}</title>
	<meta name="description" content={data.seo.description} />
	<link rel="canonical" href={data.seo.canonicalUrl} />

	<meta property="og:type" content="profile" />
	<meta property="og:title" content={data.seo.title} />
	<meta property="og:description" content={data.seo.description} />
	<meta property="og:url" content={data.seo.canonicalUrl} />
	{#if data.seo.ogImage}
		<meta property="og:image" content={data.seo.ogImage} />
	{/if}

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={data.seo.title} />
	<meta name="twitter:description" content={data.seo.description} />
	{#if data.seo.ogImage}
		<meta name="twitter:image" content={data.seo.ogImage} />
	{/if}
</svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
	<header class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-xs tracking-[0.2em] text-slate-500 uppercase">Hồ sơ võ sinh</p>
				<h1 class="mt-1 truncate text-2xl font-semibold text-slate-900">{data.profile.fullName}</h1>
				<p class="mt-1 text-sm text-slate-600">{data.profile.studentCode ?? 'Chưa có mã số'}</p>
			</div>
			<div class="flex items-center gap-2">
					<a
						class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
						href={
							data.profile.studentCode
								? `/students?studentCode=${encodeURIComponent(data.profile.studentCode)}&open=1`
								: `/students?studentId=${encodeURIComponent(data.profile.id)}&open=1`
						}
					>
						Mở popup chỉnh sửa
					</a>
				<a
					class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
					href="/students"
				>
					Danh sách võ sinh
				</a>
			</div>
		</div>
	</header>

	<section
		class="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[140px_minmax(0,1fr)] sm:p-5"
	>
		<div class="flex items-start justify-center sm:justify-start">
			{#if data.avatarThumbUrl || data.avatarUrl}
				<img
					src={data.avatarThumbUrl || data.avatarUrl}
					alt={`Avatar ${data.profile.fullName}`}
					class="h-28 w-28 rounded-2xl border border-slate-200 object-cover"
					loading="eager"
				/>
			{:else}
				<div
					class="flex h-28 w-28 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-xs font-medium tracking-[0.2em] text-slate-500 uppercase"
				>
					No avatar
				</div>
			{/if}
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">CLB</p>
				<p class="mt-1 font-medium text-slate-900">{data.profile.clubName}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Cấp đai</p>
				<p class="mt-1 font-medium text-slate-900">{data.profile.beltRankName}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Nhóm</p>
				<p class="mt-1 font-medium text-slate-900">{data.profile.groupName ?? '-'}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Trạng thái</p>
				<p class="mt-1 font-medium text-slate-900">{data.profile.status}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Ngày sinh</p>
				<p class="mt-1 font-medium text-slate-900">{formatDate(data.profile.dateOfBirth)}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Ngày tham gia</p>
				<p class="mt-1 font-medium text-slate-900">{formatDate(data.profile.joinedAt)}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Giới tính</p>
				<p class="mt-1 font-medium text-slate-900">{formatGender(data.profile.gender)}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Số điện thoại</p>
				<p class="mt-1 font-medium text-slate-900">{data.profile.phone ?? '-'}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3 sm:col-span-2">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Email</p>
				<p class="mt-1 font-medium text-slate-900">{data.profile.email ?? '-'}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3 sm:col-span-2">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Địa chỉ</p>
				<p class="mt-1 font-medium text-slate-900">{data.profile.address ?? '-'}</p>
			</div>
			<div class="rounded-xl border border-slate-100 bg-slate-50 p-3 sm:col-span-2">
				<p class="text-xs tracking-[0.15em] text-slate-500 uppercase">Ghi chú</p>
				<p class="mt-1 whitespace-pre-wrap font-medium text-slate-900">{data.profile.notes ?? '-'}</p>
			</div>
		</div>
	</section>
</main>
