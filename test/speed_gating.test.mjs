import assert from 'node:assert/strict';
import { FREE_SPEEDS, PREMIUM_SPEEDS, SPEEDS, durationAtSpeed, isSpeedAvailable } from '../src/speeds.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed} - ${name}`); }
  catch (error) { console.error(`not ok - ${name}`); throw error; }
}

test('speed table keeps x1/x2 free and x3/x10 Premium', () => {
  assert.deepEqual(FREE_SPEEDS, [1, 2]);
  assert.deepEqual(PREMIUM_SPEEDS, [3, 10]);
  assert.deepEqual(SPEEDS, [1, 2, 3, 10]);
});

test('availability is controlled only by the server-derived entitlement flag', () => {
  globalThis.localStorage = { getItem: () => '10' };
  assert.deepEqual(SPEEDS.filter(speed => isSpeedAvailable(speed, false)), [1, 2]);
  assert.deepEqual(SPEEDS.filter(speed => isSpeedAvailable(speed, undefined)), [1, 2]);
  assert.deepEqual(SPEEDS.filter(speed => isSpeedAvailable(speed, true)), [1, 2, 3, 10]);
  delete globalThis.localStorage;
});

test('duration table scales monotonically at every supported speed', () => {
  const durations = SPEEDS.map(speed => durationAtSpeed(1000, speed));
  assert.deepEqual(durations, [2000, 1000, 667, 200]);
  assert.ok(durations.every((duration, index) => index === 0 || duration < durations[index - 1]));
  assert.equal(durationAtSpeed(1000, 2), durationAtSpeed(1000, 1) / 2);
});

console.log(`# ${passed} speed gating tests passed`);
