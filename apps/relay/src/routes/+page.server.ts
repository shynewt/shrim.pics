import { demoPath } from '#lib/server/demo/index.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	/** The example album's link, or null when this relay doesn't serve it (SHRIM_DEMO=off). */
	demo: demoPath()
});
