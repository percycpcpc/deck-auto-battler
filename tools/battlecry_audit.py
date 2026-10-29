from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8321'
OUT = Path('refs/ui-audit/battlecry')
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
      window.mountDraft = () => {
        const screen = document.createElement('section'); screen.className = 'screen draft';
        const banner = document.createElement('img'); banner.className = 'banner'; banner.src = 'assets/banner_draft.png'; banner.alt = '';
        const title = document.createElement('h1'); title.textContent = 'CHOOSE ONE';
        const prompt = document.createElement('p'); prompt.textContent = 'Pick 1 of 2 · Deck 8 cards';
        const offers = document.createElement('div'); offers.id = 'offers';
        for (const id of ['inquisitor', 'gate_crasher', 'gravedigger']) offers.append(ui.draftCard(e.getCard(id)));
        screen.append(banner, title, prompt, offers); document.querySelector('#app').replaceChildren(screen);
      };
      window.mountBattlecry = kind => {
        const f = e.createFight({playerDeck: [], enemyDeck: []});
        const sourceId = kind === 'fizzle' ? 'scout' : 'inquisitor';
        const source = e.summon(f, 'player', e.getCard(sourceId));
        if (kind !== 'fizzle') e.summon(f, 'enemy', e.getCard('colossus'));
        f.events = []; ui.mountBattleScreen(f); e.triggerBattlecry(f, 'player', source);
        const battlecry = f.events.find(event => event.type === 'battlecry');
        const damage = f.events.find(event => event.type === 'damage');
        window.orderProof = { battlecry: f.events.indexOf(battlecry), damage: f.events.indexOf(damage), targetUid: battlecry.targetUid };
        window.playing = ui.playEvents(f.events); return source.uid;
      };
    }""")

    page.evaluate('mountDraft()')
    page.screenshot(path=str(OUT / 'draft-1920.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(OUT / 'draft-390.png'), full_page=True)
    assert page.locator('.draft-effect').count() == 3
    assert all(text.startswith('On deploy:') for text in page.locator('.draft-effect').all_inner_texts())

    page.set_viewport_size({'width': 1920, 'height': 1080})
    page.evaluate("mountBattlecry('targeted')")
    page.wait_for_selector('.fx-battlecry-source')
    assert page.locator('.fx-battlecry-target').count() == 1
    assert page.locator('.battlecry-caption').inner_text() == 'Battlecry: 3 damage → strongest enemy'
    proof = page.evaluate('orderProof')
    assert proof['targetUid'] and proof['battlecry'] < proof['damage']
    page.screenshot(path=str(OUT / 'battlecry-pulse-1920.png'), full_page=True)
    page.evaluate('playing')

    source_uid = page.evaluate("mountBattlecry('fizzle')")
    page.wait_for_selector('.fx-battlecry-source')
    assert page.locator('.battlecry-caption').inner_text() == 'Battlecry: no enemy charging'
    page.screenshot(path=str(OUT / 'battlecry-fizzle-1920.png'), full_page=True)
    page.evaluate('playing')

    page.locator(f'[data-uid="{source_uid}"]').click()
    detail = page.locator('.battle-detail')
    assert detail.is_visible()
    assert 'On deploy: reveal' in detail.inner_text()
    page.screenshot(path=str(OUT / 'inspect-battlecry-1920.png'), full_page=True)

    page.emulate_media(reduced_motion='reduce')
    page.evaluate("mountBattlecry('fizzle')")
    page.wait_for_selector('.battlecry-caption.is-reduced')
    assert page.locator('.fx-battlecry-source').count() == 1
    page.evaluate('playing')
    page.emulate_media(reduced_motion='no-preference')

    print('ORDER PASS:', proof)
    print('DRAFT DESCRIPTORS PASS: desktop + 390px')
    print('BATTLECRY FEEDBACK PASS: targeted + fizzle + inspect')
    print('REDUCED MOTION PASS: static source outline + caption, 300ms logical wait')
    print('BROWSER ERRORS:', errors)
    assert not errors

    page.goto(f'{BASE}/tools/invariants.html')
    page.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')", timeout=60000)
    print(page.title())
    print(page.locator('#results').inner_text())
    assert page.title().startswith('INVARIANTS: PASS')
    browser.close()
