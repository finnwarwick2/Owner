import type {
  CharacterColorId,
  CharacterHatId,
  PlayerProfile,
  TrainLiveryId,
  UnlockableOption,
} from '../../types/arcade';
import { getLocalDateKey } from './daily';
import {
  POINTS_PER_STATION,
  TRAIN_SPECS,
  type CareerStats,
  type DailyRunState,
  type GameEdition,
  type NextStopSaveData,
  type PromptAttempt,
  type RarityTier,
} from './types';

export const PROFILE_STORAGE_KEY = 'obscura_arcade_profile_v1';
export const NEXT_STOP_STORAGE_KEY = 'obscura_next_stop_save_v1';
export const NEXT_STOP_EUROPE_STORAGE_KEY = 'obscura_next_stop_europe_save_v1';
export const LEGACY_LAST_STOP_STORAGE_KEY = 'obscura_last_stop_save_v1';

export const CHARACTER_COLORS: UnlockableOption<CharacterColorId>[] = [
  {
    id: 'cobalt',
    name: 'Cobalt Guard',
    unlockScore: 0,
    primaryHex: '#44444f',
    secondaryHex: '#ffb000',
    description: 'Standard railway porter blue.',
  },
  {
    id: 'crimson',
    name: 'Signal Crimson',
    unlockScore: 120,
    primaryHex: '#d72638',
    secondaryHex: '#f2ebdd',
    description: 'Unlock at 120 lifetime pts.',
  },
  {
    id: 'mustard',
    name: 'Mustard Brass',
    unlockScore: 280,
    primaryHex: '#a86f00',
    secondaryHex: '#1e1e24',
    description: 'Unlock at 280 lifetime pts.',
  },
  {
    id: 'highland',
    name: 'Highland Moss',
    unlockScore: 520,
    primaryHex: '#5a5a62',
    secondaryHex: '#ffd27a',
    description: 'Unlock at 520 lifetime pts.',
  },
  {
    id: 'midnight',
    name: 'Midnight Velvet',
    unlockScore: 850,
    primaryHex: '#5b3a9e',
    secondaryHex: '#7cc8f0',
    description: 'Unlock at 850 lifetime pts.',
  },
  {
    id: 'royalgold',
    name: 'Royal Sovereign',
    unlockScore: 1400,
    primaryHex: '#ffb000',
    secondaryHex: '#5c3c00',
    description: 'Unlock at 1,400 lifetime pts.',
  },
];

export const CHARACTER_HATS: UnlockableOption<CharacterHatId>[] = [
  {
    id: 'station_cap',
    name: 'Station Cap',
    unlockScore: 0,
    primaryHex: '#1e1e24',
    secondaryHex: '#ffb000',
    description: 'Classic peaked railway cap.',
  },
  {
    id: 'beanie',
    name: 'Bobble Beanie',
    unlockScore: 80,
    primaryHex: '#d72638',
    secondaryHex: '#f2ebdd',
    description: 'Unlock at 80 lifetime pts.',
  },
  {
    id: 'drivers_peak',
    name: 'Conductor Peak',
    unlockScore: 220,
    primaryHex: '#1f2937',
    secondaryHex: '#38bdf8',
    description: 'Unlock at 220 lifetime pts.',
  },
  {
    id: 'top_hat',
    name: 'Brunel Top Hat',
    unlockScore: 440,
    primaryHex: '#18181b',
    secondaryHex: '#a86f00',
    description: 'Unlock at 440 lifetime pts.',
  },
  {
    id: 'viking_helm',
    name: 'Iron Horn Helm',
    unlockScore: 760,
    primaryHex: '#64748b',
    secondaryHex: '#f2ebdd',
    description: 'Unlock at 760 lifetime pts.',
  },
  {
    id: 'golden_crown',
    name: 'Terminus Crown',
    unlockScore: 1200,
    primaryHex: '#ffb000',
    secondaryHex: '#ef4444',
    description: 'Unlock at 1,200 lifetime pts.',
  },
];

export const TRAIN_LIVERIES: UnlockableOption<TrainLiveryId>[] = [
  {
    id: 'heritage',
    name: 'Heritage Standard',
    unlockScore: 0,
    primaryHex: '#b45309',
    secondaryHex: '#fde68a',
    description: 'Default fleet paintwork.',
  },
  {
    id: 'br_blue',
    name: 'BR Rail Blue',
    unlockScore: 180,
    primaryHex: '#0369a1',
    secondaryHex: '#ffb000',
    description: 'Unlock at 180 lifetime pts.',
  },
  {
    id: 'midnight_sleeper',
    name: 'Midnight Sleeper',
    unlockScore: 480,
    primaryHex: '#1e1b4b',
    secondaryHex: '#38bdf8',
    description: 'Unlock at 480 lifetime pts.',
  },
  {
    id: 'sunset_copper',
    name: 'Copper Pullman',
    unlockScore: 900,
    primaryHex: '#9a3412',
    secondaryHex: '#fef08a',
    description: 'Unlock at 900 lifetime pts.',
  },
  {
    id: 'neon_shinkansen',
    name: 'Cyber Shinkansen',
    unlockScore: 1350,
    primaryHex: '#0f172a',
    secondaryHex: '#7cc8f0',
    description: 'Unlock at 1,350 lifetime pts.',
  },
];

export const DEFAULT_PROFILE: PlayerProfile = {
  nickname: 'COMMUTER',
  colorId: 'cobalt',
  hatId: 'station_cap',
  liveryId: 'heritage',
};

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function getStorageKeyForEdition(edition: GameEdition): string {
  return edition === 'next-stop-europe'
    ? NEXT_STOP_EUROPE_STORAGE_KEY
    : NEXT_STOP_STORAGE_KEY;
}

export function loadProfile(): PlayerProfile {
  if (!hasStorage()) return { ...DEFAULT_PROFILE };
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    return {
      nickname:
        typeof parsed.nickname === 'string' && parsed.nickname.trim()
          ? parsed.nickname.trim().slice(0, 14)
          : DEFAULT_PROFILE.nickname,
      colorId: CHARACTER_COLORS.some((c) => c.id === parsed.colorId)
        ? (parsed.colorId as CharacterColorId)
        : DEFAULT_PROFILE.colorId,
      hatId: CHARACTER_HATS.some((h) => h.id === parsed.hatId)
        ? (parsed.hatId as CharacterHatId)
        : DEFAULT_PROFILE.hatId,
      liveryId: TRAIN_LIVERIES.some((l) => l.id === parsed.liveryId)
        ? (parsed.liveryId as TrainLiveryId)
        : DEFAULT_PROFILE.liveryId,
    };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: PlayerProfile): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage quota errors
  }
}

interface LegacyPromptAttempt {
  promptId: string;
  promptText: string;
  category: string;
  answer: string;
  timedOut: boolean;
  valid: boolean;
  tier: RarityTier;
  points?: number;
  reason: string;
  source: PromptAttempt['source'];
}

interface LegacyDailyRun {
  dateKey: string;
  promptIds: string[];
  attempts: LegacyPromptAttempt[];
  completed: boolean;
  totalKm?: number;
}

export function migrateLegacyLastStopData(rawLegacyJson: string): NextStopSaveData {
  try {
    const parsed = JSON.parse(rawLegacyJson) as {
      runsByDate?: Record<string, LegacyDailyRun>;
    };
    const runsByDate: Record<string, DailyRunState> = {};
    if (parsed.runsByDate && typeof parsed.runsByDate === 'object') {
      for (const [dateKey, legacyRun] of Object.entries(parsed.runsByDate)) {
        if (!legacyRun || !Array.isArray(legacyRun.attempts)) continue;
        const attempts: PromptAttempt[] = legacyRun.attempts.map((att) => {
          const tier: RarityTier = TRAIN_SPECS[att.tier] ? att.tier : 'INVALID';
          const stations = TRAIN_SPECS[tier].stations;
          return {
            promptId: String(att.promptId ?? ''),
            promptText: String(att.promptText ?? ''),
            category: String(att.category ?? 'GENERAL'),
            answer: String(att.answer ?? ''),
            timedOut: Boolean(att.timedOut),
            valid: Boolean(att.valid),
            tier,
            stations,
            points: stations * POINTS_PER_STATION,
            reason: String(att.reason ?? ''),
            source: att.source ?? 'local',
          };
        });
        const totalStations = attempts.reduce((sum, a) => sum + a.stations, 0);
        runsByDate[dateKey] = {
          dateKey,
          promptIds: Array.isArray(legacyRun.promptIds) ? legacyRun.promptIds : [],
          attempts,
          completed: Boolean(legacyRun.completed),
          totalStations,
          totalScore: totalStations * POINTS_PER_STATION,
        };
      }
    }
    return { runsByDate };
  } catch {
    return { runsByDate: {} };
  }
}

export function loadNextStopSave(edition: GameEdition = 'next-stop'): NextStopSaveData {
  if (!hasStorage()) return { runsByDate: {} };
  const key = getStorageKeyForEdition(edition);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw && edition === 'next-stop') {
      const legacyRaw = window.localStorage.getItem(LEGACY_LAST_STOP_STORAGE_KEY);
      if (legacyRaw) {
        const migrated = migrateLegacyLastStopData(legacyRaw);
        window.localStorage.setItem(key, JSON.stringify(migrated));
        window.localStorage.removeItem(LEGACY_LAST_STOP_STORAGE_KEY);
        return migrated;
      }
      return { runsByDate: {} };
    }
    if (!raw) return { runsByDate: {} };
    const parsed = JSON.parse(raw) as Partial<NextStopSaveData>;
    return {
      runsByDate:
        parsed.runsByDate && typeof parsed.runsByDate === 'object'
          ? parsed.runsByDate
          : {},
    };
  } catch {
    return { runsByDate: {} };
  }
}

export function saveNextStopSave(
  data: NextStopSaveData,
  edition: GameEdition = 'next-stop',
): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(getStorageKeyForEdition(edition), JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

export function recordPromptAttempt(
  saveData: NextStopSaveData,
  dateKey: string,
  promptIds: string[],
  attempt: PromptAttempt,
): NextStopSaveData {
  const existing: DailyRunState = saveData.runsByDate[dateKey] ?? {
    dateKey,
    promptIds,
    attempts: [],
    completed: false,
    totalStations: 0,
    totalScore: 0,
  };

  if (existing.attempts.length >= promptIds.length || existing.completed) {
    return saveData;
  }

  const nextAttempts = [...existing.attempts, attempt];
  const totalStations = nextAttempts.reduce((sum, a) => sum + a.stations, 0);
  const totalScore = totalStations * POINTS_PER_STATION;
  const completed = nextAttempts.length >= promptIds.length;

  return {
    runsByDate: {
      ...saveData.runsByDate,
      [dateKey]: {
        dateKey,
        promptIds,
        attempts: nextAttempts,
        completed,
        totalStations,
        totalScore,
      },
    },
  };
}

function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + delta);
  return getLocalDateKey(dt);
}

export function computeCareerStats(
  saveData: NextStopSaveData,
  todayKey: string = getLocalDateKey(),
  extraSaveData?: NextStopSaveData,
): CareerStats {
  const allRuns: DailyRunState[] = [
    ...Object.values(saveData.runsByDate),
    ...(extraSaveData ? Object.values(extraSaveData.runsByDate) : []),
  ];
  const completedRuns = allRuns.filter((r) => r.completed);
  const tierCounts: Record<RarityTier, number> = {
    INVALID: 0,
    COMMON: 0,
    FAKE_DEEP: 0,
    UNCOMMON: 0,
    RARE: 0,
    LEGENDARY: 0,
  };

  let lifetimeStations = 0;
  let lifetimeScore = 0;
  let bestDayStations = 0;
  let bestDayScore = 0;

  for (const run of allRuns) {
    const stations = run.totalStations ?? 0;
    const score = run.totalScore ?? stations * POINTS_PER_STATION;
    lifetimeStations += stations;
    lifetimeScore += score;
    if (run.completed && score > bestDayScore) {
      bestDayScore = score;
      bestDayStations = stations;
    }
    for (const att of run.attempts) {
      tierCounts[att.tier] = (tierCounts[att.tier] ?? 0) + 1;
    }
  }

  const completedDates = new Set(completedRuns.map((r) => r.dateKey));

  let currentStreak = 0;
  let cursor = completedDates.has(todayKey) ? todayKey : addDays(todayKey, -1);
  while (completedDates.has(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  const sortedDates = Array.from(completedDates).sort();
  let bestStreak = 0;
  let running = 0;
  let prevDate = '';
  for (const d of sortedDates) {
    if (!prevDate || addDays(prevDate, 1) === d) {
      running++;
    } else {
      running = 1;
    }
    if (running > bestStreak) bestStreak = running;
    prevDate = d;
  }

  const averageStations =
    completedRuns.length > 0
      ? Math.round(
          completedRuns.reduce((s, r) => s + (r.totalStations ?? 0), 0) /
            completedRuns.length,
        )
      : 0;
  const averageScore =
    completedRuns.length > 0
      ? Math.round(
          completedRuns.reduce((s, r) => s + (r.totalScore ?? 0), 0) /
            completedRuns.length,
        )
      : 0;

  return {
    daysPlayed: new Set(
      allRuns.filter((r) => r.attempts.length > 0).map((r) => r.dateKey),
    ).size,
    daysCompleted: completedDates.size,
    currentStreak,
    bestStreak,
    bestDayStations,
    bestDayScore,
    averageStations,
    averageScore,
    lifetimeStations,
    lifetimeScore,
    bulletTrainsCaught: tierCounts.LEGENDARY,
    tierCounts,
  };
}
