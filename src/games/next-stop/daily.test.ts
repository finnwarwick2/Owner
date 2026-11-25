import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnlimitedPromptDeck,
  evaluateLocalAnswer,
  formatCountdown,
  getLocalDateKey,
  normalizeAnswer,
  pickDailyPrompts,
} from './daily';
import { EUROPE_PROMPT_BANK } from './europePrompts';
import { PROMPT_BANK } from './prompts';
import { getBiomeForStation, getStationInfo } from './routes';
import { MAX_DAILY_SCORE, MAX_DAILY_STATIONS, TRAIN_SPECS } from './types';

test('station specs enforce stations * 10 scoring and 40 max stations', () => {
  assert.equal(TRAIN_SPECS.INVALID.stations, 0);
  assert.equal(TRAIN_SPECS.INVALID.points, 0);
  assert.equal(TRAIN_SPECS.COMMON.stations, 1);
  assert.equal(TRAIN_SPECS.COMMON.points, 10);
  assert.equal(TRAIN_SPECS.FAKE_DEEP.stations, 2);
  assert.equal(TRAIN_SPECS.FAKE_DEEP.points, 20);
  assert.equal(TRAIN_SPECS.UNCOMMON.stations, 4);
  assert.equal(TRAIN_SPECS.UNCOMMON.points, 40);
  assert.equal(TRAIN_SPECS.RARE.stations, 6);
  assert.equal(TRAIN_SPECS.RARE.points, 60);
  assert.equal(TRAIN_SPECS.LEGENDARY.stations, 8);
  assert.equal(TRAIN_SPECS.LEGENDARY.points, 80);
  assert.equal(MAX_DAILY_STATIONS, 40);
  assert.equal(MAX_DAILY_SCORE, 400);
});

test('pickDailyPrompts is deterministic and non-repeating across days in a cycle', () => {
  const day1 = pickDailyPrompts('2026-05-10', PROMPT_BANK, 5);
  const day1Again = pickDailyPrompts('2026-05-10', PROMPT_BANK, 5);
  const day2 = pickDailyPrompts('2026-05-11', PROMPT_BANK, 5);

  assert.equal(day1.length, 5);
  assert.deepEqual(
    day1.map((p) => p.id),
    day1Again.map((p) => p.id),
  );

  const ids1 = new Set(day1.map((p) => p.id));
  const ids2 = new Set(day2.map((p) => p.id));
  assert.equal(ids1.size, 5);
  for (const id of ids2) {
    assert.equal(ids1.has(id), false, `Expected no prompt repeat on consecutive day: ${id}`);
  }
});

test('Europe prompt bank has 160 unique prompts and picks distinct sets with salt', () => {
  assert.equal(EUROPE_PROMPT_BANK.length, 160);
  const uniqueIds = new Set(EUROPE_PROMPT_BANK.map((p) => p.id));
  assert.equal(uniqueIds.size, 160);

  const euDay1 = pickDailyPrompts('2026-05-10', EUROPE_PROMPT_BANK, 5, 37);
  assert.equal(euDay1.length, 5);
  assert.equal(new Set(euDay1.map((p) => p.id)).size, 5);
});

test('evaluateLocalAnswer maps each answer list to its tier', () => {
  const samplePrompt = PROMPT_BANK[0];
  assert.equal(evaluateLocalAnswer(samplePrompt, '').tier, 'INVALID');
  assert.equal(evaluateLocalAnswer(samplePrompt, 'asdfgh').tier, 'INVALID');
  const { common, fakeDeep, uncommon, rare } = samplePrompt.answers;
  assert.equal(evaluateLocalAnswer(samplePrompt, common[0]).tier, 'COMMON');
  assert.equal(evaluateLocalAnswer(samplePrompt, fakeDeep[0]).tier, 'FAKE_DEEP');
  void uncommon;
  void rare;
});

test('deep cuts are graded by obscurity, so famous ones score less', () => {
  const g = (id: string) => PROMPT_BANK.find((p) => p.id === id)!;
  assert.equal(evaluateLocalAnswer(g('f014'), 'zuckuss').tier, 'LEGENDARY');
  assert.equal(evaluateLocalAnswer(g('f014'), 'greedo').tier, 'RARE');
  assert.equal(evaluateLocalAnswer(g('f001'), 'sniffer').tier, 'UNCOMMON');
  assert.equal(evaluateLocalAnswer(g('f001'), 'creeper').tier, 'COMMON');
  assert.equal(evaluateLocalAnswer(g('n063'), 'klaberjass').tier, 'LEGENDARY');
});

test('normalizeAnswer strips punctuation and diacritics', () => {
  assert.equal(normalizeAnswer("  Crème Brûlée! "), 'creme brulee');
});

test('date key and midnight countdown formatting work cleanly', () => {
  assert.equal(getLocalDateKey(new Date(2026, 4, 3)), '2026-05-03');
  assert.equal(formatCountdown(3661000), '01:01:01');
});

test('createUnlimitedPromptDeck shuffles full bank without losing or duplicating prompts', () => {
  const deckA = createUnlimitedPromptDeck(PROMPT_BANK, 12345);
  const deckB = createUnlimitedPromptDeck(PROMPT_BANK, 67890);

  assert.equal(deckA.length, PROMPT_BANK.length);
  assert.equal(new Set(deckA.map((p) => p.id)).size, PROMPT_BANK.length);
  assert.notDeepEqual(
    deckA.slice(0, 10).map((p) => p.id),
    deckB.slice(0, 10).map((p) => p.id),
  );
});

test('station and biome helpers clamp in daily mode and wrap cleanly in unlimited loop mode', () => {
  assert.equal(getStationInfo('next-stop', 45, false).index, 40);
  const lap2Start = getStationInfo('next-stop', 41, true);
  assert.equal(lap2Start.index, 41);
  assert.equal(lap2Start.name, 'Hedgerow Halt');
  assert.equal(getBiomeForStation('next-stop', 41, true).id, 'countryside');
});

test('evaluateLocalAnswer rejects made-up or off-topic answers', () => {
  const africa = PROMPT_BANK.find((p) => p.prompt === 'Name a capital city in Africa');
  assert.ok(africa);
  for (const junk of ['banana', 'london', 'paris', 'potato', 'hello there', 'xyzzy', 'kinshasaville town']) {
    assert.equal(evaluateLocalAnswer(africa, junk).tier, 'INVALID', junk);
  }
  assert.equal(evaluateLocalAnswer(africa, 'Nairobi').valid, true);
  assert.equal(evaluateLocalAnswer(africa, 'nairobbi').valid, true); // small typo still counts
  assert.ok(['UNCOMMON', 'RARE', 'LEGENDARY'].includes(evaluateLocalAnswer(africa, 'Ouagadougou').tier));
  assert.equal(evaluateLocalAnswer(africa, 'Nairobi').tier, 'COMMON');
});
