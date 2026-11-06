from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8331'
OUT = Path('refs/ui-audit/mana-bank')
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('globalThis.__DECK_BATTLER_NO_BOOT__=true')
    page.goto(BASE)
    page.evaluate("""async () => {
      window.ui = await import('/src/ui.js');
      window.e = await import('/src/engine.js');
      ui.setPlaybackSpeed(10);
      window.mountManaCase = kind => {
        const f = e.createFight({playerDeck: [], enemyDeck: []});
        let source;
        if (kind === 'gain') { source = e.summon(f, 'player', e.getCard('tax_collector')); f.player.mana = 2; }
        if (kind === 'drain') { source = e.summon(f, 'player', e.getCard('chrono_imp')); f.enemy.mana = 2; }
        if (kind === 'top') {
          source = e.summon(f, 'player', e.getCard('meddler'));
          const target = e.summon(f, 'enemy', e.getCard('aegis_knight'));
          target.baseAtk += 4; target.damage = 3; target.shield = false; target.poisoned = true;
          f.enemy.deck.push(e.getCard('colossus'));
          window.bounceTarget = target.uid;
        }
        if (kind === 'boss') {
          source = e.summon(f, 'player', e.getCard('doomcaller'));
          e.summon(f, 'enemy', {id:'audit_boss', name:'Audit Boss', cost:0, atk:1, hp:8}, {boss:'herald'});
        }
        f.events = []; ui.mountBattleScreen(f); e.triggerBattlecry(f, 'player', source);
        window.auditFight = f; window.auditEvents = f.events; window.playing = ui.playEvents(f.events);
      };
    }""")

    page.evaluate("mountManaCase('gain')")
    page.evaluate('playing')
    player_mana = page.locator('.side--player .mana-bank').inner_text()
    assert player_mana == 'MANA 3', player_mana
    page.screenshot(path=str(OUT / 'gain-desktop.png'), full_page=True)

    page.evaluate("mountManaCase('drain')")
    page.evaluate('playing')
    enemy_mana = page.locator('.side--enemy .mana-bank').inner_text()
    assert enemy_mana == 'MANA 1', enemy_mana
    page.screenshot(path=str(OUT / 'drain-desktop.png'), full_page=True)

    page.evaluate("mountManaCase('top')")
    proof = page.evaluate("""() => ({
      order: auditEvents.map(event => event.type),
      preMutationTarget: auditEvents[0].state.enemy.board.some(unit => unit.uid === bounceTarget),
      postMutationTarget: auditEvents[1].state.enemy.board.some(unit => unit.uid === bounceTarget),
      stripped: auditFight.enemy.deck[0].atk === 2 && auditFight.enemy.deck[0].hp === 7 && auditFight.enemy.deck[0].keywords.includes('shield'),
    })""")
    page.evaluate('playing')
    assert proof == {'order': ['bounce', 'shift'], 'preMutationTarget': True, 'postMutationTarget': False, 'stripped': True}
    assert page.locator(f'[data-uid="{page.evaluate("bounceTarget")}"]').count() == 0
    assert page.locator('.side--enemy .deck-top .card__name').inner_text() == 'Aegis Knight'
    page.screenshot(path=str(OUT / 'top-bounce-desktop.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(OUT / 'top-bounce-mobile.png'), full_page=True)

    page.set_viewport_size({'width': 1920, 'height': 1080})
    page.evaluate("mountManaCase('boss')")
    assert page.evaluate("auditEvents[0].fizzle") is True
    page.evaluate('playing')
    assert page.locator('[data-uid]').count() == 2
    page.screenshot(path=str(OUT / 'boss-fizzle-desktop.png'), full_page=True)

    assert not errors, errors
    print('MANA PASS: gain and drain render resolved pools')
    print('BOUNCE PASS:', proof)
    print('BOSS PASS: immune target produces fizzle and remains mounted')
    print('SCREENSHOTS:', len(list(OUT.glob('*.png'))))

    page.goto(f'{BASE}/tools/invariants.html')
    page.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')", timeout=60000)
    print(page.title())
    assert page.title().startswith('INVARIANTS: PASS')
    browser.close()
