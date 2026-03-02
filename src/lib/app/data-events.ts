import { browser } from '$app/environment';

const DATA_CHANGED_EVENT = 'app-data-changed';

export type DataChangeSource = 'local' | 'sync';

type DataChangedDetail = {
	source: DataChangeSource;
};

export function emitDataChanged(source: DataChangeSource = 'local'): void {
	if (!browser) return;
	window.dispatchEvent(
		new CustomEvent<DataChangedDetail>(DATA_CHANGED_EVENT, {
			detail: { source }
		})
	);
}

export function subscribeDataChanged(listener: (source: DataChangeSource) => void): () => void {
	if (!browser) return () => {};

	const handler = (event: Event) => {
		const customEvent = event as CustomEvent<DataChangedDetail>;
		listener(customEvent.detail?.source ?? 'local');
	};
	window.addEventListener(DATA_CHANGED_EVENT, handler);

	return () => {
		window.removeEventListener(DATA_CHANGED_EVENT, handler);
	};
}
