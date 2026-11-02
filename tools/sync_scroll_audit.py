from pathlib import Path

from playwright.sync_api import sync_playwright


out = Path('refs/ui-audit/sync-scroll')
out.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('globalThis.__DECK_BATTLER_NO_BOOT__=true')
    page.goto('http://localhost:8324/')
    page.evaluate("""async () => {
      window.ui = await import('/src/ui.js');
      window.engine = await import('/src/engine.js');
      window.mountOverflow = () => {
        const fight = engine.createFight({ playerDeck:[], enemyDeck:[] });
        const ids = ['sellsword', 'aegis_knight', 'venom_hound', 'warlord', 'twinfang', 'road_ogre', 'squire', 'colossus', 'dagger_imp', 'scout'];
        for (const side of ['player', 'enemy']) ids.forEach((id, index) => fight[side].board.push(engine.makeUnit(engine.getCard(id), side, { uid:`sync-${side}-${index}` })));
        ui.mountBattleScreen(fight);
      };
      mountOverflow();
    }""")

    def positions():
        return page.evaluate("""() => {
          const enemy = document.querySelector('.side--enemy .board-scroll');
          const player = document.querySelector('.side--player .board-scroll');
          const styles = getComputedStyle(document.querySelector('#battle-screen'));
          const pitch = parseFloat(styles.getPropertyValue('--slot-w')) + parseFloat(styles.getPropertyValue('--slot-gap'));
          return { enemy:enemy.scrollLeft, player:player.scrollLeft, pitch, enemyFirst:Math.floor((enemy.scrollLeft + 1) / pitch), playerFirst:Math.floor((player.scrollLeft + 1) / pitch) };
        }""")

    page.eval_on_selector('.side--player .board-scroll', '(node) => { node.scrollLeft = 6 * 240; }')
    page.wait_for_timeout(100)
    slot_six = positions()
    assert slot_six['enemyFirst'] == slot_six['playerFirst'] >= 6
    assert abs(slot_six['enemy'] - slot_six['player']) <= 1

    enemy_box = page.locator('.side--enemy .board-scroll').bounding_box()
    page.mouse.move(enemy_box['x'] + enemy_box['width'] / 2, enemy_box['y'] + enemy_box['height'] / 2)
    page.mouse.wheel(360, 0)
    page.wait_for_timeout(150)
    wheel = positions()
    assert wheel['enemy'] > slot_six['enemy']
    assert abs(wheel['enemy'] - wheel['player']) <= 1
    page.screenshot(path=str(out / 'desktop-mid-fight-aligned.png'), full_page=True)

    page.eval_on_selector('.side--enemy .board-scroll', '(node) => { node.scrollLeft = node.scrollWidth; }')
    page.wait_for_timeout(100)
    right = positions()
    assert abs(right['enemy'] - right['player']) <= 1
    assert page.locator('.lane-arrow--next:disabled').count() == 2
    page.screenshot(path=str(out / 'desktop-right-edge-disabled.png'), full_page=True)

    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate('mountOverflow()')
    page.eval_on_selector('.side--player .board-scroll', '(node) => { node.scrollLeft = 6 * 124; }')
    page.wait_for_timeout(100)
    mobile = positions()
    assert mobile['enemyFirst'] == mobile['playerFirst'] >= 6
    assert abs(mobile['enemy'] - mobile['player']) <= 1
    page.screenshot(path=str(out / 'mobile-390x844-aligned.png'), full_page=True)

    print('SLOT >=6', slot_six)
    print('ENEMY WHEEL', wheel)
    print('RIGHT EDGE', right)
    print('MOBILE', mobile)
    print('BROWSER ERRORS', errors)
    assert not errors

    page.goto('http://localhost:8324/tools/invariants.html')
    page.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')", timeout=60000)
    invariant_results = page.locator('#results').inner_text()
    print('REAL-BROWSER INVARIANTS\n' + invariant_results)
    assert page.title().startswith('INVARIANTS: PASS')
    browser.close()
