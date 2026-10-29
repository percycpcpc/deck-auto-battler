import { createFight, runRound } from '../src/engine.js';

const fight = createFight({ fight: 1, rng: () => 0 });
const events = [];

for (let round = 0; round < 3 && !fight.over; round++) {
  runRound(fight);
  events.push(...fight.events);
}

const death = events.find(event => event.type === 'death'
  && !event.state[event.side].board.some(unit => unit.uid === event.uid));
const deploy = events.find(event => event.type === 'deploy'
  && event.state[event.side].board.some(unit => unit.uid === event.uid));

if (!death || !deploy) {
  console.error(`FAIL: death snapshot=${Boolean(death)}, deploy snapshot=${Boolean(deploy)}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: death ${death.uid} absent; deploy ${deploy.uid} present`);
}
