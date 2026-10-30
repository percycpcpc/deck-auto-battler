from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8324/'
OUT = Path('refs/ui-audit/deferred-shift')
OUT.mkdir(parents=True, exist_ok=True)

SETUP = r"""async () => {
  document.body.innerHTML = '<main id="app"></main>';
  const engine = await import('/src/engine.js');
  const ui = await import('/src/ui.js');
  const fight = engine.createFight({ playerDeck: [], enemyDeck: [] });
  const p0 = engine.summon(fight, 'player', { ...engine.getCard('sellsword'), name:'Vanguard', cost:0, atk:2, hp:10 });
  engine.summon(fight, 'player', { ...engine.getCard('road_ogre'), name:'Support', cost:0, atk:0, hp:10 });
  const doomed = engine.summon(fight, 'enemy', { ...engine.getCard('dagger_imp'), name:'Doomed Guard', cost:0, atk:0, hp:1 });
  const survivor = engine.summon(fight, 'enemy', { ...engine.getCard('oathbound'), name:'Rear Guard', cost:0, atk:0, hp:10 });
  fight.player.deck.push({ ...engine.getCard('colossus'), cost:99 });
  fight.enemy.deck.push({ ...engine.getCard('colossus'), cost:99 });
  ui.mountBattleScreen(fight, document.querySelector('#app'));
  const corpseNode = ui.getUnitEl(doomed.uid), survivorNode = ui.getUnitEl(survivor.uid);
  engine.runRound(fight);
  const shift = fight.events.find(event => event.type === 'shift' && event.side === 'enemy');
  window.audit = { engine, ui, fight, doomed, survivor, corpseNode, survivorNode, shift };
  window.audit.playback = ui.playEvents(fight.events);
}"""

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='chrome', headless=True)
    for label, viewport in [('desktop', {'width': 1920, 'height': 1080}), ('mobile', {'width': 390, 'height': 844})]:
        page = browser.new_page(viewport=viewport)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("globalThis.__DECK_BATTLER_NO_BOOT__ = true")
        page.goto(BASE, wait_until='networkidle')
        page.evaluate(SETUP)
        page.wait_for_function("audit.corpseNode.classList.contains('is-corpse') && audit.corpseNode.isConnected")
        mid = page.evaluate("""() => ({
          sameNode: audit.ui.getUnitEl(audit.doomed.uid) === audit.corpseNode,
          opacity: Number(getComputedStyle(audit.corpseNode).opacity),
          deadInSnapshot: audit.fight.events.find(event => event.type === 'death' && event.uid === audit.doomed.uid).state.enemy.board.find(unit => unit.uid === audit.doomed.uid)?.dead,
          shiftPhase: audit.shift?.phase,
          removedUids: audit.shift?.removedUids
        })""")
        assert mid['sameNode'] and mid['opacity'] > 0 and mid['deadInSnapshot'] is True
        assert mid['shiftPhase'] == 'cleanup' and len(mid['removedUids']) == 1
        page.screenshot(path=str(OUT / f'{label}-corpse-mid-round.png'), full_page=True)
        page.evaluate("audit.playback")
        page.wait_for_function("!audit.corpseNode.isConnected")
        cleanup = page.evaluate("""() => ({
          corpseRemoved: !audit.corpseNode.isConnected,
          survivorSameNode: audit.ui.getUnitEl(audit.survivor.uid) === audit.survivorNode,
          survivorSlot: audit.ui.unitEls.get(audit.survivor.uid).slotIndex,
          board: audit.fight.enemy.board.map(unit => unit.uid),
          shiftCount: audit.fight.events.filter(event => event.type === 'shift' && event.side === 'enemy').length
        })""")
        assert cleanup == {'corpseRemoved': True, 'survivorSameNode': True, 'survivorSlot': 0, 'board': [page.evaluate('audit.survivor.uid')], 'shiftCount': 1}
        page.screenshot(path=str(OUT / f'{label}-cleanup-batch-shift.png'), full_page=True)
        assert not errors, errors
        page.close()

    invariants = browser.new_page(viewport={'width': 1920, 'height': 1080})
    invariant_errors = []
    invariants.on('pageerror', lambda error: invariant_errors.append(str(error)))
    invariants.goto(BASE + 'tools/invariants.html')
    invariants.wait_for_function("document.title.startsWith('INVARIANTS: PASS')", timeout=120_000)
    print(invariants.title())
    assert not invariant_errors, invariant_errors
    invariants.close()
    browser.close()

print('PASS real-browser deferred-shift audit: corpse persistence, cleanup batch, desktop/mobile screenshots')
