from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = 'http://localhost:8325/'
OUT = Path('refs/ui-audit/inquisitor-sellsword')
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('globalThis.__DECK_BATTLER_NO_BOOT__ = true')
    page.goto(BASE)
    page.evaluate("""async () => {
      window.e = await import('/src/engine.js');
      window.ui = await import('/src/ui.js');
      window.mountCards = () => {
        const screen = document.createElement('section'); screen.className = 'screen draft';
        const title = document.createElement('h1'); title.textContent = 'OWNER-LOCKED BALANCE';
        const offers = document.createElement('div'); offers.id = 'offers';
        offers.append(ui.draftCard(e.getCard('sellsword')), ui.draftCard(e.getCard('inquisitor')));
        screen.append(title, offers); document.querySelector('#app').replaceChildren(screen);
      };
      window.mountFight = () => {
        const fight = e.createFight({ playerDeck: [], enemyDeck: [] });
        const sellsword = e.summon(fight, 'player', e.getCard('sellsword'));
        const inquisitor = e.summon(fight, 'player', e.getCard('inquisitor'));
        const target = e.summon(fight, 'enemy', e.getCard('colossus'));
        fight.events = []; ui.mountBattleScreen(fight); e.triggerBattlecry(fight, 'player', inquisitor);
        const battlecry = fight.events.find(event => event.type === 'battlecry');
        window.auditEvidence = {
          sellsword: { atk: sellsword.baseAtk, hp: sellsword.baseMaxHp },
          inquisitor: { amount: inquisitor.battlecryAmount, eventAmount: battlecry.amount },
          target: { uid: target.uid, damage: target.damage },
        };
        window.playing = ui.playEvents(fight.events);
      };
    }""")

    page.evaluate('mountCards()')
    cards = page.locator('#offers .draft-card')
    assert cards.nth(0).inner_text().find('3') >= 0
    assert 'deal 5 damage' in cards.nth(1).inner_text()
    page.screenshot(path=str(OUT / 'draft-desktop-1920x1080.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(OUT / 'draft-mobile-390x844.png'), full_page=True)

    page.set_viewport_size({'width': 1920, 'height': 1080})
    page.evaluate('mountFight()')
    page.wait_for_selector('.battlecry-caption')
    assert page.locator('.battlecry-caption').inner_text() == 'Battlecry: 5 damage → strongest enemy'
    evidence = page.evaluate('auditEvidence')
    assert evidence['sellsword'] == {'atk': 3, 'hp': 3}
    assert evidence['inquisitor'] == {'amount': 5, 'eventAmount': 5}
    assert evidence['target']['damage'] == 5
    page.screenshot(path=str(OUT / 'battle-desktop-1920x1080.png'), full_page=True)
    page.evaluate('playing')

    page.goto(BASE + 'tools/invariants.html')
    page.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')", timeout=60000)
    assert page.title().startswith('INVARIANTS: PASS')
    assert not errors, errors
    print('PASS owner-locked card faces, 5-damage event/caption, desktop/mobile screenshots, and browser invariants')
    browser.close()
