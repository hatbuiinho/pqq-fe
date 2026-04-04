<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authSession, login } from '$lib';
	import { get } from 'svelte/store';

	let email = $state('');
	let password = $state('');
	let isSubmitting = $state(false);
	let errorMessage = $state('');

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = '';

		try {
			isSubmitting = true;
			await login(email, password);
			const session = get(authSession);
			const target = session?.memberships.length ? '/' : '/';
			await goto(resolve(target));
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Đăng nhập thất bại.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Đăng nhập</title>
</svelte:head>

<main class="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#d9ecef,transparent_36%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-10">
	<div class="w-full max-w-md rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
		<div class="space-y-2">
			<p class="text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase">Phật Quang Quyền</p>
			<h1 class="text-2xl font-bold tracking-tight text-slate-950">Đăng nhập</h1>
			<p class="text-sm text-slate-600">Sử dụng tài khoản được cấp để truy cập dữ liệu theo CLB.</p>
		</div>

		<form class="mt-6 space-y-4" onsubmit={handleSubmit}>
			<label class="block space-y-2">
				<span class="text-sm font-medium text-slate-700">Email</span>
				<input
					type="email"
					class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
					bind:value={email}
					autocomplete="email"
					required
				/>
			</label>

			<label class="block space-y-2">
				<span class="text-sm font-medium text-slate-700">Mật khẩu</span>
				<input
					type="password"
					class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
					bind:value={password}
					autocomplete="current-password"
					required
				/>
			</label>

			{#if errorMessage}
				<p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{errorMessage}
				</p>
			{/if}

			<button
				type="submit"
				class="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
				disabled={isSubmitting}
			>
				{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
			</button>
		</form>
	</div>
</main>
