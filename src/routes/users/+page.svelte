<script lang="ts">
	import { onMount } from 'svelte';
	import {
		AppModal,
		DataTableToolbar,
		EmptyState,
		authSession,
		hasSystemPermissionForSession,
		IconActionButton,
		PageHeader,
		SectionCard,
		userManagementApi
	} from '$lib';
	import { clubUseCases } from '$lib/app/services';
	import DataPagination from '$lib/ui/components/DataPagination.svelte';
	import { toastError, toastSuccess } from '$lib/app/toast';
	import { normalizeSearchText } from '$lib/domain/string-utils';
	import type {
		Club,
		ClubRole,
		CreateUserPayload,
		SystemRole,
		UserAccount,
		UserClubMembership
	} from '$lib/domain/models';

	type CreateUserForm = CreateUserPayload;
	type CreateUserErrors = Partial<Record<'email' | 'fullName' | 'password', string>>;
	type MembershipFormErrors = Partial<Record<'clubId', string>>;

	const initialCreateUserForm: CreateUserForm = {
		email: '',
		fullName: '',
		password: '',
		systemRole: 'user',
		isActive: true
	};

	const systemRoleOptions: Array<{ label: string; value: SystemRole }> = [
		{ label: 'Người dùng', value: 'user' },
		{ label: 'Quản trị hệ thống', value: 'sys_admin' }
	];
	const clubRoleOptions: Array<{ label: string; value: ClubRole }> = [
		{ label: 'Chủ nhiệm', value: 'owner' },
		{ label: 'Phụ tá', value: 'assistant' }
	];

	let users = $state<UserAccount[]>([]);
	let clubs = $state<Club[]>([]);
	let search = $state('');
	let selectedSystemRole = $state<SystemRole | ''>('');
	let selectedActiveStatus = $state<'active' | 'inactive' | ''>('');
	let currentPage = $state(1);
	let isLoading = $state(false);
	let isCreateModalOpen = $state(false);
	let isCreatingUser = $state(false);
	let isUpdatingUserStatusId = $state('');
	let isResetPasswordModalOpen = $state(false);
	let isResettingPassword = $state(false);
	let resetPasswordUser = $state<UserAccount | null>(null);
	let resetPasswordValue = $state('');
	let createUserForm = $state<CreateUserForm>({ ...initialCreateUserForm });
	let createUserErrors = $state<CreateUserErrors>({});
	let isMembershipModalOpen = $state(false);
	let isLoadingMemberships = $state(false);
	let membershipsUser = $state<UserAccount | null>(null);
	let memberships = $state<UserClubMembership[]>([]);
	let membershipClubId = $state('');
	let membershipRole = $state<ClubRole>('assistant');
	let membershipFormErrors = $state<MembershipFormErrors>({});
	let isAddingMembership = $state(false);
	let removingMembershipId = $state('');
	const canManageUsers = $derived.by(() =>
		hasSystemPermissionForSession($authSession, 'users:manage')
	);

	const availableClubsForMembership = $derived.by(() =>
		clubs.filter(
			(club) =>
				!club.deletedAt &&
				club.isActive &&
				!memberships.some((membership) => membership.clubId === club.id)
		)
	);

	const filteredUsers = $derived.by(() => {
		const query = normalizeSearchText(search);
		return users.filter((user) => {
			const matchesQuery =
				!query ||
				[user.fullName, user.email, getSystemRoleLabel(user.systemRole)].some((value) =>
					normalizeSearchText(value).includes(query)
				);
			const matchesRole = !selectedSystemRole || user.systemRole === selectedSystemRole;
			const matchesStatus =
				!selectedActiveStatus ||
				(selectedActiveStatus === 'active' ? user.isActive : !user.isActive);
			return matchesQuery && matchesRole && matchesStatus;
		});
	});

	const pageSize = 10;
	const paginatedUsers = $derived.by(() => {
		const start = (currentPage - 1) * pageSize;
		return filteredUsers.slice(start, start + pageSize);
	});

	$effect(() => {
		search;
		selectedSystemRole;
		selectedActiveStatus;
		currentPage = 1;
	});

	$effect(() => {
		const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
		if (currentPage > totalPages) currentPage = totalPages;
	});

	onMount(() => {
		if (!canManageUsers) return;
		void loadInitialData();
	});

	$effect(() => {
		if (!canManageUsers) {
			users = [];
			memberships = [];
			isMembershipModalOpen = false;
			isCreateModalOpen = false;
			isResetPasswordModalOpen = false;
			return;
		}
		if (!isLoading && users.length === 0) {
			void loadInitialData();
		}
	});

	async function loadInitialData() {
		await Promise.all([loadUsers(), loadClubs()]);
	}

	async function loadUsers() {
		try {
			isLoading = true;
			users = await userManagementApi.listUsers();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể tải danh sách tài khoản.');
		} finally {
			isLoading = false;
		}
	}

	async function loadClubs() {
		try {
			clubs = await clubUseCases.list();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể tải danh sách CLB.');
		}
	}

	function getSystemRoleLabel(systemRole: SystemRole): string {
		return systemRole === 'sys_admin' ? 'Quản trị hệ thống' : 'Người dùng';
	}

	function getActiveStatusLabel(user: UserAccount): string {
		return user.isActive ? 'Đang hoạt động' : 'Tạm khóa';
	}

	function resetCreateUserForm() {
		createUserForm = { ...initialCreateUserForm };
		createUserErrors = {};
	}

	function openCreateModal() {
		if (!canManageUsers) {
			toastError('Bạn không có quyền quản lý tài khoản.');
			return;
		}
		resetCreateUserForm();
		isCreateModalOpen = true;
	}

	function closeCreateModal() {
		isCreateModalOpen = false;
		resetCreateUserForm();
	}

	function openResetPasswordModal(user: UserAccount) {
		if (!canManageUsers) {
			toastError('Bạn không có quyền đặt lại mật khẩu.');
			return;
		}
		resetPasswordUser = user;
		resetPasswordValue = '';
		isResetPasswordModalOpen = true;
	}

	function closeResetPasswordModal() {
		isResetPasswordModalOpen = false;
		resetPasswordUser = null;
		resetPasswordValue = '';
	}

	function getClubRoleLabel(clubRole: ClubRole): string {
		return clubRole === 'owner' ? 'Chủ nhiệm' : 'Phụ tá';
	}

	function resetMembershipForm() {
		membershipClubId = '';
		membershipRole = 'assistant';
		membershipFormErrors = {};
	}

	async function openMembershipModal(user: UserAccount) {
		if (!canManageUsers) {
			toastError('Bạn không có quyền quản lý phân quyền CLB.');
			return;
		}

		try {
			isMembershipModalOpen = true;
			isLoadingMemberships = true;
			membershipsUser = user;
			resetMembershipForm();
			const payload = await userManagementApi.getUserMemberships(user.id);
			memberships = payload.memberships ?? [];
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể tải phân quyền CLB.');
			isMembershipModalOpen = false;
			membershipsUser = null;
			memberships = [];
		} finally {
			isLoadingMemberships = false;
		}
	}

	function closeMembershipModal() {
		isMembershipModalOpen = false;
		isLoadingMemberships = false;
		membershipsUser = null;
		memberships = [];
		resetMembershipForm();
		removingMembershipId = '';
	}

	function validateMembershipForm(): boolean {
		const nextErrors: MembershipFormErrors = {};
		if (!membershipClubId) {
			nextErrors.clubId = 'Vui lòng chọn CLB.';
		}
		membershipFormErrors = nextErrors;
		return Object.keys(nextErrors).length === 0;
	}

	async function handleAddMembership(event: SubmitEvent) {
		event.preventDefault();
		if (!membershipsUser) return;
		if (!validateMembershipForm()) return;

		try {
			isAddingMembership = true;
			const membership = await userManagementApi.addMembership(membershipsUser.id, {
				clubId: membershipClubId,
				clubRole: membershipRole,
				isActive: true
			});
			memberships = [...memberships, membership].sort((left, right) =>
				left.clubName.localeCompare(right.clubName)
			);
			toastSuccess('Đã thêm phân quyền CLB.');
			resetMembershipForm();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể thêm phân quyền CLB.');
		} finally {
			isAddingMembership = false;
		}
	}

	async function handleRemoveMembership(membership: UserClubMembership) {
		try {
			removingMembershipId = membership.id;
			await userManagementApi.removeMembership(membership.id);
			memberships = memberships.filter((item) => item.id !== membership.id);
			toastSuccess('Đã gỡ phân quyền CLB.');
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể gỡ phân quyền CLB.');
		} finally {
			removingMembershipId = '';
		}
	}

	function validateCreateUserForm(): boolean {
		const nextErrors: CreateUserErrors = {};
		const normalizedEmail = createUserForm.email.trim();
		const normalizedFullName = createUserForm.fullName.trim();

		if (!normalizedEmail) {
			nextErrors.email = 'Vui lòng nhập email.';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
			nextErrors.email = 'Email không hợp lệ.';
		}

		if (!normalizedFullName) {
			nextErrors.fullName = 'Vui lòng nhập họ và tên.';
		}

		if (!createUserForm.password.trim()) {
			nextErrors.password = 'Vui lòng nhập mật khẩu.';
		} else if (createUserForm.password.trim().length < 8) {
			nextErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự.';
		}

		createUserErrors = nextErrors;
		return Object.keys(nextErrors).length === 0;
	}

	async function handleCreateUserSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!validateCreateUserForm()) return;

		try {
			isCreatingUser = true;
			await userManagementApi.createUser({
				email: createUserForm.email.trim(),
				fullName: createUserForm.fullName.trim(),
				password: createUserForm.password.trim(),
				systemRole: createUserForm.systemRole,
				isActive: createUserForm.isActive
			});
			toastSuccess('Đã tạo tài khoản.');
			closeCreateModal();
			await loadUsers();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể tạo tài khoản.');
		} finally {
			isCreatingUser = false;
		}
	}

	async function handleToggleUserStatus(user: UserAccount) {
		try {
			isUpdatingUserStatusId = user.id;
			await userManagementApi.updateUserStatus(user.id, {
				isActive: !user.isActive
			});
			toastSuccess(user.isActive ? 'Đã khóa tài khoản.' : 'Đã kích hoạt tài khoản.');
			await loadUsers();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái tài khoản.');
		} finally {
			isUpdatingUserStatusId = '';
		}
	}

	async function handleResetPasswordSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!resetPasswordUser) return;

		const normalizedPassword = resetPasswordValue.trim();
		if (normalizedPassword.length < 8) {
			toastError('Mật khẩu mới phải có ít nhất 8 ký tự.');
			return;
		}

		try {
			isResettingPassword = true;
			await userManagementApi.resetUserPassword(resetPasswordUser.id, {
				password: normalizedPassword
			});
			toastSuccess('Đã đặt lại mật khẩu.');
			closeResetPasswordModal();
		} catch (error) {
			toastError(error instanceof Error ? error.message : 'Không thể đặt lại mật khẩu.');
		} finally {
			isResettingPassword = false;
		}
	}
</script>

<svelte:head>
	<title>Người dùng</title>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-8">
	<PageHeader
		eyebrow="Quản trị"
		title="Người dùng"
		description="Quản lý tài khoản truy cập hệ thống và trạng thái hoạt động."
	/>

	{#if !canManageUsers}
		<SectionCard title="Quản lý người dùng">
			<EmptyState
				title="Bạn không có quyền truy cập"
				description="Chỉ quản trị hệ thống mới có thể quản lý tài khoản người dùng."
			/>
		</SectionCard>
	{:else}
		<SectionCard title="Danh sách tài khoản">
			<DataTableToolbar bind:searchValue={search} searchPlaceholder="Tìm theo tên hoặc email">
				{#snippet filters()}
					<select class="w-full rounded-lg border-slate-300 xl:w-52" bind:value={selectedSystemRole}>
						<option value="">Tất cả vai trò</option>
						{#each systemRoleOptions as roleOption (roleOption.value)}
							<option value={roleOption.value}>{roleOption.label}</option>
						{/each}
					</select>
					<select class="w-full rounded-lg border-slate-300 xl:w-52" bind:value={selectedActiveStatus}>
						<option value="">Tất cả trạng thái</option>
						<option value="active">Đang hoạt động</option>
						<option value="inactive">Tạm khóa</option>
					</select>
				{/snippet}
				{#snippet actions()}
					<IconActionButton
						icon="icon-[mdi--account-plus-outline]"
						label="Thêm tài khoản"
						variant="primary"
						onclick={openCreateModal}
						tooltipText={{ text: 'Thêm tài khoản', placement: 'bottom' }}
					/>
				{/snippet}
			</DataTableToolbar>

			{#if isLoading}
				<p class="text-sm text-slate-500">Đang tải danh sách tài khoản...</p>
			{:else if filteredUsers.length === 0}
				<EmptyState
					title="Chưa có tài khoản phù hợp"
					description="Tạo tài khoản đầu tiên hoặc thay đổi bộ lọc hiện tại."
				/>
			{:else}
				<div class="space-y-3 md:hidden">
					{#each paginatedUsers as user (user.id)}
						<article class="rounded-xl border border-slate-200 bg-slate-50 p-4">
							<div class="space-y-3">
								<div class="space-y-1">
									<h3 class="font-semibold text-slate-900">{user.fullName}</h3>
									<p class="text-sm text-slate-600">{user.email}</p>
									<p class="text-sm text-slate-500">
										{getSystemRoleLabel(user.systemRole)} • {getActiveStatusLabel(user)}
									</p>
									<p class="text-sm text-slate-500">
										Đăng nhập gần nhất: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Chưa đăng nhập'}
									</p>
								</div>
								<div class="flex justify-end gap-2">
									<IconActionButton
										icon="icon-[mdi--shield-account-outline]"
										label={`Phân quyền CLB cho ${user.fullName}`}
										onclick={() => void openMembershipModal(user)}
									/>
									<IconActionButton
										icon="icon-[mdi--lock-reset]"
										label={`Đặt lại mật khẩu ${user.fullName}`}
										onclick={() => openResetPasswordModal(user)}
									/>
									<IconActionButton
										icon={user.isActive ? 'icon-[mdi--account-cancel-outline]' : 'icon-[mdi--account-check-outline]'}
										label={user.isActive ? `Khóa ${user.fullName}` : `Kích hoạt ${user.fullName}`}
										variant={user.isActive ? 'danger' : 'default'}
										disabled={isUpdatingUserStatusId === user.id}
										onclick={() => void handleToggleUserStatus(user)}
									/>
								</div>
							</div>
						</article>
					{/each}
				</div>

				<div class="hidden overflow-x-auto md:block">
					<table class="min-w-full border-collapse text-sm">
						<thead>
							<tr class="border-b border-slate-200 text-left text-slate-600">
								<th class="py-2 pr-3">Họ và tên</th>
								<th class="py-2 pr-3">Email</th>
								<th class="py-2 pr-3">Vai trò hệ thống</th>
								<th class="py-2 pr-3">Trạng thái</th>
								<th class="py-2 pr-3">Đăng nhập gần nhất</th>
								<th class="py-2 pr-0 text-right">Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{#each paginatedUsers as user (user.id)}
								<tr class="border-b border-slate-100">
									<td class="py-3 pr-3 font-medium text-slate-900">{user.fullName}</td>
									<td class="py-3 pr-3 text-slate-700">{user.email}</td>
									<td class="py-3 pr-3 text-slate-700">{getSystemRoleLabel(user.systemRole)}</td>
									<td class="py-3 pr-3 text-slate-700">{getActiveStatusLabel(user)}</td>
									<td class="py-3 pr-3 text-slate-700">
										{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Chưa đăng nhập'}
									</td>
									<td class="py-3 pr-0 pl-3 text-right">
										<div class="inline-flex gap-2">
											<IconActionButton
												icon="icon-[mdi--shield-account-outline]"
												label={`Phân quyền CLB cho ${user.fullName}`}
												onclick={() => void openMembershipModal(user)}
											/>
											<IconActionButton
												icon="icon-[mdi--lock-reset]"
												label={`Đặt lại mật khẩu ${user.fullName}`}
												onclick={() => openResetPasswordModal(user)}
											/>
											<IconActionButton
												icon={user.isActive ? 'icon-[mdi--account-cancel-outline]' : 'icon-[mdi--account-check-outline]'}
												label={user.isActive ? `Khóa ${user.fullName}` : `Kích hoạt ${user.fullName}`}
												variant={user.isActive ? 'danger' : 'default'}
												disabled={isUpdatingUserStatusId === user.id}
												onclick={() => void handleToggleUserStatus(user)}
											/>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<DataPagination bind:currentPage totalItems={filteredUsers.length} {pageSize} />
			{/if}
		</SectionCard>
	{/if}
</main>

<AppModal
	open={isCreateModalOpen}
	title="Tạo tài khoản"
	description="Tạo tài khoản mới để cấp quyền truy cập hệ thống."
	onClose={closeCreateModal}
>
	<form class="grid gap-4 md:grid-cols-2" onsubmit={handleCreateUserSubmit}>
		<label class="space-y-1">
			<span class="text-sm font-medium text-slate-700">Họ và tên *</span>
			<input
				class:border-red-300={!!createUserErrors.fullName}
				class="w-full rounded-lg border-slate-300"
				bind:value={createUserForm.fullName}
				required
			/>
			{#if createUserErrors.fullName}
				<span class="block text-xs text-red-600">{createUserErrors.fullName}</span>
			{/if}
		</label>

		<label class="space-y-1">
			<span class="text-sm font-medium text-slate-700">Email *</span>
			<input
				type="email"
				class:border-red-300={!!createUserErrors.email}
				class="w-full rounded-lg border-slate-300"
				bind:value={createUserForm.email}
				required
			/>
			{#if createUserErrors.email}
				<span class="block text-xs text-red-600">{createUserErrors.email}</span>
			{/if}
		</label>

		<label class="space-y-1">
			<span class="text-sm font-medium text-slate-700">Mật khẩu *</span>
			<input
				type="password"
				class:border-red-300={!!createUserErrors.password}
				class="w-full rounded-lg border-slate-300"
				bind:value={createUserForm.password}
				required
			/>
			{#if createUserErrors.password}
				<span class="block text-xs text-red-600">{createUserErrors.password}</span>
			{/if}
		</label>

		<label class="space-y-1">
			<span class="text-sm font-medium text-slate-700">Vai trò hệ thống</span>
			<select class="w-full rounded-lg border-slate-300" bind:value={createUserForm.systemRole}>
				{#each systemRoleOptions as roleOption (roleOption.value)}
					<option value={roleOption.value}>{roleOption.label}</option>
				{/each}
			</select>
		</label>

		<label class="inline-flex items-center gap-2 md:col-span-2">
			<input type="checkbox" bind:checked={createUserForm.isActive} />
			<span class="text-sm text-slate-700">Kích hoạt ngay sau khi tạo</span>
		</label>

		<div class="flex gap-3 md:col-span-2">
			<button
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
				type="submit"
				disabled={isCreatingUser}
			>
				{isCreatingUser ? 'Đang tạo...' : 'Tạo tài khoản'}
			</button>
			<button
				class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
				type="button"
				onclick={closeCreateModal}
			>
				Hủy
			</button>
		</div>
	</form>
</AppModal>

<AppModal
	open={isResetPasswordModalOpen}
	title="Đặt lại mật khẩu"
	description={resetPasswordUser
		? `Đặt lại mật khẩu cho ${resetPasswordUser.fullName}.`
		: 'Đặt lại mật khẩu cho tài khoản này.'}
	onClose={closeResetPasswordModal}
	size="sm"
>
	<form class="space-y-4" onsubmit={handleResetPasswordSubmit}>
		<label class="space-y-1">
			<span class="text-sm font-medium text-slate-700">Mật khẩu mới *</span>
			<input
				type="password"
				class="w-full rounded-lg border-slate-300"
				bind:value={resetPasswordValue}
				required
			/>
			<p class="text-xs text-slate-500">Mật khẩu mới phải có ít nhất 8 ký tự.</p>
		</label>

		<div class="flex gap-3">
			<button
				class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
				type="submit"
				disabled={isResettingPassword}
			>
				{isResettingPassword ? 'Đang lưu...' : 'Cập nhật mật khẩu'}
			</button>
			<button
				class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
				type="button"
				onclick={closeResetPasswordModal}
			>
				Hủy
			</button>
		</div>
	</form>
</AppModal>

<AppModal
	open={isMembershipModalOpen}
	title="Phân quyền CLB"
	description={membershipsUser
		? `Quản lý CLB cho ${membershipsUser.fullName}.`
		: 'Quản lý phân quyền CLB cho tài khoản này.'}
	onClose={closeMembershipModal}
	size="lg"
>
	<div class="space-y-5">
		{#if isLoadingMemberships}
			<p class="text-sm text-slate-500">Đang tải phân quyền CLB...</p>
		{:else}
			<form class="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_12rem_auto]" onsubmit={handleAddMembership}>
				<label class="space-y-1">
					<span class="text-sm font-medium text-slate-700">CLB</span>
					<select
						class:border-red-300={!!membershipFormErrors.clubId}
						class="w-full rounded-lg border-slate-300"
						bind:value={membershipClubId}
					>
						<option value="">Chọn CLB</option>
						{#each availableClubsForMembership as club (club.id)}
							<option value={club.id}>{club.name}</option>
						{/each}
					</select>
					{#if membershipFormErrors.clubId}
						<span class="block text-xs text-red-600">{membershipFormErrors.clubId}</span>
					{/if}
				</label>
				<label class="space-y-1">
					<span class="text-sm font-medium text-slate-700">Vai trò</span>
					<select class="w-full rounded-lg border-slate-300" bind:value={membershipRole}>
						{#each clubRoleOptions as roleOption (roleOption.value)}
							<option value={roleOption.value}>{roleOption.label}</option>
						{/each}
					</select>
				</label>
				<div class="flex items-end">
					<button
						type="submit"
						class="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
						disabled={isAddingMembership || availableClubsForMembership.length === 0}
					>
						{isAddingMembership ? 'Đang thêm...' : 'Thêm CLB'}
					</button>
				</div>
			</form>

			{#if availableClubsForMembership.length === 0}
				<p class="text-sm text-slate-500">Tài khoản này đã được gán hết các CLB hiện có.</p>
			{/if}

			{#if memberships.length === 0}
				<EmptyState
					title="Chưa có phân quyền CLB"
					description="Thêm ít nhất một CLB để tài khoản có thể thao tác trong ứng dụng."
				/>
			{:else}
				<div class="space-y-3">
					{#each memberships as membership (membership.id)}
						<div class="rounded-xl border border-slate-200 bg-white p-4">
							<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div class="space-y-1">
									<p class="font-semibold text-slate-900">{membership.clubName}</p>
									<p class="text-sm text-slate-600">
										{getClubRoleLabel(membership.clubRole)} • {membership.isActive ? 'Đang hoạt động' : 'Tạm khóa'}
									</p>
								</div>
								<button
									type="button"
									class="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
									onclick={() => void handleRemoveMembership(membership)}
									disabled={removingMembershipId === membership.id}
								>
									{removingMembershipId === membership.id ? 'Đang gỡ...' : 'Gỡ quyền'}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</AppModal>
