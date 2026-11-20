export type GameEdition = 'next-stop' | 'next-stop-europe';

export type RarityTier =
  | 'INVALID'
  | 'COMMON'
  | 'FAKE_DEEP'
  | 'UNCOMMON'
  | 'RARE'
  | 'LEGENDARY';

export const MAX_DAILY_STATIONS = 40;
export const POINTS_PER_STATION = 10;
export const MAX_DAILY_SCORE = MAX_DAILY_STATIONS * POINTS_PER_STATION; // 400

export interface TrainSpec {
  tier: RarityTier;
  trainName: string;
  shortName: string;
  stations: number; // 0..8 stations skipped per prompt
  points: number; // stations * 10 (0..80)
  speedMps: number; // visual scroll speed for side-on ride
  rideDurationSec: number; // 3..6 seconds
  accentHex: string;
  bodyHex: string;
  roofHex: string;
  description: string;
}

export const TRAIN_SPECS: Record<RarityTier, TrainSpec> = {
  INVALID: {
    tier: 'INVALID',
    trainName: 'No Service',
    shortName: 'NO TRAIN',
    stations: 0,
    points: 0,
    speedMps: 0,
    rideDurationSec: 0,
    accentHex: '#d72638',
    bodyHex: '#44444f',
    roofHex: '#2e2e37',
    description: 'No train arrives — 0 stations (0 pts)',
  },
  COMMON: {
    tier: 'COMMON',
    trainName: 'Stopping Service',
    shortName: 'STOPPING',
    stations: 1,
    points: 10,
    speedMps: 11,
    rideDurationSec: 3.1,
    accentHex: '#8a8478',
    bodyHex: '#44444f',
    roofHex: '#2e2e37',
    description: 'Shabby old railbus — 1 station (10 pts)',
  },
  FAKE_DEEP: {
    tier: 'FAKE_DEEP',
    trainName: 'Local',
    shortName: 'LOCAL',
    stations: 2,
    points: 20,
    speedMps: 15,
    rideDurationSec: 3.6,
    accentHex: '#a86f00',
    bodyHex: '#2e2e37',
    roofHex: '#5c3c00',
    description: 'Cliché clever pick — 2 stations (20 pts)',
  },
  UNCOMMON: {
    tier: 'UNCOMMON',
    trainName: 'Semi-Fast',
    shortName: 'SEMI-FAST',
    stations: 4,
    points: 40,
    speedMps: 22,
    rideDurationSec: 4.3,
    accentHex: '#c9c1b2',
    bodyHex: '#c9c1b2',
    roofHex: '#44444f',
    description: 'Brisk regional flyer — 4 stations (40 pts)',
  },
  RARE: {
    tier: 'RARE',
    trainName: 'Express',
    shortName: 'EXPRESS',
    stations: 6,
    points: 60,
    speedMps: 31,
    rideDurationSec: 5.0,
    accentHex: '#ffb000',
    bodyHex: '#1e1e24',
    roofHex: '#44444f',
    description: 'Sleek mainline express — 6 stations (60 pts)',
  },
  LEGENDARY: {
    tier: 'LEGENDARY',
    trainName: 'Non-Stop Bullet',
    shortName: 'BULLET',
    stations: 8,
    points: 80,
    speedMps: 42,
    rideDurationSec: 5.7,
    accentHex: '#ffd27a',
    bodyHex: '#f2ebdd',
    roofHex: '#ffd27a',
    description: 'Glowing non-stop bullet — 8 stations (80 pts)',
  },
};

export const ORDERED_TIERS: RarityTier[] = [
  'INVALID',
  'COMMON',
  'FAKE_DEEP',
  'UNCOMMON',
  'RARE',
  'LEGENDARY',
];

export interface TriviaPrompt {
  id: string;
  category: string;
  prompt: string;
  answers: {
    common: string[];
    fakeDeep: string[];
    uncommon: string[];
    rare: string[];
  };
}

export interface JudgeResult {
  valid: boolean;
  tier: RarityTier;
  reason: string;
  source: 'gemini' | 'local' | 'validation' | 'timeout';
}

export interface PromptAttempt {
  promptId: string;
  promptText: string;
  category: string;
  answer: string;
  timedOut: boolean;
  valid: boolean;
  tier: RarityTier;
  stations: number;
  points: number;
  reason: string;
  source: JudgeResult['source'];
}

export interface DailyRunState {
  dateKey: string;
  promptIds: string[];
  attempts: PromptAttempt[];
  completed: boolean;
  totalStations: number;
  totalScore: number;
}

export interface NextStopSaveData {
  runsByDate: Record<string, DailyRunState>;
}

export interface CareerStats {
  daysPlayed: number;
  daysCompleted: number;
  currentStreak: number;
  bestStreak: number;
  bestDayStations: number;
  bestDayScore: number;
  averageStations: number;
  averageScore: number;
  lifetimeStations: number;
  lifetimeScore: number;
  bulletTrainsCaught: number;
  tierCounts: Record<RarityTier, number>;
}
