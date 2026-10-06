const assert = require('node:assert/strict');
(async()=>{
 const browser=await require('@playwright/test')[process.env.BROWSER_ENGINE||'webkit'].launch();
 try {
  const context=await browser.newContext({viewport:{width:1024,height:900}});
  await context.route('**/*',r=>r.request().url().startsWith((process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/'))?r.continue():r.abort());
  const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto((process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/'));
  await page.evaluate(()=>{passages=[{id:'weather',plan:{date:'2026-10-05',timeZone:'Europe/London',from:'Lymington',to:'Cowes',dailySummaries:[]},entries:[{id:'observation',time:'2026-10-05T12:00',leg:0,notes:'Passing the mark.',waterLog:'2.5',groundLog:'3.0'}]}];currentPassageId='weather';savePassages();loadPassageIntoUI();resetPassageUndo();switchToTab('logTab');});
  const open=()=>page.evaluate(()=>{void openManualEntryDialog(getCurrentPassage().entries[0],{passage:getCurrentPassage()});});
  await open();assert.equal(await page.locator('#dlgWindBft').inputValue(),'');assert.equal(await page.locator('#dlgSeaState option').count(),11);
  await page.locator('#dlgWindDir').selectOption('SW');await page.locator('#dlgWindBft').fill('4');await page.locator('#dlgSeaState').selectOption('3');
  for(const width of [1024,768,390]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('#dlgSeaState').evaluate(el=>el.getBoundingClientRect().right<=innerWidth));await page.screenshot({path:`test-results/entry-weather-${width}.png`});}
  await page.locator('#modalOkBtn').click();
  assert.match(await page.locator('[data-log-entry-id="observation"]').textContent(),/Wind SW F4.*Sea 3 — Slight/s);
  assert.equal(await page.evaluate(()=>getCurrentPassage().entries[0].groundLog),'3.0');
  await page.locator('#undoPassageBtn').click();assert.equal(await page.evaluate(()=>getCurrentPassage().entries[0].windBft),undefined);
  await page.locator('#redoPassageBtn').click();await open();assert.equal(await page.locator('#dlgWindBft').inputValue(),'4');
  await page.locator('#dlgWindBft').fill('13');await page.locator('#modalOkBtn').click();assert.equal(await page.locator('#dlgWindBft').count(),1);
  await page.locator('#dlgWindBft').fill('0');await page.locator('#dlgSeaState').selectOption('0');await page.locator('#modalOkBtn').click();await page.reload();
  await open();assert.equal(await page.locator('#dlgWindBft').inputValue(),'0');assert.equal(await page.locator('#dlgSeaState').inputValue(),'0');
  await page.locator('#dlgWindBft').fill('');await page.locator('#dlgWindDir').selectOption('');await page.locator('#dlgSeaState').selectOption('');await page.locator('#modalOkBtn').click();assert.equal(await page.evaluate(()=>logEntryConditions(getCurrentPassage().entries[0])),'');
  assert.deepEqual(errors,[]);console.log('PASS: weather entry save/edit, validation, calm zero, clearing, reload, undo/redo and responsive WebKit layout');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
