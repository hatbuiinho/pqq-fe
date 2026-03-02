export const unaccent = (value: string) => {
	const from =
		'àáãảạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệđùúủũụưừứửữựòóỏõọôồốổỗộơờớởỡợìíỉĩịäëïîöüûñçýỳỹỵỷ';
	const to =
		'aaaaaaaaaaaaaaaaaeeeeeeeeeeeduuuuuuuuuuuoooooooooooooooooiiiiiaeiiouuncyyyyy';
	let result = value;
	for (let i = 0; i < from.length; i += 1) {
		result = result.replace(new RegExp(from[i], 'gi'), to[i]);
	}
	return result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

const slugify = (value: string) =>
	unaccent(value)
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.replace(/-{2,}/g, '-');

const randomSuffix = (length = 4) => {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
};

export const generateClubId = (name: string) => {
	const base = slugify(name) || 'club';
	return `${base}-${randomSuffix(4)}`;
};

export const generateClubCode = (name: string) => {
	const normalized = unaccent(name)
		.trim()
		.replace(/[^a-zA-Z0-9\s]+/g, ' ');

	const initials = normalized
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0]?.toUpperCase() ?? '')
		.join('');

	return initials || 'CLB';
};

export const generateUniqueClubCode = (name: string, existingCodes: string[]) => {
	const baseCode = generateClubCode(name);
	const normalizedCodes = new Set(existingCodes.map((code) => code.trim().toUpperCase()).filter(Boolean));
	if (!normalizedCodes.has(baseCode)) return baseCode;

	let suffix = 2;
	while (normalizedCodes.has(`${baseCode}${suffix}`)) {
		suffix += 1;
	}

	return `${baseCode}${suffix}`;
};

export const generateBeltRankId = (name: string) => slugify(name) || 'belt-rank';
