import type { DomainOverride } from '../classification/settings-store';
import { classifyDomain } from '../classification/classify-domain';
import type { ActivityRecord } from '../tracking/types';
import type { FocusSession, FocusSessionSummary } from './types';

export function startFocusSession(goal: string, targetMinutes: number, now: number, id: string = crypto.randomUUID()): FocusSession {
  const normalizedGoal = goal.trim().slice(0, 120);
  if (!normalizedGoal) throw new Error('Add a focus goal first.');
  if (!Number.isInteger(targetMinutes) || targetMinutes < 5 || targetMinutes > 240) throw new Error('Choose a session from 5 to 240 minutes.');
  return {
    id, goal: normalizedGoal, targetMinutes, status: 'active', startedAt: now, updatedAt: now,
    endedAt: null, blocks: [{ startedAt: now, endedAt: null }],
  };
}

export function pauseFocusSession(session: FocusSession, now: number): FocusSession {
  if (session.status !== 'active') return session;
  return {
    ...session, status: 'paused', updatedAt: now,
    blocks: session.blocks.map((block, index) => index === session.blocks.length - 1 && block.endedAt === null
      ? { ...block, endedAt: Math.max(block.startedAt, now) }
      : block),
  };
}

export function resumeFocusSession(session: FocusSession, now: number): FocusSession {
  if (session.status !== 'paused') return session;
  return { ...session, status: 'active', updatedAt: now, blocks: [...session.blocks, { startedAt: now, endedAt: null }] };
}

export function endFocusSession(session: FocusSession, now: number): FocusSession {
  if (session.status === 'completed') return session;
  const paused = pauseFocusSession(session, now);
  return { ...paused, status: 'completed', endedAt: now, updatedAt: now };
}

export function focusSessionElapsedMs(session: FocusSession, now = Date.now()): number {
  return session.blocks.reduce((total, block) => {
    const end = block.endedAt ?? now;
    return total + Math.max(0, end - block.startedAt);
  }, 0);
}

export function summarizeFocusSession(
  session: FocusSession,
  records: readonly ActivityRecord[],
  overrides: readonly DomainOverride[] = [],
  now = Date.now(),
): FocusSessionSummary {
  const summary: FocusSessionSummary = { focusedMs: 0, productiveMs: 0, recreationalMs: 0, neutralMs: 0, unknownMs: 0 };
  for (const block of session.blocks) {
    const blockEnd = block.endedAt ?? now;
    for (const record of records) {
      const overlap = Math.max(0, Math.min(blockEnd, record.endedAt) - Math.max(block.startedAt, record.startedAt));
      if (!overlap) continue;
      summary.focusedMs += overlap;
      const intent = classifyDomain(record.domain, overrides).productivity;
      if (intent === 'productive') summary.productiveMs += overlap;
      else if (intent === 'recreational') summary.recreationalMs += overlap;
      else if (intent === 'neutral') summary.neutralMs += overlap;
      else summary.unknownMs += overlap;
    }
  }
  return summary;
}
