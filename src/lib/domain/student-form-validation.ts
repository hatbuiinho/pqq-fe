import type { ClubGroup, Weekday } from '$lib/domain/models';
import type { StudentFormErrors, StudentFormValue } from '$lib/ui/components/student-form';

export function getTodayIsoDate(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function normalizeDateInput(value?: string): string {
	if (!value) return '';

	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return value;
	}

	const isoPrefixMatch = /^(\d{4}-\d{2}-\d{2})T/.exec(value);
	if (isoPrefixMatch) {
		return isoPrefixMatch[1];
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}

	const year = parsed.getFullYear();
	const month = String(parsed.getMonth() + 1).padStart(2, '0');
	const day = String(parsed.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function isValidIsoDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;

	const [, yearString, monthString, dayString] = match;
	const year = Number(yearString);
	const month = Number(monthString);
	const day = Number(dayString);
	const date = new Date(year, month - 1, day);

	return (
		!Number.isNaN(date.getTime()) &&
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	);
}

type ValidateStudentFormOptions = {
	requireClub?: boolean;
	groups?: ClubGroup[];
	availableClubTrainingDays?: Weekday[];
	selectedCustomScheduleDays?: Weekday[];
	today?: string;
	joinedAtBeforeBirthMessage?: string;
	invalidPhoneMessage?: string;
	invalidEmailMessage?: string;
};

export function validateStudentForm(
	form: StudentFormValue,
	options: ValidateStudentFormOptions = {}
): { form: StudentFormValue; errors: StudentFormErrors } {
	const nextErrors: StudentFormErrors = {};
	const fullName = form.fullName.trim();
	const phone = form.phone.trim();
	const email = form.email.trim();
	const dateOfBirth = normalizeDateInput(form.dateOfBirth);
	const joinedAt = normalizeDateInput(form.joinedAt);
	const today = options.today ?? getTodayIsoDate();
	const availableClubTrainingDays = options.availableClubTrainingDays ?? [];
	const selectedCustomScheduleDays = options.selectedCustomScheduleDays ?? [];
	const groups = options.groups ?? [];

	const normalizedForm: StudentFormValue = {
		...form,
		dateOfBirth,
		joinedAt
	};

	if (!fullName) {
		nextErrors.fullName = 'Student full name is required.';
	}

	if (options.requireClub !== false && !form.clubId) {
		nextErrors.clubId = 'Club is required.';
	}

	if (form.groupId) {
		const selectedGroup = groups.find((group) => group.id === form.groupId && !group.deletedAt);
		if (!selectedGroup) {
			nextErrors.groupId = 'Group does not exist.';
		} else if (selectedGroup.clubId !== form.clubId) {
			nextErrors.groupId = 'Group must belong to the selected club.';
		}
	}

	if (!form.beltRankId) {
		nextErrors.beltRankId = 'Belt rank is required.';
	}

	if (form.scheduleMode === 'custom') {
		if (selectedCustomScheduleDays.length === 0) {
			nextErrors.scheduleDays = 'Select at least one schedule day.';
		} else {
			const allowedDays = new Set(availableClubTrainingDays);
			if (selectedCustomScheduleDays.some((weekday) => !allowedDays.has(weekday))) {
				nextErrors.scheduleDays = 'Custom schedule must stay within the selected club schedule.';
			}
		}
	}

	if (dateOfBirth) {
		if (!isValidIsoDate(dateOfBirth)) {
			nextErrors.dateOfBirth = 'Date of birth is invalid.';
		} else if (dateOfBirth > today) {
			nextErrors.dateOfBirth = 'Date of birth cannot be in the future.';
		}
	}

	if (joinedAt) {
		if (!isValidIsoDate(joinedAt)) {
			nextErrors.joinedAt = 'Joined date is invalid.';
		} else if (joinedAt > today) {
			nextErrors.joinedAt = 'Joined date cannot be in the future.';
		}
	}

	if (
		dateOfBirth &&
		joinedAt &&
		isValidIsoDate(dateOfBirth) &&
		isValidIsoDate(joinedAt) &&
		joinedAt < dateOfBirth
	) {
		nextErrors.joinedAt =
			options.joinedAtBeforeBirthMessage ?? 'Joined date cannot be earlier than date of birth.';
	}

	if (phone && !/^[0-9+\-\s()]{8,20}$/.test(phone)) {
		nextErrors.phone = options.invalidPhoneMessage ?? 'Phone number format is invalid.';
	}

	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		nextErrors.email = options.invalidEmailMessage ?? 'Email format is invalid.';
	}

	return {
		form: normalizedForm,
		errors: nextErrors
	};
}
