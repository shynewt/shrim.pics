import { config } from '#lib/server/config.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ mail: !!config.mail.host });
