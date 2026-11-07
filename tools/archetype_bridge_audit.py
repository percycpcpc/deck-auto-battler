from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8324/'
OUT = Path('refs/ui-audit/archetype-bridges')
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('globalThis.__DECK_BATTLER_NO_BOOT__ = true')
    page.goto(BASE)
    evidence = page.evaluate("""async () => {
      const e = await import('/src/engine.js');
      const ui = await import('/src/ui.js');
      const screen = document.createElement('section'); screen.className = 'screen draft';
      const title = document.createElement('h1'); title.textContent = 'ARCHETYPE BRIDGES';
      const offers = document.createElement('div'); offers.id = 'offers';
      offers.append(ui.draftCard(e.getCard('shield_saint')), ui.draftCard(e.getCard('ashguard')));
      screen.append(title, offers); document.querySelector('#app').replaceChildren(screen);

      const fight = e.createFight({ playerDeck: [], enemyDeck: [] });
      const token = e.summon(fight, 'player', { id: 'audit_token', name: 'Token', cost: 0, atk: 1, hp: 1, token: true });
      const tender = e.summon(fight, 'player', e.getCard('shield_saint'));
      fight.events = []; e.triggerBattlecry(fight, 'player', tender);
      const event = fight.events[0];
      const ashguard = e.getCard('ashguard');
      return {
        pit: e.getCard('shield_saint'), ashguard,
        sacrifice: { kind: event.kind, targetUid: event.targetUid, tokenUid: token.uid, tokenDamage: token.damage },
      };
    }""")
    assert evidence['pit']['name'] == 'Pit Tender'
    assert evidence['pit']['tier'] == 'common' and evidence['pit']['battlecry'] == 'cultist'
    assert evidence['ashguard']['tier'] == 'common' and evidence['ashguard']['aura'] == 'adjacentAtk'
    assert evidence['sacrifice']['kind'] == 'cultist'
    assert evidence['sacrifice']['targetUid'] == evidence['sacrifice']['tokenUid']
    assert evidence['sacrifice']['tokenDamage'] == 999
    page.screenshot(path=str(OUT / 'bridge-cards-desktop-1920x1080.png'), full_page=True)

    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(OUT / 'bridge-cards-mobile-390x844.png'), full_page=True)

    page.goto(BASE + 'tools/invariants.html')
    page.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')", timeout=60000)
    print(page.locator('#results').inner_text())
    assert page.title().startswith('INVARIANTS: PASS')
    assert not errors, errors
    print('PASS archetype bridge cards desktop/mobile, sacrifice contract, and real-browser invariants')
    browser.close()
