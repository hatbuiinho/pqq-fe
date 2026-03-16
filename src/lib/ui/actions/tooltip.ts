export type TooltipOptions = {
	text: string;
	placement?: 'top' | 'right' | 'bottom' | 'left';
	offset?: number;
	align?: 'left' | 'center' | 'right';
};

const resolveText = (value: string | TooltipOptions) =>
	typeof value === 'string' ? value : value.text;
const resolvePlacement = (value: string | TooltipOptions) =>
	typeof value === 'string' ? 'top' : (value.placement ?? 'top');
const resolveOffset = (value: string | TooltipOptions) =>
	typeof value === 'string' ? 8 : (value.offset ?? 8);
const resolveAlign = (value: string | TooltipOptions) =>
	typeof value === 'string' ? 'center' : (value.align ?? 'center');

export const tooltip = (node: HTMLElement, value: string | TooltipOptions) => {
	let text = resolveText(value);
	let placement = resolvePlacement(value);
	let offset = resolveOffset(value);
	let align = resolveAlign(value);
	let tooltipEl: HTMLDivElement | null = null;

	const ensureTooltip = () => {
		if (tooltipEl) return;
		tooltipEl = document.createElement('div');
		tooltipEl.className = 'app-tooltip';
		document.body.appendChild(tooltipEl);
	};

	const show = () => {
		if (!text) return;
		ensureTooltip();
		if (!tooltipEl) return;
		tooltipEl.textContent = text;
		tooltipEl.style.opacity = '1';
		tooltipEl.style.transform =
			align === 'center'
				? 'translateX(-50%)'
				: align === 'left'
					? 'translateX(0)'
					: 'translateX(-100%)';

		const rect = node.getBoundingClientRect();
		const tooltipRect = tooltipEl.getBoundingClientRect();
		let top = rect.top - tooltipRect.height - offset;
		let left = rect.left + rect.width / 2;
		if (align === 'left') {
			left = rect.left;
		} else if (align === 'right') {
			left = rect.right;
		}

		if (placement === 'bottom') {
			top = rect.bottom + offset;
		} else if (placement === 'left') {
			top = rect.top + rect.height / 2 - tooltipRect.height / 2;
			left = rect.left - tooltipRect.width - offset;
		} else if (placement === 'right') {
			top = rect.top + rect.height / 2 - tooltipRect.height / 2;
			left = rect.right + offset;
		} else if (top < 8) {
			top = rect.bottom + offset;
		}

		tooltipEl.style.top = `${top}px`;
		tooltipEl.style.left = `${left}px`;
	};

	const hide = () => {
		if (!tooltipEl) return;
		tooltipEl.style.opacity = '0';
	};

	const handleMouseEnter = () => show();
	const handleMouseLeave = () => hide();
	const handleFocus = () => show();
	const handleBlur = () => hide();

	node.addEventListener('mouseenter', handleMouseEnter);
	node.addEventListener('mouseleave', handleMouseLeave);
	node.addEventListener('focus', handleFocus);
	node.addEventListener('blur', handleBlur);

	return {
		update(next: string | TooltipOptions) {
			text = resolveText(next);
			placement = resolvePlacement(next);
			offset = resolveOffset(next);
			align = resolveAlign(next);
		},
		destroy() {
			node.removeEventListener('mouseenter', handleMouseEnter);
			node.removeEventListener('mouseleave', handleMouseLeave);
			node.removeEventListener('focus', handleFocus);
			node.removeEventListener('blur', handleBlur);
			if (tooltipEl) {
				tooltipEl.remove();
				tooltipEl = null;
			}
		}
	};
};
