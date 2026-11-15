export type FocusSessionStatus = 'active' | 'paused' | 'completed';

export interface FocusSessionBlock {
  startedAt: number;
  endedAt: number | null;
}

export interface FocusSession {
  id: string;
  goal: string;
  targetMinutes: number;
  status: FocusSessionStatus;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  blocks: FocusSessionBlock[];
}

export interface WellbeingSettings {
  minimumActiveDayMinutes: number;
  trackingPaused: boolean;
  excludedDomains: string[];
}

