/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

const sw = self as ServiceWorkerGlobalScope;

const PRECACHE_NAME = `mac-manager-precache-${version}`;
const RUNTIME_CACHE_NAME = `mac-manager-runtime-${version}`;
const APP_SHELL = ['/', '/manifest.webmanifest', '/offline.html'];
const ASSETS = [...build, ...files];
const PRECACHE_URLS = [...new Set([...ASSETS, ...APP_SHELL])];
const MAX_RUNTIME_ENTRIES = 80;

function isStaticAsset(url: URL): boolean {
	const pathname = url.pathname;
	return (
		pathname.startsWith('/_app/immutable/') ||
		pathname.startsWith('/icons/') ||
		pathname === '/manifest.webmanifest' ||
		pathname.endsWith('.css') ||
		pathname.endsWith('.js') ||
		pathname.endsWith('.mjs') ||
		pathname.endsWith('.svg') ||
		pathname.endsWith('.png') ||
		pathname.endsWith('.jpg') ||
		pathname.endsWith('.jpeg') ||
		pathname.endsWith('.webp') ||
		pathname.endsWith('.woff2')
	);
}

async function trimRuntimeCache(): Promise<void> {
	const cache = await caches.open(RUNTIME_CACHE_NAME);
	const keys = await cache.keys();
	if (keys.length <= MAX_RUNTIME_ENTRIES) return;

	const deleteCount = keys.length - MAX_RUNTIME_ENTRIES;
	await Promise.all(keys.slice(0, deleteCount).map((key) => cache.delete(key)));
}

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(PRECACHE_NAME);
			await cache.addAll(PRECACHE_URLS);
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const cacheNames = await caches.keys();
			await Promise.all(
				cacheNames
					.filter((name) => name !== PRECACHE_NAME && name !== RUNTIME_CACHE_NAME)
					.map((name) => caches.delete(name))
			);
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	// Navigation requests: prefer network, fallback to cached app shell/offline page.
	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					return await fetch(request);
				} catch {
					const cache = await caches.open(PRECACHE_NAME);
					return (await cache.match('/')) || (await cache.match('/offline.html'))!;
				}
			})()
		);
		return;
	}

	// Only cache static assets. Skip caching dynamic/API/query requests to prevent cache bloat.
	if (!isStaticAsset(url) || url.search) {
		return;
	}

	event.respondWith(
		(async () => {
			const precache = await caches.open(PRECACHE_NAME);
			const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
			const cached = (await precache.match(request)) || (await runtimeCache.match(request));
			if (cached) return cached;

			try {
				const response = await fetch(request);
				if (response.ok) {
					runtimeCache.put(request, response.clone());
					await trimRuntimeCache();
				}
				return response;
			} catch {
				return cached ?? Response.error();
			}
		})()
	);
});
