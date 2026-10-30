import { createFight, runRound } from '../src/engine.js';

const fight = createFight({ fight: 1, rng: () => 0 });
const events = [];

for (let round = 0; round < 3 && !fight.over; round++) {
  runRound(fight);
  events.push(...fight.events);
}

const death = events.find(event => event.type === 'death'
  && event.state[event.side].board.some(unit => unit.uid === event.uid && unit.dead));
const deploy = events.find(event => event.type === 'deploy'
  && event.state[event.side].board.some(unit => unit.uid === event.uid));
const shift = death && events.find(event => event.type === 'shift'
  && event.side === death.side
  && event.removedUids.includes(death.uid)
  && !event.state[event.side].board.some(unit => unit.uid === death.uid));

if (!death || !deploy || !shift) {
  console.error(`FAIL: death corpse snapshot=${Boolean(death)}, cleanup removal snapshot=${Boolean(shift)}, deploy snapshot=${Boolean(deploy)}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: death ${death.uid} marked dead then absent at cleanup shift; deploy ${deploy.uid} present`);
}
