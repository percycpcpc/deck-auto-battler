from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path('refs/ui-audit/sequential-turns')
OUT.mkdir(parents=True, exist_ok=True)
URL = 'http://127.0.0.1:8321/'


def setup(page, populated=True, width=1920, height=1080):
    page.set_viewport_size({'width': width, 'height': height})
    page.add_init_script('globalThis.__DECK_BATTLER_NO_BOOT__ = true')
    page.goto(URL)
    page.evaluate(f"""async () => {{
      const e = await import('/src/engine.js');
      const ui = await import('/src/ui.js');
      const f = e.createFight({{ playerDeck: [], enemyDeck: [], fight: 1 }});
      if ({str(populated).lower()}) {{
        f.player.board.push(e.makeUnit(e.getCard('sellsword'), 'player', {{ uid: 'audit-player-1' }}));
        f.player.board.push(e.makeUnit(e.getCard('warlord'), 'player', {{ uid: 'audit-player-2' }}));
        f.enemy.board.push(e.makeUnit(e.getCard('road_ogre'), 'enemy', {{ uid: 'audit-enemy-1' }}));
        f.enemy.board.push(e.makeUnit(e.getCard('aegis_knight'), 'enemy', {{ uid: 'audit-enemy-2' }}));
      }}
      ui.mountBattleScreen(f);
      window.audit = {{ e, ui, f }};
    }}""")


def show_turn(page, side):
    page.evaluate("""async side => {
      await audit.ui.playEvents([{ round: 4, phase: 'action', type: 'turnStart', side, state: { ...audit.e.snapshotView(audit.f), round: 4, phase: 'action' } }]);
    }""", side)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)

    empty = browser.new_page()
    setup(empty, populated=False)
    empty.screenshot(path=str(OUT / 'touching-rows-empty-1920.png'), full_page=True)

    page = browser.new_page()
    setup(page)
    metrics = page.evaluate("""() => {
      const enemy = document.querySelector('.side--enemy .board-scroll').getBoundingClientRect();
      const player = document.querySelector('.side--player .board-scroll').getBoundingClientRect();
      const log = document.querySelector('.battle-log').getBoundingClientRect();
      return { enemyBottom: enemy.bottom, playerTop: player.top, gap: player.top - enemy.bottom, logHeight: log.height };
    }""")
    assert abs(metrics['gap']) < 0.1, metrics
    assert metrics['logHeight'] == 0, metrics
    page.screenshot(path=str(OUT / 'touching-rows-populated-1920.png'), full_page=True)

    show_turn(page, 'player')
    assert page.locator('.battle-phase').inner_text() == 'ROUND 4 · YOUR TURN'
    assert page.locator('.side--player.is-active-turn').count() == 1
    page.screenshot(path=str(OUT / 'your-turn-chip-glow-1920.png'), full_page=True)

    show_turn(page, 'enemy')
    assert page.locator('.battle-phase').inner_text() == 'ROUND 4 · ENEMY TURN'
    assert page.locator('.side--enemy.is-active-turn').count() == 1
    assert page.locator('.side--player.is-active-turn').count() == 0
    page.screenshot(path=str(OUT / 'enemy-turn-1920.png'), full_page=True)

    mobile = browser.new_page()
    setup(mobile, width=390, height=844)
    show_turn(mobile, 'player')
    mobile.screenshot(path=str(OUT / 'mobile-390.png'), full_page=True)

    short = browser.new_page()
    setup(short, width=1258, height=566)
    short.screenshot(path=str(OUT / 'short-1258x566.png'), full_page=True)
    assert short.locator('.side--enemy .board-scroll').evaluate("el => el.scrollWidth > 0")
    assert short.locator('.side--player .board-scroll').evaluate("el => el.scrollWidth > 0")

    invariants = browser.new_page()
    invariants.goto(URL + 'tools/invariants.html')
    invariants.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')", timeout=60000)
    assert invariants.title().startswith('INVARIANTS: PASS'), invariants.title()
    print(f"PASS real-browser sequential-turn audit; boundary gap={metrics['gap']:.0f}px; log track={metrics['logHeight']:.0f}px")
    print(invariants.title())
    browser.close()
