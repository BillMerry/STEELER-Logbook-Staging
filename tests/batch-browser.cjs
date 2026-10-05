const assert=require('node:assert/strict');
const engine=require('@playwright/test')[process.env.BROWSER_ENGINE||'chromium'];
(async()=>{
 const browser=await engine.launch(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:900}});await context.route('**/*',r=>r.request().url().startsWith((process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/'))?r.continue():r.abort());
  const page=await context.newPage(),errors=[],alerts=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(d.type()==='alert')alerts.push(d.message());await d.accept();});
  await page.goto((process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/'));
  await page.evaluate(()=>{passages=[{id:'trip',plan:{date:'2025-06-01',timeZone:'UTC',from:'A',to:'B',engineHoursStart:'100.1',dailySummaries:[]},finish:{engineHoursEnd:'102.3'},entries:[{id:'dock',time:'2025-06-01T12:00',leg:0,entryType:'dock',notes:'Alongside',groundLog:'20'}],captainsNarrative:{text:'My wording',status:'reviewed'},tags:[]}];currentPassageId='trip';savePassages();loadPassageIntoUI();createDataBackupPayload();resetPassageUndo();switchToTab('settingsTab');});
  await page.locator('#settingsDataBackupCard [data-settings-toggle]').click();
  const file={format:'steeler-enrichment-batch',version:1,batchId:'08',passages:[{id:'trip',date:'2025-06-01',from:'A',to:'B',narrative:'Incoming alternative',tags:['bay'],entries:[{sourceId:'book7-page1-row1',time:'2025-06-01T11:00',leg:0,notes:'Dolphins. Source: Book 7, Deck Log sample.pdf.',lat:'50.1',lon:'-1.3',groundLog:'10'}],possibleCorrections:['Possible end reading discrepancy; review separately.']}]};
  await page.locator('.enrichment-settings > summary').click();
  await page.locator('#enrichmentFile').setInputFiles({name:'batch-08.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
  assert.equal(await page.evaluate(()=>passages[0].entries.length),1);
  const choices=page.locator('#enrichmentPreview input[type=checkbox]');assert.equal(await choices.nth(0).isChecked(),false);assert.equal(await choices.nth(1).isChecked(),true);
  assert.match(await page.locator('#enrichmentPreview').textContent(),/Possible correction/);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Apply selected enrichment',exact:true}).click();await download;
  const imported=await page.evaluate(()=>({narrative:passages[0].captainsNarrative.text,entries:passages[0].entries,finish:passages[0].finish.engineHoursEnd,start:passages[0].plan.engineHoursStart}));
  assert.equal(imported.narrative,'My wording');assert.equal(imported.entries.length,2);assert.equal(imported.entries[1].notes,'Dolphins.');assert.equal(imported.entries[1].lat,'50.1');assert.equal(imported.finish,'102.3');assert.equal(imported.start,'100.1');assert.match(imported.entries[1].enrichment.originalNotes,/Book 7/);
  await page.locator('#undoPassageBtn').click();assert.equal(await page.evaluate(()=>activeLogEntries(passages[0]).length),1);
  await page.locator('#redoPassageBtn').click();assert.equal(await page.evaluate(()=>activeLogEntries(passages[0]).length),2);
  await page.evaluate(()=>{renderEnrichmentPreview(STEELER.enrichment.preview({format:'steeler-enrichment-batch',version:1,batchId:'09',passages:[{id:'trip',entries:[{sourceId:'second',time:'2025-06-01T11:30',leg:0,notes:'Sea calm'}]}]},passages));passages[0].entries[0].notes='An intervening edit';savePassages();});
  await page.getByRole('button',{name:'Apply selected enrichment',exact:true}).click();assert.match(alerts.pop(),/changed after preview/);assert.equal(await page.evaluate(()=>activeLogEntries(passages[0]).length),2);
  await page.locator('#settingsDataBackupCard [data-settings-toggle]').click();await page.locator('#settingsNarrativesCard [data-settings-toggle]').click();
  assert.equal(await page.evaluate(()=>narrativePreferences()),null);
  await page.locator('#saveNarrativePreferences').click();assert.match(await page.evaluate(()=>narrativePreferences().style),/paragraphs/);
  for(const width of [1024,390]){await page.setViewportSize({width,height:900});await page.locator('#narrativePref_style').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('.narrative-preferences').screenshot({path:`test-results/preferences-${width}.png`});}
  assert.deepEqual(alerts,[]);assert.deepEqual(errors,[]);console.log('PASS: batch file preview/apply/download, selective entry import, authoritative readings, source cleanup, undo/redo, stale preview protection and profile review UI');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
