import { OBSCURITY } from './obscurity';
import type { JudgeResult, RarityTier, TriviaPrompt } from './types';

/**
 * Grades a deep-cut answer by how often it appears in everyday English
 * (Zipf scale). Everyday words drop to Uncommon; only answers that barely
 * appear anywhere earn Legendary.
 */
export function deepCutTier(answer: string): RarityTier {
  const score = OBSCURITY[normalizeAnswer(answer)];
  if (score === undefined) return 'RARE';
  if (score >= 3.2) return 'FAKE_DEEP';
  if (score >= 2.2) return 'UNCOMMON';
  if (score >= 1.0) return 'RARE';
  return 'LEGENDARY';
}

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

function matchesCandidate(normInput: string, candidate: string, exactOnly = false): boolean {
  const normCand = normalizeAnswer(candidate);
  if (!normCand) return false;
  if (normInput === normCand) return true;
  if (exactOnly) return normInput.replace(/ /g, '') === normCand.replace(/ /g, '');

  // Whole-word containment only, e.g. "lake windermere" for "windermere",
  // or "great pyramid" for "great pyramid of giza" — never a stray fragment.
  const padIn = ` ${normInput} `;
  const padCand = ` ${normCand} `;
  if (normCand.length >= 5 && normCand.length >= normInput.length * 0.6 && padIn.includes(padCand)) return true;
  if (
    normInput.length >= 5 &&
    normInput.length >= normCand.length * 0.75 &&
    padCand.includes(padIn)
  ) {
    return true;
  }

  // Typos: same first letter, 1 slip for 5+ letters, 2 for 8+.
  const maxDist = normCand.length >= 8 ? 2 : normCand.length >= 5 ? 1 : 0;
  if (
    maxDist > 0 &&
    normInput[0] === normCand[0] &&
    Math.abs(normInput.length - normCand.length) <= maxDist
  ) {
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
  opts: { exactOnly?: boolean } = {},
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

  const { common, fakeDeep, uncommon, rare } = prompt.answers;
  const rareTier = (idx: number): RarityTier => deepCutTier(rare[idx]);
  const tiers: Array<[string[], (idx: number) => RarityTier]> = [
    [common, () => 'COMMON'],
    [fakeDeep, () => 'FAKE_DEEP'],
    [uncommon, () => 'UNCOMMON'],
    [rare, rareTier],
  ];
  const hit = (tier: RarityTier): JudgeResult => ({
    valid: true,
    tier,
    reason: pickQuip(tier, norm),
    source: 'local',
  });

  // 1) Exact spelling anywhere wins, so a weak answer can't borrow a deep cut's score.
  for (const [list, tierAt] of tiers) {
    const idx = list.findIndex((cand) => matchesCandidate(norm, cand, true));
    if (idx >= 0) return hit(tierAt(idx));
  }
  // 2) Typos and partial matches: check the least obscure tiers first.
  if (!opts.exactOnly) {
    for (const [list, tierAt] of tiers) {
      const idx = list.findIndex((cand) => matchesCandidate(norm, cand));
      if (idx >= 0) return hit(tierAt(idx));
    }
  }

  // Not on this question's answer list: no train. (Accepting any word that
  // merely looked plausible let made-up answers score.)
  void looksPlausibleOffline;
  return {
    valid: false,
    tier: 'INVALID',
    reason: `${pickQuip('INVALID', norm)} We don't recognise that answer.`,
    source: 'local',
  };
}

const ROMAN = /^(i{1,3}|iv|v|vi{1,3}|ix|x)$/;

function displayCase(answer: string): string {
  return answer
    .split(' ')
    .map((word, i) => {
      if (i > 0 && ROMAN.test(word)) return word.toUpperCase(); // Henry VIII, Cullinan II
      if (word === 's' && i > 0) return "'s"; // "idol s eye" -> "idol's eye"
      return word.replace(/^([a-z])/, (m) => m.toUpperCase());
    })
    .join(' ')
    .replace(/ 's\b/g, "'s");
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

/**
 * Days when everyone can keep playing after the daily 5 (unlimited mode).
 * Dates are the player's local date, YYYY-MM-DD.
 */
export const UNLIMITED_PLAY_DATES: string[] = ['2026-11-20'];

export function isUnlimitedPlayDay(dateKey: string = getLocalDateKey()): boolean {
  return UNLIMITED_PLAY_DATES.includes(dateKey);
}

export interface AnswerSheet {
  /** The single best (most obscure) answer, and the level it would have scored. */
  bullet: string | null;
  bulletTier: RarityTier | null;
  /** Up to `perTier` example answers for each level, rarest level first. */
  tiers: Array<{ tier: RarityTier; answers: string[] }>;
}

const SHEET_ORDER: RarityTier[] = ['LEGENDARY', 'RARE', 'UNCOMMON', 'FAKE_DEEP', 'COMMON'];

/** Grades every known answer for a question and picks the top examples per level. */
export function getAnswerSheet(prompt: TriviaPrompt, perTier = 10): AnswerSheet {
  const graded = new Map<string, { label: string; tier: RarityTier; score: number; order: number }>();
  let order = 0;
  const add = (list: string[], tierOf: (a: string) => RarityTier) => {
    for (const a of list) {
      const key = normalizeAnswer(a).replace(/^the /, '').replace(/ /g, '');
      if (!key || graded.has(key)) continue;
      graded.set(key, {
        label: displayCase(a.trim()),
        tier: tierOf(a),
        score: OBSCURITY[normalizeAnswer(a)] ?? 2,
        order: order++,
      });
    }
  };
  add(prompt.answers.common, () => 'COMMON');
  add(prompt.answers.fakeDeep, () => 'FAKE_DEEP');
  add(prompt.answers.uncommon, () => 'UNCOMMON');
  add(prompt.answers.rare, deepCutTier);

  const all = [...graded.values()];
  const tiers = SHEET_ORDER.map((tier) => {
    const inTier = all.filter((g) => g.tier === tier);
    const deep = tier === 'LEGENDARY' || tier === 'RARE' || tier === 'UNCOMMON';
    // Deep levels: most obscure first (hand-picked answers win ties). Others: list order.
    inTier.sort((x, y) => (deep ? x.score - y.score || x.order - y.order : x.order - y.order));
    return { tier, answers: inTier.slice(0, perTier).map((g) => g.label) };
  });
  const best = tiers.find((t) => t.answers.length > 0);
  return { bullet: best?.answers[0] ?? null, bulletTier: best?.tier ?? null, tiers };
}
