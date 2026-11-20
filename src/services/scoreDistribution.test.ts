import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBellCurveStats,
  generateSimulatedBellCurve,
  getScoreBucket,
} from './scoreDistribution';

test('getScoreBucket maps 0..400 scores into 10 carriage buckets 0..9', () => {
  assert.equal(getScoreBucket(0), 0);
  assert.equal(getScoreBucket(39), 0);
  assert.equal(getScoreBucket(40), 1);
  assert.equal(getScoreBucket(199), 4);
  assert.equal(getScoreBucket(200), 5);
  assert.equal(getScoreBucket(359), 8);
  assert.equal(getScoreBucket(360), 9);
  assert.equal(getScoreBucket(400), 9);
});

test('computeBellCurveStats calculates percentile beat accurately', () => {
  const buckets = [10, 10, 20, 20, 20, 10, 5, 3, 1, 1]; // 100 total players
  const topPlayer = computeBellCurveStats(buckets, 400);
  assert.equal(topPlayer.playerBucket, 9);
  assert.equal(topPlayer.percentileBeat, 99);

  const zeroPlayer = computeBellCurveStats(buckets, 0);
  assert.equal(zeroPlayer.playerBucket, 0);
  assert.equal(zeroPlayer.percentileBeat, 0);

  const midPlayer = computeBellCurveStats(buckets, 200);
  assert.equal(midPlayer.playerBucket, 5);
  assert.ok(midPlayer.percentileBeat >= 75 && midPlayer.percentileBeat <= 85);
});

test('generateSimulatedBellCurve produces 10 positive buckets deterministically', () => {
  const curveA = generateSimulatedBellCurve('next-stop', '2026-05-10', 220);
  const curveB = generateSimulatedBellCurve('next-stop', '2026-05-10', 220);
  assert.equal(curveA.length, 10);
  assert.deepEqual(curveA, curveB);
  assert.ok(curveA.every((n) => n >= 1));
  assert.ok(curveA[4] > curveA[9]); // classic bell shape: middle denser than top tail
});
