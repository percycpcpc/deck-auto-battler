import { HERO_HP, getCard, makeRng, runRound, startRunFight } from '../../src/engine.js';

export function simulateDeckBattle({ cardIdsA, cardIdsB, seed }) {
  const run = {
    fight: 1,
    hp: HERO_HP,
    deck: cardIdsA.map(getCard),
    rng: makeRng(seed),
    enemyLine: cardIdsB.map(getCard),
    won: false,
    lost: false,
    starterId: null,
  };
  const fight = startRunFight(run);
  // startRunFight owns the client fight path; attach its seeded stream to the
  // fight so unit and token uid generation is replay-deterministic as well.
  fight.uidRng = run.rng;
  while (!fight.over) runRound(fight);
  return { winner: fight.winner, rounds: fight.round, events: fight.events };
}
