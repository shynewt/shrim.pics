export interface Toast {
	id: number;
	kind: 'success' | 'error';
	message: string;
}

let nextId = 1;
export const toasts = $state<Toast[]>([]);

export function toast(message: string, kind: Toast['kind'] = 'success') {
	const t = { id: nextId++, kind, message };
	toasts.push(t);
	if (toasts.length > 3) toasts.splice(0, toasts.length - 3);
	return t.id;
}

export function dismiss(id: number) {
	const i = toasts.findIndex((t) => t.id === id);
	if (i >= 0) toasts.splice(i, 1);
}
