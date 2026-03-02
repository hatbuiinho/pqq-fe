const DEFAULT_API_BASE_URL = 'http://localhost:8080';

export function getApiBaseUrl(): string {
	return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || DEFAULT_API_BASE_URL;
}

export function getWebSocketUrl(): string {
	const configuredUrl = (import.meta.env.VITE_SYNC_WS_URL as string | undefined)?.trim();
	if (configuredUrl) return configuredUrl;

	const apiBaseUrl = new URL(getApiBaseUrl());
	apiBaseUrl.protocol = apiBaseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
	apiBaseUrl.pathname = '/api/v1/sync/ws';
	apiBaseUrl.search = '';
	return apiBaseUrl.toString();
}
