import type { JudgeResult, RarityTier, TriviaPrompt } from './types';

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function msUntilLocalMidnight(now: Date = new Date()): number {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(0, tomorrow.getTime() - now.getTime());
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseDateKeyToDayNumber(dateKey: string): number {
  const [yStr, mStr, dStr] = dateKey.split('-');
  const y = Number(yStr) || 2026;
  const m = Number(mStr) || 1;
  const d = Number(dStr) || 1;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * Deterministically picks `count` daily prompts from `bank` with zero repeats
 * within each full cycle of `Math.floor(bank.length / count)` days.
 */
export function pickDailyPrompts(
  dateKey: string,
  bank: TriviaPrompt[],
  count: number = 5,
  seedSalt: number = 0,
): TriviaPrompt[] {
  if (bank.length === 0) return [];
  const safeCount = Math.min(count, bank.length);
  const daysPerCycle = Math.max(1, Math.floor(bank.length / safeCount));
  const dayNumber = Math.max(0, parseDateKeyToDayNumber(dateKey));
  const cycleIndex = Math.floor(dayNumber / daysPerCycle);
  const dayInCycle = dayNumber % daysPerCycle;

  const indices = bank.map((_, idx) => idx);
  const rng = mulberry32(cycleIndex * 9973 + 424242 + seedSalt * 7919);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }

  spreadCategories(indices, bank, safeCount);

  const start = dayInCycle * safeCount;
  return indices.slice(start, start + safeCount).map((idx) => bank[idx]);
}

const CATEGORY_GROUPS: [RegExp, string][] = [
  [/FOOD|DRINK|CAKE|SOUP|BREAD|CHEESE|PASTA|PUDDING|PASTR|SWEET|CHOCOLATE|BISCUIT|SPICE|SAUCE|NUT|BERR|FRUIT|VEG|TEA|COFFEE|COCKTAIL|ICE CREAM|BREAKFAST|MUSHROOM|DESSERT|SAUSAGE|WINE|CANDY|COOK|KITCHEN|TAPA|HAM/, 'FOOD'],
  [/ANIMAL|BIRD|FISH|INSECT|BUG|DOG|MAMMAL|REPTILE|WILDLIFE|SEA CREATURE|DINOSAUR|MARSUPIAL/, 'ANIMALS'],
  [/SPACE|ASTRO|STAR|CONSTELLATION|SKY/, 'SPACE'],
  [/MUSIC|BAND|SONG|DANCE|EUROVISION/, 'MUSIC'],
  [/FILM|CINEMA|TV|THEATRE|CARTOON|MASCOT/, 'SCREEN'],
  [/SPORT|FOOTBALL|OLYMPIC|RACING|GOLF|TENNIS|CRICKET|CHESS/, 'SPORT'],
  [/LONDON|^UK|BRITAIN|STATION/, 'UK'],
  [/LITERATURE|BOOK|WRITER|WRITING|AUTHOR|POET/, 'BOOKS'],
  [/COUNTR|CAPITAL|GEOGRAPHY|WORLD|RIVER|LAKE|MOUNTAIN|ISLAND|DESERT|SEA|OCEAN|WATERFALL|VOLCANO|US STATES|CITIES|BORDER/, 'GEOGRAPHY'],
  [/HISTORY|MONARCH|MYTH/, 'HISTORY'],
];

export function categoryGroup(category: string): string {
  const c = category.toUpperCase();
  for (const [re, group] of CATEGORY_GROUPS) {
    if (re.test(c)) return group;
  }
  return c;
}

/**
 * Deterministically reorders a shuffled cycle so no day (block of `perDay`)
 * contains two prompts from the same broad category group. Only swaps, so the
 * no-repeat-within-a-cycle guarantee is untouched.
 */
function spreadCategories(indices: number[], bank: TriviaPrompt[], perDay: number) {
  const groupOf = (i: number) => categoryGroup(bank[indices[i]].category);
  const days = Math.floor(indices.length / perDay);
  for (let d = 0; d < days; d++) {
    const start = d * perDay;
    for (let k = start; k < start + perDay; k++) {
      const used = new Set<string>();
      for (let m = start; m < k; m++) used.add(groupOf(m));
      if (!used.has(groupOf(k))) continue;
      // Find a later prompt whose group is new for this day.
      for (let j = start + perDay; j < indices.length; j++) {
        if (!used.has(groupOf(j))) {
          const tmp = indices[k];
          indices[k] = indices[j];
          indices[j] = tmp;
          break;
        }
      }
    }
  }
}

/**
 * Shuffles the entire prompt bank into an endless-play deck using Mulberry32.
 */
export function createUnlimitedPromptDeck(
  bank: TriviaPrompt[],
  seed: number = Date.now(),
): TriviaPrompt[] {
  if (bank.length === 0) return [];
  const copy = [...bank];
  const rng = mulberry32(seed >>> 0 || 1337);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function normalizeAnswer(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function matchesCandidate(normInput: string, candidate: string): boolean {
  const normCand = normalizeAnswer(candidate);
  if (!normCand) return false;
  if (normInput === normCand) return true;

  if (normCand.length >= 5 && normInput.includes(normCand)) return true;
  if (normInput.length >= 5 && normCand.includes(normInput)) return true;

  const maxDist = normCand.length >= 7 ? 2 : normCand.length >= 4 ? 1 : 0;
  if (maxDist > 0 && Math.abs(normInput.length - normCand.length) <= maxDist) {
    return levenshtein(normInput, normCand) <= maxDist;
  }
  return false;
}

const OBVIOUS_GIBBERISH = new Set([
  'asdf',
  'asdfg',
  'asdfgh',
  'qwerty',
  'zxcvb',
  'test',
  'idk',
  'none',
  'nothing',
  'pass',
  'skip',
  'banana123',
  'xxx',
]);

function looksPlausibleOffline(norm: string): boolean {
  if (!norm) return false;
  if (OBVIOUS_GIBBERISH.has(norm)) return false;
  if (/^(.)\1{2,}$/.test(norm)) return false;
  if (norm.length === 1 && norm !== 'e' && norm !== 'i') return false;
  if (/^\d+$/.test(norm)) return true;
  if (norm.length < 3) return false;
  if (!/[aeiouy]/.test(norm) && norm.length > 4) return false;
  return true;
}

const LOCAL_QUIPS: Record<RarityTier, string[]> = {
  INVALID: [
    'The ticket barrier swallowed your slip and tutted.',
    'Not on any map or timetable in this region.',
    'No train stops for that — try again tomorrow!',
  ],
  COMMON: [
    'First thing off every commuter’s tongue. Stopping Service.',
    'Safe as houses — hopping one stop down the branch line.',
    'Everybody queued for that same Stopping Service.',
  ],
  FAKE_DEEP: [
    'Trying to look clever? Half the carriage guessed that too.',
    'Classic pub-quiz "obscure" pick. Local service it is.',
    'Aha, the crowd-favourite quirky answer!',
  ],
  UNCOMMON: [
    'Tidy shout! Skip past three platforms on the Semi-Fast.',
    'Respectable pick — straight aboard the Semi-Fast.',
    'Skipping four stations clear of the rush-hour herd.',
  ],
  RARE: [
    'Proper connoisseur knowledge. All aboard the Express.',
    'Hardly a soul on the concourse thought of that.',
    'Six stations non-stop — ticket punched with a flourish!',
  ],
  LEGENDARY: [
    'Pure encyclopaedic wizardry! Clear the line for the Bullet!',
    'The stationmaster dropped his clipboard in awe.',
    'Eight stations non-stop — express brilliance!',
  ],
};

function pickQuip(tier: RarityTier, seedStr: string): string {
  const list = LOCAL_QUIPS[tier];
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) | 0;
  }
  return list[Math.abs(hash) % list.length];
}

export function evaluateLocalAnswer(
  prompt: TriviaPrompt,
  rawAnswer: string,
): JudgeResult {
  const norm = normalizeAnswer(rawAnswer);
  if (!norm) {
    return {
      valid: false,
      tier: 'INVALID',
      reason: 'Empty ticket — no train arrived.',
      source: 'validation',
    };
  }

  for (const cand of prompt.answers.rare) {
    if (matchesCandidate(norm, cand)) {
      return {
        valid: true,
        tier: 'LEGENDARY',
        reason: pickQuip('LEGENDARY', norm),
        source: 'local',
      };
    }
  }
  for (const cand of prompt.answers.uncommon) {
    if (matchesCandidate(norm, cand)) {
      return {
        valid: true,
        tier: 'UNCOMMON',
        reason: pickQuip('UNCOMMON', norm),
        source: 'local',
      };
    }
  }
  for (const cand of prompt.answers.fakeDeep) {
    if (matchesCandidate(norm, cand)) {
      return {
        valid: true,
        tier: 'FAKE_DEEP',
        reason: pickQuip('FAKE_DEEP', norm),
        source: 'local',
      };
    }
  }
  for (const cand of prompt.answers.common) {
    if (matchesCandidate(norm, cand)) {
      return {
        valid: true,
        tier: 'COMMON',
        reason: pickQuip('COMMON', norm),
        source: 'local',
      };
    }
  }

  if (!looksPlausibleOffline(norm)) {
    return {
      valid: false,
      tier: 'INVALID',
      reason: pickQuip('INVALID', norm),
      source: 'local',
    };
  }

  // Offline plausible non-banked entry: reward specificity gently
  const wordCount = norm.split(' ').length;
  const tier: RarityTier = wordCount >= 2 || norm.length >= 10 ? 'RARE' : 'UNCOMMON';
  return {
    valid: true,
    tier,
    reason: `${pickQuip(tier, norm)} (Offline Judge)`,
    source: 'local',
  };
}

function displayCase(answer: string): string {
  return answer.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/**
 * If the typed answer looks like a misspelling of a known answer, returns the
 * correctly spelled answer (for the player to confirm). Returns null when the
 * answer is already spelled like a known answer or nothing is close enough.
 */
export function suggestCorrection(prompt: TriviaPrompt, rawAnswer: string): string | null {
  const norm = normalizeAnswer(rawAnswer);
  if (norm.length < 3) return null;
  const squash = (s: string) => s.replace(/ /g, '');
  const all = [
    ...prompt.answers.rare,
    ...prompt.answers.uncommon,
    ...prompt.answers.fakeDeep,
    ...prompt.answers.common,
  ];
  let best: string | null = null;
  let bestDist = Infinity;
  for (const cand of all) {
    const n = normalizeAnswer(cand);
    if (!n) continue;
    if (n === norm || squash(n) === squash(norm)) return null;
    const maxDist = n.length >= 9 ? 3 : n.length >= 6 ? 2 : n.length >= 4 ? 1 : 0;
    if (!maxDist || Math.abs(n.length - norm.length) > maxDist) continue;
    const d = levenshtein(norm, n);
    if (d <= maxDist && d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return best ? displayCase(best) : null;
}
