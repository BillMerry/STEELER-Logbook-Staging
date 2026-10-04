const assert=require('node:assert/strict');
const browserType=require('@playwright/test')[process.env.BROWSER_ENGINE||'chromium'];
(async()=>{
 const browser=await browserType.launch(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:900}});
  await context.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:8765/')?r.continue():r.abort());
  const page=await context.newPage();const errors=[],alerts=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(d.type()==='alert')alerts.push(d.message());await d.accept();});
  await page.goto('http://127.0.0.1:8765/');
  await page.evaluate(()=>{
   const entry=(id,leg,time,type,notes)=>({id,leg,time:'2026-01-04T'+time,entryType:type,notes});
   passages=[{id:'trip',plan:{date:'2026-01-04',timeZone:'UTC',from:'Lymington',to:'Cowes',transitPorts:[{name:'Yarmouth'}],crew:'Bill',dailySummaries:[{id:'day',date:'2026-01-04',notes:'A peaceful stop.',fee:'',overnightOnBoard:false}]},entries:[entry('slip0',0,'09:00','slip','Slipped lines'),entry('dock0',0,'10:00','dock','Alongside'),entry('shutdown0',0,'10:05','shutdown','Shutdown'),entry('slip1',1,'11:00','slip','Slipped lines'),entry('dock1',1,'12:30','dock','Alongside')],captainsNarrative:{text:'We enjoyed the trip.',status:'reviewed'},tags:['Solent']},{id:'other',plan:{date:'2026-01-03',from:'A',to:'B',dailySummaries:[]},entries:[]}];
   knownPorts=['Lymington','Yarmouth','Cowes'].map((name,i)=>({id:'port'+i,name,lat:50.7,lon:-1.3}));currentPassageId='trip';savePassages();loadPassageIntoUI();savePassages();resetPassageUndo();switchToTab('logTab');
  });
  // Exercise the real entry edit dialog, then background sync bookkeeping.
  await page.locator('[data-log-entry-id="slip1"] .log-time-cell').click();
  await page.locator('#spNotes').fill('Slipped lines — sunny morning');await page.locator('#modalOkBtn').click();
  await page.evaluate(()=>clearAllLocalSyncDirty());
  await page.locator('#undoPassageBtn').click();
  assert.equal(await page.evaluate(()=>getCurrentPassage().entries.find(e=>e.id==='slip1').notes),'Slipped lines');
  await page.locator('#redoPassageBtn').click();
  assert.match(await page.evaluate(()=>getCurrentPassage().entries.find(e=>e.id==='slip1').notes),/sunny morning/);
  // Real delete handler and touch/button undo/redo.
  await page.evaluate(()=>deleteLogEntryById('slip1'));
  assert.equal(await page.locator('[data-log-entry-id="slip1"]').count(),0);
  await page.locator('#undoPassageBtn').click();assert.equal(await page.locator('[data-log-entry-id="slip1"]').count(),1);
  await page.locator('#redoPassageBtn').click();assert.equal(await page.locator('[data-log-entry-id="slip1"]').count(),0);
  await page.locator('#undoPassageBtn').click();
  await page.evaluate(()=>{switchToTab('planTab');resetPassageUndo();});
  const originalCrew=await page.locator('#planCrew').inputValue();
  await page.locator('#planCrew').fill('Bill and friends');await page.locator('.plan-save-btn').first().click();await page.locator('#logTab.active').waitFor();
  await page.evaluate(()=>clearAllLocalSyncDirty());
  await page.locator('#undoPassageBtn').click();assert.equal(await page.locator('#planCrew').inputValue(),originalCrew);
  await page.locator('#redoPassageBtn').click();assert.equal(await page.locator('#planCrew').inputValue(),'Bill and friends');
  await page.evaluate(()=>deletePassageById('trip'));
  assert.equal(await page.evaluate(()=>activePassages().some(p=>p.id==='trip')),false);
  await page.locator('#undoPassageBtn').click();assert.equal(await page.evaluate(()=>currentPassageId),'trip');
  assert.equal(await page.locator('#planCrew').inputValue(),'Bill and friends');
  await page.locator('#redoPassageBtn').click();assert.equal(await page.evaluate(()=>activePassages().some(p=>p.id==='trip')),false);
  await page.locator('#undoPassageBtn').click();
  // A second undo must undo the preceding actual edit, not sync metadata.
  await page.locator('#undoPassageBtn').click();assert.equal(await page.locator('#planCrew').inputValue(),originalCrew);
  await page.locator('#redoPassageBtn').click();
  await page.locator('#undoPassageBtn').focus();await page.keyboard.press('Meta+z');assert.equal(await page.locator('#planCrew').inputValue(),originalCrew);
  await page.keyboard.press('Meta+Shift+z');assert.equal(await page.locator('#planCrew').inputValue(),'Bill and friends');
  await page.evaluate(()=>switchToTab('planTab'));
  const cardOrder=await page.locator('.plan-card-grid > section').evaluateAll(els=>els.map(e=>({id:e.id,y:e.getBoundingClientRect().top,x:e.getBoundingClientRect().left})).sort((a,b)=>a.y-b.y||a.x-b.x).map(e=>e.id));
  assert.deepEqual(cardOrder,['planOverviewCard','planCrewCard','planRouteCard','planningSummaryCard','planTidesCard','planEnvironmentCard','planDailySummaryCard','narrativeCard']);
  const dateCard=await page.locator('#planOverviewCard').boundingBox(),crewCard=await page.locator('#planCrewCard').boundingBox();assert.ok(Math.abs(dateCard.y-crewCard.y)<2);
  await page.locator('.plan-card-grid').screenshot({path:'test-results/plan-order-rc2.png'});
  await page.evaluate(()=>switchToTab('logTab'));
  await page.locator('#logStatusStrip').screenshot({path:'test-results/log-status-rc2.png'});
  const status=await page.locator('#logStatusStrip').textContent();assert.match(status,/Current Passage/);assert.doesNotMatch(status,/Passage \/ Leg/);
  assert.match(status,/Lymington → Yarmouth/);assert.match(status,/Yarmouth → Cowes/);
  assert.equal(await page.locator('.log-route-legs strong').textContent(),'Yarmouth → Cowes');
  assert.match(status,/Total: 2h 30m/);assert.match(status,/Leg: 1h 30m/);assert.match(status,/Total: 5/);assert.match(status,/Leg: 2/);
  const titles=await page.locator('#planSummaryPanel .section-title').allTextContents();assert.ok(titles.indexOf('DAILY SUMMARY')<titles.findIndex(s=>s.includes('CAPTAIN’S NARRATIVE')));
  assert.equal(await page.locator('.testbed-label').count(),0);
  for(const width of [1024,768,390]){
   await page.setViewportSize({width,height:900});
   const layout=await page.evaluate(()=>{const logo=document.querySelector('.app-header-logo').getBoundingClientRect(),undo=document.querySelector('.undo-actions').getBoundingClientRect();return{fits:document.documentElement.scrollWidth<=innerWidth+1,logoFirst:logo.width>0&&logo.left<undo.left};});
   assert.ok(layout.fits,`No overflow at ${width}`);assert.ok(layout.logoFirst);
   await page.locator('.app-header').screenshot({path:`test-results/header-rc2-${width}.png`});
  }
  assert.deepEqual(alerts,[]);assert.deepEqual(errors,[]);
  console.log('PASS: actual log edit/delete, passage edit/delete, repeated Undo/Redo after sync bookkeeping, restored selection, card order, multi-leg totals and Safari responsive header');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
