import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCareerStats,
  LEGACY_LAST_STOP_STORAGE_KEY,
  loadNextStopSave,
  migrateLegacyLastStopData,
  NEXT_STOP_EUROPE_STORAGE_KEY,
  NEXT_STOP_STORAGE_KEY,
  recordPromptAttempt,
} from './storage';
import type { NextStopSaveData, PromptAttempt } from './types';

function makeAttempt(
  id: string,
  tier: PromptAttempt['tier'],
  stations: number,
): PromptAttempt {
  return {
    promptId: id,
    promptText: `Prompt ${id}`,
    category: 'TEST',
    answer: 'Test Answer',
    timedOut: false,
    valid: tier !== 'INVALID',
    tier,
    stations,
    points: stations * 10,
    reason: 'Good test',
    source: 'local',
  };
}

test('recordPromptAttempt sums stations and score = stations * 10 and locks after 5 prompts', () => {
  const promptIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
  let save: NextStopSaveData = { runsByDate: {} };

  save = recordPromptAttempt(save, '2026-05-10', promptIds, makeAttempt('p1', 'COMMON', 1));
  save = recordPromptAttempt(save, '2026-05-10', promptIds, makeAttempt('p2', 'FAKE_DEEP', 2));
  save = recordPromptAttempt(save, '2026-05-10', promptIds, makeAttempt('p3', 'UNCOMMON', 4));
  save = recordPromptAttempt(save, '2026-05-10', promptIds, makeAttempt('p4', 'RARE', 6));
  save = recordPromptAttempt(save, '2026-05-10', promptIds, makeAttempt('p5', 'LEGENDARY', 8));

  const run = save.runsByDate['2026-05-10'];
  assert.equal(run.completed, true);
  assert.equal(run.totalStations, 21);
  assert.equal(run.totalScore, 210);

  // Attempting a 6th prompt on the same day is ignored
  save = recordPromptAttempt(save, '2026-05-10', promptIds, makeAttempt('p6', 'LEGENDARY', 8));
  assert.equal(save.runsByDate['2026-05-10'].attempts.length, 5);
  assert.equal(save.runsByDate['2026-05-10'].totalStations, 21);
});

test('migrateLegacyLastStopData converts old km-based save into station/score schema', () => {
  const legacyRaw = JSON.stringify({
    runsByDate: {
      '2026-05-01': {
        dateKey: '2026-05-01',
        promptIds: ['p1', 'p2'],
        completed: false,
        totalKm: 110,
        attempts: [
          {
            promptId: 'p1',
            promptText: 'Name a cheese',
            category: 'FOOD',
            answer: 'Cheddar',
            timedOut: false,
            valid: true,
            tier: 'COMMON',
            points: 10,
            reason: 'Classic cheddar.',
            source: 'local',
          },
          {
            promptId: 'p2',
            promptText: 'Name a tree',
            category: 'NATURE',
            answer: 'Monkey Puzzle',
            timedOut: false,
            valid: true,
            tier: 'LEGENDARY',
            points: 100,
            reason: 'Spiky rare pick.',
            source: 'gemini',
          },
        ],
      },
    },
  });

  const migrated = migrateLegacyLastStopData(legacyRaw);
  const run = migrated.runsByDate['2026-05-01'];
  assert.ok(run);
  assert.equal(run.totalStations, 9); // 1 (COMMON) + 8 (LEGENDARY)
  assert.equal(run.totalScore, 90);
  assert.equal(run.attempts[1].stations, 8);
  assert.equal(run.attempts[1].points, 80);
});

test('loadNextStopSave migrates localStorage from legacy key automatically', () => {
  const store: Record<string, string> = {
    [LEGACY_LAST_STOP_STORAGE_KEY]: JSON.stringify({
      runsByDate: {
        '2026-05-02': {
          dateKey: '2026-05-02',
          promptIds: ['p1'],
          completed: false,
          attempts: [
            {
              promptId: 'p1',
              promptText: 'Prompt 1',
              category: 'CAT',
              answer: 'Oak',
              timedOut: false,
              valid: true,
              tier: 'RARE',
              points: 75,
              reason: 'Nice',
              source: 'local',
            },
          ],
        },
      },
    }),
  };

  const mockWindow = {
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    },
  };

  const prevWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = mockWindow;
  try {
    const loaded = loadNextStopSave('next-stop');
    assert.equal(loaded.runsByDate['2026-05-02'].totalStations, 6);
    assert.equal(loaded.runsByDate['2026-05-02'].totalScore, 60);
    assert.ok(store[NEXT_STOP_STORAGE_KEY]);
    assert.equal(store[LEGACY_LAST_STOP_STORAGE_KEY], undefined);
    assert.notEqual(NEXT_STOP_STORAGE_KEY, NEXT_STOP_EUROPE_STORAGE_KEY);
  } finally {
    (globalThis as unknown as { window?: unknown }).window = prevWindow;
  }
});

test('computeCareerStats aggregates streaks, lifetime stations, score, and extra Europe save', () => {
  const promptIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
  let mainSave: NextStopSaveData = { runsByDate: {} };
  for (const d of ['2026-05-08', '2026-05-09', '2026-05-10']) {
    for (const p of promptIds) {
      mainSave = recordPromptAttempt(mainSave, d, promptIds, makeAttempt(p, 'UNCOMMON', 4));
    }
  }
  let euSave: NextStopSaveData = { runsByDate: {} };
  for (const p of promptIds) {
    euSave = recordPromptAttempt(euSave, '2026-05-10', promptIds, makeAttempt(p, 'LEGENDARY', 8));
  }

  const stats = computeCareerStats(mainSave, '2026-05-10', euSave);
  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.bestStreak, 3);
  assert.equal(stats.lifetimeStations, 100); // 3 * 20 + 40
  assert.equal(stats.lifetimeScore, 1000);
  assert.equal(stats.bestDayScore, 400);
  assert.equal(stats.bulletTrainsCaught, 5);
});
