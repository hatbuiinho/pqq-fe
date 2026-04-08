<script lang="ts">
	import { browser } from '$app/environment';
	import type { AttendanceStatus, StudentMessage } from '$lib/domain/models';
	import { getDB } from '$lib/data/local/app-db';
	import { emitDataChanged, subscribeDataChanged } from '$lib/app/data-events';
	import { toastSuccess } from '$lib/app/toast';
	import AppModal from '$lib/ui/components/AppModal.svelte';
	import { onMount, tick } from 'svelte';

	type Props = {
		open: boolean;
		studentId?: string | null;
		studentName?: string;
		studentClubId?: string;
		canManageMessages?: boolean;
		currentUserId?: string;
		currentUserName?: string;
		onClose?: () => void;
	};

	let {
		open,
		studentId = null,
		studentName = '',
		studentClubId = '',
		canManageMessages = true,
		currentUserId = '',
		currentUserName = '',
		onClose
	}: Props = $props();

	let studentMessages = $state<StudentMessage[]>([]);
	let isLoadingStudentMessages = $state(false);
	let manualMessageDraft = $state('');
	let editingManualMessageId = $state<string | null>(null);
	let manualMessageError = $state('');
	let messageListContainer = $state<HTMLDivElement | null>(null);
	let confirmingDeleteMessageId = $state<string | null>(null);

	const attendanceStatusLabels: Record<AttendanceStatus, string> = {
		unmarked: 'Chưa điểm danh',
		present: 'Đi học',
		late: 'Đi trễ',
		excused: 'Có phép',
		left_early: 'Về sớm',
		absent: 'Nghỉ'
	};

	function getInitials(value: string) {
		return value
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part.charAt(0).toUpperCase())
			.join('');
	}

	function formatMessageDate(value: string) {
		return new Intl.DateTimeFormat('vi-VN', {
			dateStyle: 'short',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	async function loadStudentMessages(targetStudentId: string) {
		try {
			isLoadingStudentMessages = true;
			const items = await getDB()
				.studentMessages.where('studentId')
				.equals(targetStudentId)
				.toArray();
			studentMessages = [...items]
				.filter((item) => !item.deletedAt)
				.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
		} finally {
			isLoadingStudentMessages = false;
		}
	}

	async function scrollMessagesToBottom() {
		await tick();
		messageListContainer?.scrollTo({
			top: messageListContainer.scrollHeight,
			behavior: 'smooth'
		});
	}

	function startEditManualMessage(message: StudentMessage) {
		editingManualMessageId = message.id;
		manualMessageDraft = message.content;
		manualMessageError = '';
	}

	function cancelManualMessageEditor() {
		editingManualMessageId = null;
		manualMessageDraft = '';
		manualMessageError = '';
	}

	function startDeleteManualMessage(message: StudentMessage) {
		confirmingDeleteMessageId = message.id;
	}

	function cancelDeleteManualMessage() {
		confirmingDeleteMessageId = null;
	}

	async function saveManualMessage() {
		if (!studentId || !studentClubId || !canManageMessages) return;
		const content = manualMessageDraft.trim();
		if (!content) {
			manualMessageError = 'Vui lòng nhập nội dung ghi chú.';
			return;
		}
		if (!currentUserId || !currentUserName) {
			manualMessageError = 'Không xác định được tài khoản hiện tại.';
			return;
		}

		const now = new Date().toISOString();
		const db = getDB();

		if (editingManualMessageId) {
			const existing = await db.studentMessages.get(editingManualMessageId);
			if (!existing || existing.messageType !== 'manual') {
				manualMessageError = 'Không tìm thấy ghi chú để cập nhật.';
				return;
			}

			await db.studentMessages.update(editingManualMessageId, {
				content,
				authorUserId: currentUserId,
				authorName: currentUserName,
				updatedAt: now,
				lastModifiedAt: now,
				syncStatus: 'pending',
				syncError: undefined,
				deletedAt: undefined
			});
			toastSuccess('Đã cập nhật ghi chú.');
		} else {
			await db.studentMessages.add({
				id: crypto.randomUUID(),
				studentId,
				clubId: studentClubId,
				messageType: 'manual',
				content,
				authorUserId: currentUserId,
				authorName: currentUserName,
				createdAt: now,
				updatedAt: now,
				lastModifiedAt: now,
				syncStatus: 'pending'
			});
			toastSuccess('Đã thêm ghi chú.');
		}

		cancelManualMessageEditor();
		emitDataChanged('local');
		await scrollMessagesToBottom();
	}

	async function deleteManualMessage(message: StudentMessage) {
		if (!canManageMessages || message.messageType !== 'manual') return;
		const now = new Date().toISOString();
		await getDB().studentMessages.update(message.id, {
			deletedAt: now,
			updatedAt: now,
			lastModifiedAt: now,
			syncStatus: 'pending',
			syncError: undefined
		});
		if (editingManualMessageId === message.id) {
			cancelManualMessageEditor();
		}
		cancelDeleteManualMessage();
		toastSuccess('Đã xóa ghi chú.');
		emitDataChanged('local');
	}

	onMount(() =>
		subscribeDataChanged((source) => {
			if (!open || !studentId) return;
			if (source === 'sync' || source === 'local' || source === 'attendance') {
				void loadStudentMessages(studentId);
			}
		})
	);

	$effect(() => {
		if (!browser) return;

		if (open && studentId) {
			void loadStudentMessages(studentId);
			return;
		}

		studentMessages = [];
		cancelManualMessageEditor();
		cancelDeleteManualMessage();
	});

	$effect(() => {
		if (!browser || !open || studentMessages.length === 0) return;
		void scrollMessagesToBottom();
	});
</script>

<AppModal
	{open}
	title={studentName ? `Trao đổi về ${studentName}` : 'Trao đổi về võ sinh'}
	description=""
	size="lg"
	fullScreenOnMobile={true}
	{onClose}
>
	<div
		class="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50"
	>
		<div bind:this={messageListContainer} class="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
			{#if isLoadingStudentMessages}
				<p class="text-sm text-slate-500">Đang tải nhật ký trao đổi...</p>
			{:else if studentMessages.length === 0}
				<div
					class="rounded-[1.25rem] border border-dashed border-slate-300 bg-white/80 px-4 py-4 text-sm text-slate-500"
				>
					Chưa có ghi nhận nào cho võ sinh này.
				</div>
			{:else}
				{#each studentMessages as message (message.id)}
					<div
						class={`flex gap-3 ${message.messageType === 'manual' && message.authorUserId === currentUserId ? 'justify-end' : 'justify-start'}`}
					>
						{#if message.messageType !== 'manual' || message.authorUserId !== currentUserId}
							<div
								class="mt-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
								aria-hidden="true"
							>
								{getInitials(message.authorName)}
							</div>
						{/if}
						<div
							class={`max-w-[85%] min-w-0 space-y-1.5 rounded-[1.25rem] px-3.5 py-2.5 shadow-sm ${
								message.messageType === 'manual' && message.authorUserId === currentUserId
									? 'bg-slate-900 text-white'
									: 'border border-slate-200 bg-white text-slate-800'
							}`}
						>
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-sm font-semibold">{message.authorName}</span>
								<span
									class={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
										message.messageType === 'attendance_note'
											? 'bg-amber-100 text-amber-700'
											: message.messageType === 'manual' && message.authorUserId === currentUserId
												? 'bg-white/15 text-white'
												: 'bg-sky-100 text-sky-700'
									}`}
								>
									{message.messageType === 'attendance_note' ? 'Điểm danh' : 'Ghi chú'}
								</span>
								<span
									class={`text-xs ${
										message.messageType === 'manual' && message.authorUserId === currentUserId
											? 'text-slate-300'
											: 'text-slate-500'
									}`}
								>
									{formatMessageDate(message.updatedAt)}
								</span>
							</div>
							<p class="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
							{#if message.messageType === 'attendance_note'}
								<div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
									{#if message.attendanceSessionDate}
										<span>Buổi điểm danh ngày {message.attendanceSessionDate}</span>
									{/if}
									{#if message.attendanceStatus}
										<span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
											{attendanceStatusLabels[message.attendanceStatus]}
										</span>
									{/if}
								</div>
							{/if}
							{#if canManageMessages && message.messageType === 'manual'}
								<div class="flex flex-wrap justify-end gap-2">
									{#if confirmingDeleteMessageId === message.id}
										<span
											class={`self-center text-[11px] ${
												message.authorUserId === currentUserId ? 'text-red-100' : 'text-red-600'
											}`}
										>
											Xác nhận xóa?
										</span>
										<button
											type="button"
											class={`rounded-lg px-2.5 py-1 text-xs font-medium ${
												message.authorUserId === currentUserId
													? 'border border-white/20 text-white'
													: 'border border-slate-300 text-slate-700'
											}`}
											onclick={cancelDeleteManualMessage}
										>
											Hủy
										</button>
										<button
											type="button"
											class={`rounded-lg px-2.5 py-1 text-xs font-medium ${
												message.authorUserId === currentUserId
													? 'border border-red-300/40 text-red-100'
													: 'border border-red-200 text-red-600'
											}`}
											onclick={() => void deleteManualMessage(message)}
										>
											Xóa
										</button>
									{:else}
										<button
											type="button"
											class={`rounded-lg px-2.5 py-1 text-xs font-medium ${
												message.authorUserId === currentUserId
													? 'border border-white/20 text-white'
													: 'border border-slate-300 text-slate-700'
											}`}
											onclick={() => startEditManualMessage(message)}
										>
											Sửa
										</button>
										<button
											type="button"
											class={`rounded-lg px-2.5 py-1 text-xs font-medium ${
												message.authorUserId === currentUserId
													? 'border border-red-300/40 text-red-100'
													: 'border border-red-200 text-red-600'
											}`}
											onclick={() => startDeleteManualMessage(message)}
										>
											Xóa
										</button>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</div>

		{#if canManageMessages}
			<div class="space-y-1 p-1">
				<div class="flex items-center justify-between gap-3">
					{#if editingManualMessageId}
						<button
							type="button"
							class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
							onclick={cancelManualMessageEditor}
						>
							Hủy sửa
						</button>
					{/if}
				</div>
				<div class="relative">
					<textarea
						class="min-h-24 w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 pr-28 text-sm text-slate-900 focus:ring-0"
						placeholder="Nhập ghi chú cho tình hình võ sinh"
						bind:value={manualMessageDraft}
					></textarea>
					<button
						type="button"
						class="absolute right-3 bottom-3 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white"
						onclick={() => void saveManualMessage()}
					>
						{editingManualMessageId ? 'Cập nhật' : 'Gửi'}
					</button>
				</div>
				{#if manualMessageError}
					<p class="text-xs text-red-600">{manualMessageError}</p>
				{/if}
			</div>
		{/if}
	</div>
</AppModal>
