from pathlib import Path
from playwright.sync_api import sync_playwright
out=Path('refs/ui-audit/war-ledger'); out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome',headless=True)
 page=b.new_page(viewport={'width':1920,'height':1080})
 errors=[];warnings=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('console',lambda message:warnings.append(message.text) if message.type=='warning' else None)
 page.add_init_script('globalThis.__DECK_BATTLER_NO_BOOT__=true')
 page.goto('http://localhost:8323/')
 page.evaluate("""async () => { window.ui=await import('/src/ui.js'); window.e=await import('/src/engine.js'); window.mount=(kind='empty')=> { window.f=e.createFight({fight:kind==='boss'?2:1}); if(kind!=='empty') { f.player.charger={card:e.getCard('road_ogre'),counter:2}; f.enemy.charger={card:e.getCard('colossus'),counter:3}; } if(['board','boss','low','overflow'].includes(kind)) { for(const side of ['player','enemy']) for(const id of ['sellsword','aegis_knight','venom_hound','warlord','twinfang']) f[side].board.push(e.makeUnit(e.getCard(id),side)); } if(kind==='low') f.player.hp=7; ui.mountBattleScreen(f); }; mount(); }""")
 for w,h in [(1920,1080),(1258,566),(1024,768),(768,1024),(390,844),(390,560),(320,568)]:
  page.set_viewport_size({'width':w,'height':h})
  for state in (['empty','chargers','board','boss','low'] if w==1920 else ['board']):
   page.evaluate('(kind)=>mount(kind)',state)
   page.wait_for_timeout(300)
   page.screenshot(path=str(out/f'wl-{w}x{h}-{state}.png'),full_page=True)
 print(page.evaluate("({errors:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src), width:document.documentElement.scrollWidth})"))
 # Deployment past the fifth slot, with an already scrolled lane.
 page.set_viewport_size({'width':1920,'height':1080})
 page.evaluate("mount('board')")
 result=page.evaluate(r"""async()=>{const scroll=document.querySelector('.side--player .board-scroll');scroll.scrollLeft=180;const u=e.makeUnit(e.getCard('road_ogre'),'player');f.player.board.push(u);f.player.charger=null;let measured;const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.matches('.card-ghost')) {const lane=document.querySelector('.side--player .board-lane').getBoundingClientRect(); const end=frames.at(-1).transform;measured={scroll:scroll.scrollLeft,expected:lane.left+5*240,start:parseFloat(this.style.left),end};}return original.call(this,frames,options)};await ui.playEvents([{type:'deploy',side:'player',uid:u.uid,unit:u.name,phase:'deploy',round:1,state:e.snapshotView(f)}]);Element.prototype.animate=original;const rect=ui.getUnitEl(u.uid).getBoundingClientRect();const dx=Number(measured.end.match(/translate3d\(([-.0-9]+)px/)[1]);return {...measured,actual:rect.left,flightEnd:measured.start+dx,identity:ui.getUnitEl(u.uid)===document.querySelector(`[data-uid="${u.uid}"]`)};}""")
 print('SCROLLED DEPLOY',result)
 assert abs(result['expected']-result['actual'])<1 and abs(result['flightEnd']-result['actual'])<1 and result['scroll']>0
 page.screenshot(path=str(out/'wl-1920x1080-overflow-six.png'),full_page=True)
 geometry=page.evaluate("({w:document.querySelector('.card').getBoundingClientRect().width,pitch:parseFloat(getComputedStyle(document.querySelector('#battle-screen')).getPropertyValue('--slot-w'))+parseFloat(getComputedStyle(document.querySelector('#battle-screen')).getPropertyValue('--slot-gap'))})")
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate("document.querySelector('.card').getBoundingClientRect().width")==geometry['w']
 page.screenshot(path=str(out/'wl-390x844-desktop-resize.png'),full_page=True)
 print('FROZEN RESIZE PASS',geometry)
 page.set_viewport_size({'width':1920,'height':1080})
 # Actual engine mutual exchange; pause in the first death animation for evidence.
 page.evaluate("""()=>{f=e.createFight({playerDeck:[],enemyDeck:[]});for(const side of ['player','enemy']) f[side].board.push(e.makeUnit(e.getCard('sellsword'),side));ui.mountBattleScreen(f);e.exchange(f,'player',f.player.board[0],f.enemy.board[0]);window.trade=ui.playEvents(f.events)}""")
 page.wait_for_selector('.fx-death');page.screenshot(path=str(out/'wl-1920x1080-mutual-trade.png'),full_page=True);page.evaluate('trade')
 page.screenshot(path=str(out/'wl-1920x1080-deck-out.png'),full_page=True)
 # Scout through actual engine events; freeze screenshot only, not the reveal timer.
 page.evaluate("""()=>{f=e.createFight({playerDeck:[e.getCard('scout'),e.getCard('sellsword')],enemyDeck:[e.getCard('colossus')]});ui.mountBattleScreen(f)}""")
 page.evaluate("async()=>{e.runRound(f);await ui.playEvents(f.events)}")
 page.evaluate("()=>{e.runRound(f);window.scouting=ui.playEvents(f.events)}")
 page.wait_for_selector('.is-scout-revealed');page.screenshot(path=str(out/'wl-1920x1080-scout.png'),full_page=True);page.evaluate('scouting')
 page.wait_for_timeout(1550)
 assert page.locator('.is-scout-revealed').count()==0
 print('SCOUT EXPIRY PASS')
 # No-op reconciliation and stable identity; no src/HTML changes are covered by harness below.
 page.evaluate("mount('board')")
 noop=page.evaluate("""async()=>{let changes=0;const observer=new MutationObserver(r=>changes+=r.length);observer.observe(document.querySelector('#battle-screen'),{subtree:true,attributes:true,childList:true,characterData:true});ui.reconcile(e.snapshotView(f));await Promise.resolve();observer.disconnect();return changes}""")
 print('NO-OP RECONCILE mutations',noop);assert noop==0
 assert page.locator('.side--enemy .charger-slot .cost-dot').count()==1
 page.locator('.side--player .card').first.click()
 assert page.locator('.battle-detail').is_visible()
 page.locator('.side--player .card').first.click()
 assert not page.locator('.battle-detail').is_visible()
 page.locator('.log-toggle').click();assert page.locator('.log-toggle').get_attribute('aria-expanded')=='true'
 page.keyboard.press('Escape');assert page.locator('.log-toggle').get_attribute('aria-expanded')=='false'
 print('INSPECTION / LOG / SINGLE COST DOT PASS')
 page.evaluate("""()=>{f.player.hp=0;f.player.charger.counter=0;ui.reconcile(e.snapshotView(f))}""")
 assert page.locator('.side--player .hero-hp__text').inner_text()=='0 / 40'
 assert page.locator('.side--player .charger-label').inner_text()=='READY'
 page.screenshot(path=str(out/'wl-1920x1080-zero-ready.png'),full_page=True)
 page.evaluate("""()=>{while(f.player.board.length<20)f.player.board.push(e.makeUnit(e.getCard('sellsword'),'player'));ui.reconcile(e.snapshotView(f))}""")
 assert page.locator('.side--player .charger-label').inner_text()=='WAITING'
 print('ZERO HP / READY / WAITING PASS')
 # 200% CSS zoom is equivalent layout sizing here; preserve the desktop-mounted geometry.
 page.evaluate("mount('board');document.documentElement.style.zoom='2'")
 page.screenshot(path=str(out/'wl-1920x1080-zoom200.png'),full_page=True)
 page.evaluate("document.documentElement.style.zoom=''")
 # Real Chrome reduced-motion run of the original six invariant checks.
 page.emulate_media(reduced_motion='reduce')
 page.goto('http://localhost:8323/tools/invariants.html')
 page.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')",timeout=60000)
 print('REDUCED MOTION\n'+page.locator('#results').inner_text())
 page.screenshot(path=str(out/'wl-1920x1080-reduced-motion.png'),full_page=True)
 assert page.title().startswith('INVARIANTS: PASS')
 page.emulate_media(reduced_motion='no-preference')
 page.reload()
 page.wait_for_function("document.title.startsWith('INVARIANTS: PASS') || document.title.startsWith('INVARIANTS: FAIL')",timeout=60000)
 print('NORMAL MOTION\n'+page.locator('#results').inner_text())
 assert page.title().startswith('INVARIANTS: PASS')
 print('BROWSER ERRORS',errors,'WARNINGS',warnings);assert not errors and not any('fallback' in w for w in warnings)
 b.close()
