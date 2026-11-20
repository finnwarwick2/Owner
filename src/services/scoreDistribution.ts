import { useCapability } from '../platform/claude';
import type { GameEdition } from '../games/next-stop/types';

export interface DailyDistributionResult {
  buckets: number[]; // length 10: [0-39, 40-79, ..., 360-400]
  totalPlayers: number;
  simulated: boolean;
  percentileBeat: number; // 0..100
  playerBucket: number; // 0..9
}

export const SCORE_BUCKET_LABELS = [
  '0–39',
  '40–79',
  '80–119',
  '120–159',
  '160–199',
  '200–239',
  '240–279',
  '280–319',
  '320–359',
  '360–400',
];

const SUBMITTED_DAYS_KEY = 'obscura_bellcurve_submitted_v1';
const MIN_REAL_PLAYERS_FOR_LIVE = 12;

export function getScoreBucket(score: number): number {
  const clamped = Math.max(0, Math.min(400, Math.round(score)));
  if (clamped >= 360) return 9;
  return Math.floor(clamped / 40);
}

export function computeBellCurveStats(
  buckets: number[],
  playerScore: number,
): { percentileBeat: number; playerBucket: number; totalPlayers: number } {
  const playerBucket = getScoreBucket(playerScore);
  const totalPlayers = buckets.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (totalPlayers <= 1) {
    return { percentileBeat: playerScore > 0 ? 50 : 0, playerBucket, totalPlayers };
  }

  let strictlyBelow = 0;
  for (let i = 0; i < playerBucket; i++) {
    strictlyBelow += Math.max(0, buckets[i] ?? 0);
  }
  const sameBucketOthers = Math.max(0, (buckets[playerBucket] ?? 1) - 1);
  // Pro-rate position inside player's own 40-pt bucket
  const bucketLow = playerBucket * 40;
  const bucketSpan = playerBucket === 9 ? 40 : 39;
  const withinFraction = Math.max(
    0,
    Math.min(1, (playerScore - bucketLow) / bucketSpan),
  );
  const beaten = strictlyBelow + sameBucketOthers * withinFraction;
  const percentileBeat = Math.max(
    0,
    Math.min(99, Math.round((beaten / Math.max(1, totalPlayers - 1)) * 100)),
  );
  return { percentileBeat, playerBucket, totalPlayers };
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function generateSimulatedBellCurve(
  gameId: GameEdition,
  dateKey: string,
  playerScore: number,
  existingRealBuckets?: number[],
): number[] {
  let s = hashSeed(`${gameId}:${dateKey}`);
  const nextRand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Classic railway trivia bell curve peaking around buckets 3..5 (120..239)
  const baseWeights = [0.03, 0.07, 0.13, 0.21, 0.24, 0.16, 0.09, 0.04, 0.02, 0.01];
  const cohortSize = 180 + Math.floor(nextRand() * 90);
  const buckets = baseWeights.map((w) => {
    const jitter = 0.85 + nextRand() * 0.3;
    return Math.max(1, Math.round(w * cohortSize * jitter));
  });

  if (existingRealBuckets) {
    for (let i = 0; i < 10; i++) {
      buckets[i] += existingRealBuckets[i] ?? 0;
    }
  } else {
    buckets[getScoreBucket(playerScore)] += 1;
  }

  return buckets;
}

function hasSubmittedToday(gameId: GameEdition, dateKey: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const raw = window.localStorage.getItem(SUBMITTED_DAYS_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(map[`${gameId}_${dateKey}`]);
  } catch {
    return false;
  }
}

function markSubmittedToday(gameId: GameEdition, dateKey: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(SUBMITTED_DAYS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[`${gameId}_${dateKey}`] = true;
    window.localStorage.setItem(SUBMITTED_DAYS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

/** Firestore writes can wait forever on a bad connection — never let the results screen hang. */
function withTimeout<T>(promise: Promise<T>, ms = 4000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

function fieldKey(gameId: GameEdition): string {
  return gameId === 'next-stop-europe' ? 'eu' : 'ns';
}

export async function submitAndFetchDailyDistribution(
  gameId: GameEdition,
  dateKey: string,
  playerScore: number,
): Promise<DailyDistributionResult> {
  const clampedScore = Math.max(0, Math.min(400, Math.round(playerScore / 10) * 10));
  const playerBucket = getScoreBucket(clampedScore);
  const simulated = (): DailyDistributionResult => {
    const buckets = generateSimulatedBellCurve(gameId, dateKey, clampedScore);
    const stats = computeBellCurveStats(buckets, clampedScore);
    return { buckets, totalPlayers: stats.totalPlayers, simulated: true, percentileBeat: stats.percentileBeat, playerBucket };
  };

  const [db, user] = await Promise.all([useCapability('db'), useCapability('user')]);
  if (!db) return simulated();

  const k = fieldKey(gameId);
  // One document per player (doc id = their opaque id); today's score for each edition.
  if (user && !hasSubmittedToday(gameId, dateKey)) {
    try {
      const uid = await withTimeout(user.id() as Promise<string>);
      if (uid) {
        const ref = db.doc(`scores/${uid}`);
        const fields = { [`${k}_date`]: dateKey, [`${k}_bucket`]: playerBucket };
        const existing = await withTimeout(ref.get()) as any;
        const prev = (existing?.exists && existing.data()) || {};
        await withTimeout(ref.set({ ...prev, ...fields }));
        markSubmittedToday(gameId, dateKey);
      }
    } catch {
      // read-only viewer or offline: still show the crowd
    }
  }

  const realBuckets = new Array<number>(10).fill(0);
  let realTotal = 0;
  try {
    const snap = await withTimeout(
      db.collection('scores').where(`${k}_date`, '==', dateKey).limit(1000).get(),
    );
    ((snap as any)?.docs ?? []).forEach((d: any) => {
      const data = d.data() as Record<string, unknown> | undefined;
      const b = data?.[`${k}_bucket`];
      if (typeof b === 'number' && b >= 0 && b <= 9) {
        realBuckets[b]++;
        realTotal++;
      }
    });
  } catch {
    // fall through to simulated crowd
  }

  if (realTotal < MIN_REAL_PLAYERS_FOR_LIVE) {
    const simBuckets = generateSimulatedBellCurve(gameId, dateKey, clampedScore, realTotal > 0 ? realBuckets : undefined);
    const stats = computeBellCurveStats(simBuckets, clampedScore);
    return { buckets: simBuckets, totalPlayers: stats.totalPlayers, simulated: true, percentileBeat: stats.percentileBeat, playerBucket };
  }

  const stats = computeBellCurveStats(realBuckets, clampedScore);
  return { buckets: realBuckets, totalPlayers: stats.totalPlayers, simulated: false, percentileBeat: stats.percentileBeat, playerBucket };
}
