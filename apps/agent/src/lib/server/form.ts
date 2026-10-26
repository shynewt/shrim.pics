/** Files and missing fields give the fallback. */
export function formText(form: FormData, name: string, fallback = ''): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : fallback;
}
