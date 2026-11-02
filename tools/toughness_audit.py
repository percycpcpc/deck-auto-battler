from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8324/'
OUT = Path('refs/ui-audit/toughness')
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
      let developed = null;
      for (let seed = 1; seed <= 2000 && !developed; seed++) {
        let value = seed >>> 0;
        const rng = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
        const state = e.createFight({ fight: 1, playerDeck: e.shuffle(e.starterDeck(), rng), rng });
        while (!state.over && state.round < 30) {
          e.runRound(state);
          const player = state.player.board.filter(unit => !unit.dead).length;
          const enemy = state.enemy.board.filter(unit => !unit.dead).length;
          if (!state.over && state.round >= 10 && Math.max(player, enemy) >= 5) {
            developed = { state, seed, player, enemy };
            break;
          }
        }
      }
      if (!developed) throw new Error('No reproducible 5+ column fight state found');
      ui.mountBattleScreen(developed.state);
      document.querySelector('.enemy-preview--opening')?.classList.add('is-dismissed');
      window.toughnessAudit = { state: developed.state, ui };
      return { seed: developed.seed, round: developed.state.round, player: developed.player, enemy: developed.enemy };
    }""")
    live_cards = page.locator('.board-lane .card:not(.is-corpse)').count()
    assert max(evidence['player'], evidence['enemy']) >= 5
    assert live_cards >= 5
    page.screenshot(path=str(OUT / 'developed-board-desktop-1920x1080.png'), full_page=True)

    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate("""() => {
      toughnessAudit.ui.mountBattleScreen(toughnessAudit.state);
      document.querySelector('.enemy-preview--opening')?.classList.add('is-dismissed');
    }""")
    page.locator('.side--player .board-scroll').evaluate('node => { node.scrollLeft = 230; }')
    page.screenshot(path=str(OUT / 'developed-board-mobile-390x844.png'), full_page=True)

    page.goto(BASE + 'tools/invariants.html')
    page.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')", timeout=60000)
    print(page.locator('#results').inner_text())
    assert page.title().startswith('INVARIANTS: PASS')
    assert not errors, errors
    print(f"PASS real-browser toughness audit: seed={evidence['seed']} round={evidence['round']} player={evidence['player']} enemy={evidence['enemy']}; desktop/mobile screenshots; invariant harness PASS")
    browser.close()
