const assert=require('node:assert/strict');
const chromium=require('@playwright/test')[process.env.BROWSER_ENGINE||'chromium'];
(async()=>{
 const browser=await chromium.launch(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:900}});const errors=[];let aiCalls=0;
  await context.route('**/*',async route=>{
    const url=route.request().url();
    if(url==='https://narrative.example/v1/narrative'){aiCalls++;const body=route.request().postDataJSON();assert.ok(body.passage.dailySummaries);assert.ok(body.passage.historicalSourceNotes.some(s=>s.transcription.includes("sample paper log")));assert.equal(body.preferences.style,'Use paragraphs and I/we.');return route.fulfill({contentType:'application/json',body:JSON.stringify({narrative:'We visited the river and enjoyed lunch with friends.',tags:['river','friends']})});}
    return url.startsWith((process.env.TEST_BASE_URL || 'http://127.0.0.1:8765/'))?route.continue():route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto((process.env.TEST_BASE_URL || 'http://127.0.0.1:8765'));
  await page.evaluate(()=>{
    passages=[{id:'sample',plan:{date:'2026-01-04',timeZone:'Europe/London',from:'Lymington',to:'Newtown Creek',dailySummaries:[{id:'day',date:'2026-01-04',notes:'Lunch with friends.\n\nDeck-log enrichment — Batch 01\nCaptain’s Narrative: We spent a quiet afternoon in the creek.\nSuggested tags: creek; friends.\nSource: sample paper log.'}]},entries:[{id:'start',time:'2026-01-04T10:00',entryType:'engine-start',engineHoursStart:'100.1'},{id:'stop',time:'2026-01-04T11:00',entryType:'shutdown',engineHoursEnd:'100.6'}],finish:{shutdownLogged:true,engineHoursEnd:'100.6'}}];
    currentPassageId='sample';savePassages();resetPassageUndo();loadPassageIntoUI();refreshHomePassageList();switchToTab('planTab');
    localStorage.setItem(NARRATIVE_PREFS_KEY,JSON.stringify({style:'Use paragraphs and I/we.'}));
    localStorage.setItem(NARRATIVE_CONFIG_KEY,JSON.stringify({url:'https://narrative.example',token:'test-access',offer:true}));
  });
  assert.equal(await page.locator('#captainsNarrative').inputValue(),'We spent a quiet afternoon in the creek.');
  await page.locator('#captainsNarrative').fill('My own account of our afternoon.');await page.locator('#narrativeReviewed').click();
  assert.equal(await page.locator('#narrativeStatus').textContent(),'Reviewed');
  await page.locator('#undoPassageBtn').click();assert.equal(await page.locator('#narrativeStatus').textContent(),'Draft for review');
  await page.locator('#undoPassageBtn').click();assert.equal(await page.locator('#captainsNarrative').inputValue(),'We spent a quiet afternoon in the creek.');
  await page.locator('#redoPassageBtn').click();assert.equal(await page.locator('#captainsNarrative').inputValue(),'My own account of our afternoon.');
  await page.locator('#narrativeGenerate').click();await page.locator('dialog textarea').waitFor();assert.equal(aiCalls,1);
  assert.equal(await page.evaluate(()=>passages[0].captainsNarrative.text),'My own account of our afternoon.');
  await page.getByRole('button',{name:'Use this draft',exact:true}).click();assert.match(await page.locator('#captainsNarrative').inputValue(),/visited the river/);
  await page.locator('#narrativeCard').screenshot({path:'test-results/narrative-editor.png'});
  await page.locator('.app-header').screenshot({path:'test-results/testbed-header.png'});
  await page.reload();assert.match(await page.evaluate(()=>passages[0].captainsNarrative.text),/visited the river/);
  await page.evaluate(()=>switchToTab('planTab'));await page.setViewportSize({width:390,height:844});await page.locator('#narrativeCard').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Phone horizontal overflow');
  assert.ok((await page.locator('#narrativeCard').boundingBox()).width>300,'Narrative card fills phone width');
  await page.locator('#narrativeCard').screenshot({path:'test-results/narrative-phone.png'});
  await context.setOffline(true);
  assert.match(await page.evaluate(()=>JSON.parse(storage.getItem(STORAGE_KEY))[0].captainsNarrative.text),/visited the river/);
  // Localhost intentionally does not register a SW; test offline persistence through localStorage,
  // not a false claim of offline page navigation here.
  assert.deepEqual(errors,[]);console.log('PASS: browser migration/editor, iPad-style Undo/Redo, guarded AI preview/apply, draft persistence and phone layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
