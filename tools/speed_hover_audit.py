from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('refs/ui-audit/speed-hover')
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:8321/'


def setup(page, width=1920, height=1080):
    page.set_viewport_size({'width': width, 'height': height})
    page.add_init_script('globalThis.__DECK_BATTLER_NO_BOOT__ = true')
    page.goto(URL)
    page.evaluate("""async () => {
      const e = await import('/src/engine.js');
      const ui = await import('/src/ui.js');
      const f = e.createFight({ fight: 1 });
      f.player.board.push(e.makeUnit(e.getCard('squire'), 'player', { uid: 'audit-player' }));
      f.enemy.board.push(e.makeUnit(e.getCard('warlord'), 'enemy', { uid: 'audit-enemy' }));
      ui.mountBattleScreen(f);
      window.audit = { e, ui, f };
    }""")


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page()
    setup(page)
    page.screenshot(path=str(OUT / 'speed-control-1920.png'), full_page=True)

    page.evaluate("""() => {
      audit.ui.playEvents([{ round: 1, phase: 'cleanup', type: 'cleanup', state: audit.e.snapshotView(audit.f) }]);
    }""")
    page.wait_for_selector('.turn-banner:not([hidden])')
    page.screenshot(path=str(OUT / 'banner-1920.png'), full_page=True)
    page.wait_for_function("document.querySelector('.turn-banner').hidden")

    own = page.locator('[data-uid="audit-player"]')
    own.hover()
    page.wait_for_selector('.card-hover-tip:not([hidden])')
    assert page.locator('.card-hover-tip__name').inner_text() == 'Squire'
    page.screenshot(path=str(OUT / 'tooltip-own-1920.png'), full_page=True)

    page.mouse.move(10, 10)
    enemy = page.locator('[data-uid="audit-enemy"]')
    enemy.hover()
    page.wait_for_selector('.card-hover-tip:not([hidden])')
    assert page.locator('.card-hover-tip__name').inner_text() == 'Warlord'
    page.screenshot(path=str(OUT / 'tooltip-enemy-public-1920.png'), full_page=True)

    hidden_zones = page.locator('.side--enemy .deck-stack, .side--enemy .charger-slot')
    for i in range(hidden_zones.count()):
        hidden_zones.nth(i).hover()
        page.wait_for_timeout(250)
        assert page.locator('.card-hover-tip:not([hidden])').count() == 0

    mobile = browser.new_page()
    setup(mobile, 390, 844)
    mobile.screenshot(path=str(OUT / 'speed-control-390.png'), full_page=True)
    mobile.evaluate("""() => {
      audit.ui.playEvents([{ round: 1, phase: 'cleanup', type: 'cleanup', state: audit.e.snapshotView(audit.f) }]);
    }""")
    mobile.wait_for_selector('.turn-banner:not([hidden])')
    mobile.screenshot(path=str(OUT / 'banner-mobile-390.png'), full_page=True)

    timing = browser.new_page()
    setup(timing)
    result = timing.evaluate("""async () => {
      audit.ui.setPlaybackSpeed(10);
      const start = performance.now();
      for (let round = 1; round <= 10; round++) {
        await audit.ui.playEvents([{ round, phase: 'cleanup', type: 'cleanup', state: { ...audit.e.snapshotView(audit.f), round } }]);
      }
      return performance.now() - start;
    }""")
    print(f'PASS real-browser speed/hover/banner audit; 10-round sequential playback at 10x: {result:.0f}ms')

    invariants = browser.new_page()
    invariants.goto(URL)
    invariants.evaluate("localStorage.setItem('dab_speed', '2')")
    invariants.goto(URL + 'tools/invariants.html')
    invariants.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')", timeout=60000)
    print(invariants.title())
    browser.close()
