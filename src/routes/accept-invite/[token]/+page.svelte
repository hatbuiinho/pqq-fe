<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		authSession,
		establishAuthenticatedSession,
		userManagementApi
	} from '$lib';
	import type { ClubInvitePreview } from '$lib/domain/models';

	const token = $derived(page.params.token);
	const currentAuthSession = $derived($authSession);

	let preview = $state<ClubInvitePreview | null>(null);
	let isLoadingPreview = $state(true);
	let previewError = $state('');
	let isSubmitting = $state(false);
	let submitError = $state('');
	let email = $state('');
	let fullName = $state('');
	let password = $state('');

	$effect(() => {
		const currentToken = token;
		if (!currentToken) return;

		email = currentAuthSession?.user.email ?? '';
		fullName = currentAuthSession?.user.fullName ?? '';
		password = '';
		submitError = '';
		previewError = '';
		isLoadingPreview = true;
		preview = null;

		void userManagementApi
			.getClubInvitePreview(currentToken)
			.then((payload) => {
				if (token !== currentToken) return;
				preview = payload;
				if (payload.inviteeEmail) {
					email = payload.inviteeEmail;
				}
			})
			.catch((error) => {
				if (token !== currentToken) return;
				previewError =
					error instanceof Error ? error.message : 'Không thể tải thông tin link mời.';
			})
			.finally(() => {
				if (token === currentToken) {
					isLoadingPreview = false;
				}
			});
	});

	function getClubRoleLabel(clubRole: ClubInvitePreview['clubRole']): string {
		return clubRole === 'owner' ? 'Chủ nhiệm' : 'Phụ tá';
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!token) return;

		submitError = '';

		const normalizedEmail = email.trim();
		const normalizedFullName = fullName.trim();
		const normalizedPassword = password.trim();

		if (!normalizedEmail) {
			submitError = 'Vui lòng nhập email.';
			return;
		}
		if (normalizedPassword.length < 8) {
			submitError = 'Mật khẩu phải có ít nhất 8 ký tự.';
			return;
		}

		try {
			isSubmitting = true;
			const session = await userManagementApi.acceptClubInvite(token, {
				email: normalizedEmail,
				fullName: normalizedFullName || undefined,
				password: normalizedPassword
			});
			await establishAuthenticatedSession(session);
			await goto(resolve('/'));
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Không thể nhận lời mời.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Nhận lời mời vào CLB</title>
</svelte:head>

<main class="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#d9ecef,transparent_36%),linear-gradient(180deg,#f8fafc,#eef2f7)] px-4 py-10">
	<div class="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
		<div class="space-y-2">
			<p class="text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase">Phật Quang Quyền</p>
			<h1 class="text-2xl font-bold tracking-tight text-slate-950">Nhận lời mời vào CLB</h1>
			<p class="text-sm text-slate-600">
				Xác nhận tài khoản để tham gia đúng CLB theo link được chia sẻ.
			</p>
		</div>

		{#if isLoadingPreview}
			<div class="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
				Đang tải thông tin lời mời...
			</div>
		{:else if previewError}
			<div class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				{previewError}
			</div>
		{:else if preview}
			<div class="mt-6 space-y-5">
				<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
					<div class="grid gap-2 text-sm text-slate-700">
						<p><span class="font-semibold text-slate-900">CLB:</span> {preview.clubName}</p>
						<p><span class="font-semibold text-slate-900">Vai trò:</span> {getClubRoleLabel(preview.clubRole)}</p>
						<p><span class="font-semibold text-slate-900">Người mời:</span> {preview.inviterName}</p>
						<p><span class="font-semibold text-slate-900">Hết hạn:</span> {new Date(preview.expiresAt).toLocaleString()}</p>
						{#if preview.inviteeEmail}
							<p><span class="font-semibold text-slate-900">Email được phép:</span> {preview.inviteeEmail}</p>
						{/if}
					</div>
				</div>

				<form class="space-y-4" onsubmit={handleSubmit}>
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
						<span class="text-sm font-medium text-slate-700">Họ và tên</span>
						<input
							type="text"
							class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
							bind:value={fullName}
							placeholder="Chỉ cần khi tạo tài khoản mới"
							autocomplete="name"
						/>
					</label>

					<label class="block space-y-2">
						<span class="text-sm font-medium text-slate-700">Mật khẩu</span>
						<input
							type="password"
							class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
							bind:value={password}
							autocomplete={currentAuthSession ? 'current-password' : 'new-password'}
							required
						/>
						<p class="text-xs text-slate-500">
							Nếu bạn đã có tài khoản, nhập mật khẩu hiện tại. Nếu chưa có, mật khẩu này sẽ dùng cho tài khoản mới.
						</p>
					</label>

					{#if submitError}
						<p class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
							{submitError}
						</p>
					{/if}

					<div class="flex flex-col gap-3 sm:flex-row">
						<button
							type="submit"
							class="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
							disabled={isSubmitting}
						>
							{isSubmitting ? 'Đang xác nhận...' : 'Nhận lời mời'}
						</button>
						<a
							href={resolve('/login')}
							class="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
						>
							Về trang đăng nhập
						</a>
					</div>
				</form>
			</div>
		{/if}
	</div>
</main>
