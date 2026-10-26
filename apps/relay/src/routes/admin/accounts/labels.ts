import { formatRelative, plural } from '@shrim/ui';

export type PlanStatus = 'none' | 'active' | 'ending' | 'past_due' | 'ended';
type Tone = 'neutral' | 'success' | 'warning' | 'danger';

/** `label` for badges in lists, `value` for the plan tile. */
export const PLAN: Record<PlanStatus, { label: string; value: string; tone: Tone }> = {
	active: { label: 'Plan active', value: 'Active', tone: 'success' },
	ending: { label: 'Plan ending', value: 'Ending', tone: 'warning' },
	past_due: { label: 'Card problem', value: 'Payment failed', tone: 'danger' },
	ended: { label: 'Plan ended', value: 'Ended', tone: 'neutral' },
	none: { label: 'No plan', value: 'Not active', tone: 'neutral' }
};

export function agentText(a: { online: boolean; pairedAt: number | null; seenAt: number | null }): string {
	if (a.online) return 'Agent online';
	if (a.pairedAt === null) return 'No agent';
	if (a.seenAt === null) return 'Agent never connected';
	return `Agent seen ${formatRelative(a.seenAt)}`;
}

export const liveLinks = (n: number) => (n === 0 ? 'No live links' : plural(n, 'live link', 'live links'));
