import assert from 'node:assert/strict';
import test from 'node:test';
import { getCard } from '../src/engine.js';
import { createDeckEventFlow } from '../src/ui.js';

test('transform reveal result gates advancement until Continue', () => {
  const selected = getCard('twinfang');
  const deck = [getCard('sellsword'), selected, getCard('colossus')];
  let advances = 0;
  const flow = createDeckEventFlow({ deck, rng: () => 0, kind: 'transform', advance: () => advances++ });

  flow.select(1);
  const result = flow.confirm();

  assert.equal(result.removed.name, selected.name);
  assert.equal(result.replacement.name, deck[1].name);
  assert.equal(advances, 0);
  assert.equal(flow.continue(), true);
  assert.equal(advances, 1);
  assert.equal(flow.continue(), false);
  assert.equal(advances, 1);
});
