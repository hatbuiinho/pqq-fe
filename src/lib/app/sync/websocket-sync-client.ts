import type { SyncRealtimeEvent } from '$lib/domain/sync';

type RealtimeCallbacks = {
	onEvent: (event: SyncRealtimeEvent) => void;
	onDisconnected?: () => void;
};

export interface SyncRealtimeClient {
	connect(callbacks: RealtimeCallbacks): void;
	disconnect(): void;
}

export class WebSocketSyncClient implements SyncRealtimeClient {
	private socket: WebSocket | null = null;

	constructor(private readonly url: string) {}

	connect(callbacks: RealtimeCallbacks): void {
		this.disconnect();
		this.socket = new WebSocket(this.url);

		this.socket.addEventListener('message', (message) => {
			try {
				const event = JSON.parse(message.data) as SyncRealtimeEvent;
				callbacks.onEvent(event);
			} catch {
				// Ignore malformed realtime payloads.
			}
		});

		this.socket.addEventListener('close', () => {
			callbacks.onDisconnected?.();
		});

		this.socket.addEventListener('error', () => {
			callbacks.onDisconnected?.();
		});
	}

	disconnect(): void {
		if (!this.socket) return;
		this.socket.close();
		this.socket = null;
	}
}
