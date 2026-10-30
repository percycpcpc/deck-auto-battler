from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8324/'
OUT = Path('refs/ui-audit/preboard')
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
      window.mountFight = fightNumber => {
        window.f = e.createFight({ fight:fightNumber, rng:()=>0 });
        ui.mountBattleScreen(f);
      };
      window.mountDraft = fightNumber => {
        const line = e.enemyDeckFor(fightNumber, ()=>0);
        const screen = document.createElement('section'); screen.className = 'screen draft';
        const heading = document.createElement('h1'); heading.textContent = 'CHOOSE ONE';
        const prompt = document.createElement('p'); prompt.textContent = 'Pick 1 of 2 · Deck 8 cards';
        const offers = document.createElement('div'); offers.id = 'offers';
        for (const id of ['venom_hound','firebelcher','cataclysm']) offers.append(ui.draftCard(e.getCard(id)));
        const boss = fightNumber === 2 ? e.makeUnit({id:'boss_hivematron',name:'Hivematron',cost:0,atk:1,hp:5},'enemy',{boss:'hive'}) : null;
        screen.append(heading, prompt, ui.createEnemyPreview(fightNumber, boss ? [boss,...line.map(x=>e.makeUnit(x,'enemy'))] : line), offers);
        document.querySelector('#app').replaceChildren(screen);
      };
      mountFight(1);
    }""")
    assert page.locator('.side--enemy .card').count() == 8
    assert page.locator('.side--enemy .deck-stack.is-empty').count() == 1
    assert page.locator('.side--enemy .charger-slot.is-empty').count() == 1
    page.screenshot(path=str(OUT / 'fight-1-opening-1920.png'), full_page=True)
    page.locator('.enemy-preview--opening').evaluate("node => node.classList.add('is-dismissed')")
    page.screenshot(path=str(OUT / 'enemy-deck-empty-1920.png'), full_page=True)

    page.evaluate('mountDraft(2)')
    assert 'Hivematron' in page.locator('.enemy-preview').inner_text()
    page.screenshot(path=str(OUT / 'draft-preview-1920.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(OUT / 'draft-preview-390.png'), full_page=True)

    page.set_viewport_size({'width': 1920, 'height': 1080})
    page.evaluate('mountFight(2)')
    assert page.locator('.side--enemy .card').count() == 8
    assert page.locator('.side--enemy .boss').count() == 1
    page.screenshot(path=str(OUT / 'fight-2-boss-wall-1920.png'), full_page=True)

    page.goto(BASE + 'tools/invariants.html')
    page.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')", timeout=60000)
    print(page.locator('#results').inner_text())
    assert page.title().startswith('INVARIANTS: PASS')
    assert not errors, errors
    print('PASS real-browser preboard audit and invariant harness')
    browser.close()
