import type { Weekday } from '$lib/domain/models';

export const WEEKDAY_OPTIONS: Array<{
	value: Weekday;
	label: string;
	shortLabel: string;
	order: number;
}> = [
	{ value: 'mon', label: 'Monday', shortLabel: 'Mon', order: 1 },
	{ value: 'tue', label: 'Tuesday', shortLabel: 'Tue', order: 2 },
	{ value: 'wed', label: 'Wednesday', shortLabel: 'Wed', order: 3 },
	{ value: 'thu', label: 'Thursday', shortLabel: 'Thu', order: 4 },
	{ value: 'fri', label: 'Friday', shortLabel: 'Fri', order: 5 },
	{ value: 'sat', label: 'Saturday', shortLabel: 'Sat', order: 6 },
	{ value: 'sun', label: 'Sunday', shortLabel: 'Sun', order: 7 }
];

const WEEKDAY_SET = new Set(WEEKDAY_OPTIONS.map((option) => option.value));

export function sortWeekdays(weekdays: Weekday[]): Weekday[] {
	const orderMap = new Map(WEEKDAY_OPTIONS.map((option) => [option.value, option.order]));
	return [...new Set(weekdays)].sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999));
}

export function formatWeekdayList(weekdays: Weekday[]): string {
	const labels = sortWeekdays(weekdays).map(
		(weekday) => WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.shortLabel ?? weekday
	);
	return labels.join(', ');
}

export function getWeekdayFromIsoDate(value: string): Weekday | undefined {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
	const date = new Date(`${value}T00:00:00`);
	if (Number.isNaN(date.getTime())) return undefined;

	switch (date.getDay()) {
		case 1:
			return 'mon';
		case 2:
			return 'tue';
		case 3:
			return 'wed';
		case 4:
			return 'thu';
		case 5:
			return 'fri';
		case 6:
			return 'sat';
		case 0:
			return 'sun';
		default:
			return undefined;
	}
}

export function isWeekday(value: string): value is Weekday {
	return WEEKDAY_SET.has(value as Weekday);
}
