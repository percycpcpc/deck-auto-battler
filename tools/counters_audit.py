from pathlib import Path
from urllib.request import urlopen

from playwright.sync_api import sync_playwright


BASE = 'http://localhost:8321'
OUT = Path('refs/ui-audit/counters')
OUT.mkdir(parents=True, exist_ok=True)

PORTRAITS = {
    'Headsman': 'portrait_doomcaller.png',
    'Firebelcher': 'portrait_plague_bearer.png',
    'Shield Saint': 'portrait_aegis_knight.png',
    'Bristleback': 'portrait_venom_hound.png',
    'Quillback Elder': 'portrait_warlord.png',
}

for name, filename in PORTRAITS.items():
    response = urlopen(f'{BASE}/assets/{filename}')
    print(f'ASSET {name}: {filename} HTTP {response.status}')
    assert response.status == 200

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
      window.mountCountersDraft = () => {
        const screen = document.createElement('section'); screen.className = 'screen draft';
        const title = document.createElement('h1'); title.textContent = 'COUNTER PACKAGE';
        const prompt = document.createElement('p'); prompt.textContent = 'Five new draft-pool units';
        const offers = document.createElement('div'); offers.id = 'offers';
        for (const id of ['headsman', 'firebelcher', 'shield_saint', 'bristleback', 'quillback_elder']) offers.append(ui.draftCard(e.getCard(id)));
        screen.append(title, prompt, offers); document.querySelector('#app').replaceChildren(screen);
      };
      window.mountBristleback = () => {
        const f = e.createFight({playerDeck: [], enemyDeck: []});
        const bristle = e.summon(f, 'player', e.getCard('bristleback'));
        const pinger = e.summon(f, 'enemy', {id:'audit_pinger', name:'Audit Pinger', cost:0, atk:1, hp:10});
        ui.mountBattleScreen(f); f.events = []; e.exchange(f, 'enemy', pinger, bristle);
        window.playing = ui.playEvents(f.events); return bristle.uid;
      };
      window.mountQuillback = () => {
        const f = e.createFight({playerDeck: [], enemyDeck: []});
        const elder = e.summon(f, 'player', e.getCard('quillback_elder'));
        ui.mountBattleScreen(f); f.events = []; const entrant = e.summon(f, 'enemy', e.getCard('sellsword'));
        window.playing = ui.playEvents(f.events); return {elder: elder.uid, entrant: entrant.uid};
      };
      window.mountFirebelcher = () => {
        const f = e.createFight({fight:2, playerDeck: [], enemyDeck: []});
        e.summon(f, 'enemy', e.getCard('sellsword'));
        const fire = e.summon(f, 'player', e.getCard('firebelcher'));
        ui.mountBattleScreen(f); f.events = []; e.triggerBattlecry(f, 'player', fire);
        window.fireOrder = f.events.map(event => event.type); window.playing = ui.playEvents(f.events); return fire.uid;
      };
    }""")

    page.evaluate('mountCountersDraft()')
    descriptors = page.locator('.draft-effect').all_inner_texts()
    assert descriptors == [
        'After this kills a unit, gain +2/+2.',
        'On deploy: deal 1 damage to ALL enemy units.',
        'Divine Shield',
        'When this takes damage and survives, gain +3 Attack.',
        'When any other unit enters a battlefield, deal 1 damage to it.',
    ]
    page.screenshot(path=str(OUT / 'draft-descriptors-desktop.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(OUT / 'draft-descriptors-mobile.png'), full_page=True)

    page.set_viewport_size({'width': 1920, 'height': 1080})
    bristle_uid = page.evaluate('mountBristleback()')
    page.wait_for_function("uid => document.querySelector(`[data-uid='${uid}'] .card__atk`)?.textContent === '4'", arg=bristle_uid)
    page.screenshot(path=str(OUT / 'bristleback-stat-change.png'), full_page=True)
    page.evaluate('playing')
    assert 'Bristleback gains +3 Attack.' in page.locator('.battle-log__history').inner_text()

    ids = page.evaluate('mountQuillback()')
    page.wait_for_selector(f"[data-uid='{ids['elder']}'].fx-battlecry-source")
    assert page.locator(f"[data-uid='{ids['entrant']}'].fx-battlecry-target").count() == 1
    page.screenshot(path=str(OUT / 'quillback-entry-ping.png'), full_page=True)
    page.evaluate('playing')

    page.evaluate('mountFirebelcher()')
    page.wait_for_selector('.battlecry-caption')
    assert page.locator('.battlecry-caption').inner_text() == 'Battlecry: 1 damage to all enemies'
    page.screenshot(path=str(OUT / 'firebelcher-battlecry.png'), full_page=True)
    page.evaluate('playing')
    order = page.evaluate('fireOrder')
    assert order[0] == 'battlecry' and order[1:] == ['damage', 'damage']

    print('DRAFT DESCRIPTORS PASS: desktop + 390x844 mobile')
    print('BRISTLEBACK STAT CHANGE PASS: plaque + log')
    print('QUILLBACK ENTRY PING PASS: source + target feedback')
    print('FIREBELCHER PASS:', order)
    print('BROWSER ERRORS:', errors)
    assert not errors
    browser.close()
