// Run against a local Testbed server: TEST_URL=http://127.0.0.1:8765 node tests/usage-enhancements.cjs
const assert = require('node:assert/strict');
const chromium = process.env.DOM_TEST ? require('./dom-harness.cjs') : require('@playwright/test').chromium;
(async () => {
  const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {});
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:8765/') ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765');
  await page.waitForFunction(() => typeof renderPassageAnalytics === 'function');
  assert.equal(await page.evaluate(() => APP_VERSION), '1.3.5-rc2');
  const calculations = await page.evaluate(() => {
    const original = { waypoints: [{id:'w1',name:'Test',lat:50,lon:-1,time:'10:00',actualTime:'11:00',plannedSpeed:'8'}] };
    const cleaned = cloneDetailedPassagePlan(original, {resetActualTimes:true,regenerateIds:true});
    const fixture = (id, nm, hours, category = 'Cruise') => ({id,createdAt:'2026-08-01T08:00:00Z',plan:{date:'2026-08-01',from:'Hamble',to:'Cowes',categories:[category]},entries:[{id:id+'a',leg:0,time:'2026-08-01T08:00:00Z',notes:'Slipped lines'}, {id:id+'b',leg:0,time:`2026-08-01T${String(8+hours).padStart(2,'0')}:00:00Z`,notes:'Docked',groundLog:String(nm),fuelUsed:'10'}]});
    const a=fixture('a',10,1), b=fixture('b',60,3);
    const multi={...a,plan:{...a.plan,transitPorts:['Stop']},entries:[...a.entries,...b.entries.map(e=>({...e,leg:1}))]};
    const html=renderPassageCategorySummary([a,b],{dimension:'year',metrics:['averageSpeed']});
    const noFuel={...b,entries:b.entries.map(e=>({...e,fuelUsed:''}))};
    const economy=renderPassageCategorySummary([a,noFuel],{dimension:'all',metrics:['fuelPerNm']});
    return {economy,cleaned,original, multiSpeed:passageAverageSpeed(multi).speed, missingSpeed:passageAverageSpeed({...a,entries:[]}).speed, speed:passageAverageSpeed(a),html,empty:renderPassageCategorySummary([a],{dimension:'all',metrics:[]}),deleted:renderPassageCategorySummary([{...a,deleted:true}],{dimension:'all',metrics:['passages']})};
  });
  assert.equal(calculations.cleaned.waypoints[0].actualTime, '');
  assert.equal(calculations.cleaned.waypoints[0].time, '10:00');
  assert.equal(calculations.original.waypoints[0].actualTime, '11:00');
  assert.equal(calculations.speed.speed,10);
  assert.equal(calculations.multiSpeed,17.5);
  assert.equal(calculations.missingSpeed,null);
  assert.match(calculations.economy,/Fuel \(L\/NM\): 1.00/);
  assert.match(calculations.html,/Average speed \(kn\): 17.5/);
  assert.doesNotMatch(calculations.html,/Fuel \(L\):/);
  assert.match(calculations.empty,/Choose at least one/);
  assert.match(calculations.deleted,/No passages/);
  console.log('PASS: DPP ATA isolation, average speed, selected metrics and deleted-passage exclusion');
  await page.evaluate(() => {
    storage.setItem(PASSAGE_ANALYTICS_KEY, JSON.stringify({dimension:'month',metrics:['nm']}));
    renderPassageAnalytics();
  });
  assert.deepEqual(await page.evaluate(() => loadPassageAnalyticsView()), {dimension:'month',metrics:['nm']});
  await page.reload();
  assert.deepEqual(await page.evaluate(() => loadPassageAnalyticsView()), {dimension:'month',metrics:['nm']});
  console.log('PASS: analytics preference persistence');
  const coverage = await page.evaluate(() => {
    const a = {id:'p1',createdAt:'2026-01-02',plan:{date:'2026-01-02',from:'Origin',to:'Destination',categories:['Cruise','Family']},entries:[]};
    const b = {id:'p2',createdAt:'2025-12-02',plan:{date:'2025-12-02',from:'Other',to:'Destination',categories:['cruise']},entries:[]};
    const c = {id:'p3',createdAt:'2026-01-02',plan:{date:'2026-01-02',categories:['Deleted']},entries:[],deleted:true};
    passages=[a,b,c]; passages.forEach(ensureDetailedPassagePlans); currentPassageId='p1'; loadPassageIntoUI();
    planCategories.value='Cruise, Fa';
    planCategories.setSelectionRange(planCategories.value.length,planCategories.value.length);
    planCategories.dispatchEvent(new Event('input', {bubbles:true}));
    const box=document.getElementById('planCategoriesSuggest');
    const choices=[...box.querySelectorAll('button')];
    choices[0].click();
    const picked=planCategories.value;
    const hiddenAfterSelection=box.classList.contains('hidden');
    planCategories.value='New category';
    planCategories.setSelectionRange(planCategories.value.length,planCategories.value.length);
    planCategories.dispatchEvent(new Event('input',{bubbles:true}));
    const acceptsNew=planCategories.value==='New category' && box.classList.contains('hidden');
    return {picked,choiceCount:choices.length,hiddenAfterSelection,acceptsNew,groups:Object.fromEntries(Object.keys(ANALYTICS_DIMENSIONS).map(d=>[d,renderPassageCategorySummary([a,b,c],{dimension:d,metrics:['passages','nm']})]))};
  });
  assert.equal(coverage.choiceCount,1);
  assert.equal(coverage.picked,'Cruise, Family');
  assert.equal(coverage.hiddenAfterSelection,true);
  assert.equal(coverage.acceptsNew,true);
  assert.match(coverage.groups.year,/2025/); assert.match(coverage.groups.year,/2026/);
  assert.match(coverage.groups.month,/2026-01/);
  assert.match(coverage.groups.origin,/Origin/);
  assert.match(coverage.groups.destination,/Destination/);
  assert.match(coverage.groups.all,/Passages: 2/);
  assert.match(coverage.groups.all,/Distance \(NM\): –/);
  assert.doesNotMatch(coverage.groups.category,/Deleted/);
  console.log('PASS: category autocomplete, dimension grouping and missing readings');
  const integration = await page.evaluate(async () => {
    const source = {waypoints:[{id:'old',name:'Old waypoint',lat:50,lon:-1,time:'09:00',actualTime:'09:15'}]};
    const saved = saveDppTemplate('Regression plan', source);
    const loaded = getDppTemplateById(saved.id);
    const backup = JSON.parse(JSON.stringify(createDataBackupPayload()));
    const before = fullDataBackupPackageHash(backup);
    await applyFullDataCloudCopy({backup,record:{payload:{backup}}}, nowIso());
    const after = fullDataBackupPackageHash(createDataBackupPayload({flush:false}));
    return {ata:loaded.detailed.waypoints[0].actualTime,eta:loaded.detailed.waypoints[0].time,sourceAta:source.waypoints[0].actualTime,before,after};
  });
  assert.equal(integration.ata,'');
  assert.equal(integration.eta,'09:00');
  assert.equal(integration.sourceAta,'09:15');
  assert.equal(integration.before,integration.after,'full cloud restore preserves package hash');
  console.log('PASS: saved template storage and verified cloud backup round trip');
  if (!process.env.DOM_TEST) {
    for (const width of [1280, 1024, 768, 390]) {
      await page.setViewportSize({width,height:900});
      const layout=await page.evaluate(() => {
        switchToTab('homeTab'); refreshHomePassageList();
        const rows=[...document.querySelectorAll('.passage-card-summary')];
        return rows.map(row=>({tops:[...row.children].map(el=>Math.round(el.getBoundingClientRect().top)), fits:row.scrollWidth<=row.clientWidth+1,count:row.children.length}));
      });
      assert.ok(layout.length>0);
      for(const row of layout) { assert.equal(row.count,6); assert.equal(new Set(row.tops).size,1,`one metrics row at ${width}px`); assert.ok(row.fits,`metrics fit at ${width}px`); }
    }
    console.log('PASS: six Home metrics fit one row at desktop, tablet and phone widths');
  }

  // Exercise the real sync orchestrator with simulated cloud transport and copies.
  for (const scenario of [
    {name:'matched',local:'same',cloud:'same',lastLocal:'old',lastCloud:'old',expect:'matched'},
    {name:'cloud only',local:'base',cloud:'new',lastLocal:'base',lastCloud:'base',expect:'download'},
    {name:'local only',local:'new',cloud:'base',lastLocal:'base',lastCloud:'base',expect:'upload'},
    {name:'both changed',local:'local-new',cloud:'cloud-new',lastLocal:'base',lastCloud:'base',expect:'conflict'},
    {name:'no baseline',local:'local',cloud:'remote',lastLocal:'',lastCloud:'',expect:'defer'},
    {name:'split baseline mismatch',local:'local',cloud:'remote',lastLocal:'local',lastCloud:'remote',expect:'defer'},
    {name:'dialog opened during fetch',local:'base',cloud:'new',lastLocal:'base',lastCloud:'base',openDialog:true,expect:'defer'},
    {name:'first cloud',local:'local',cloud:null,lastLocal:'',lastCloud:'',expect:'defer'}
  ]) {
    const syncPage=await context.newPage();
    syncPage.on('pageerror',e=>errors.push(e.message));
    await syncPage.goto('http://127.0.0.1:8765');
    const result=await syncPage.evaluate(async scenario => {
      const actions=[];
      getSavedSyncConnection=()=>({});
      fetchCurrentFullDataCloudRecord=async()=>{if(scenario.openDialog)modalOverlay.classList.remove("hidden");return {record:scenario.cloud ? {} : null,backup:{}}};
      loadLocalSyncStatus=()=>({lastSyncedLocalPackageHash:scenario.lastLocal,lastSyncedCloudPackageHash:scenario.lastCloud});
      createDataBackupPayload=()=>({});
      fullDataBackupPackageHash=()=>scenario.local;
      describeFullDataCloudRecord=()=>({packageHash:scenario.cloud,revision:1});
      clearAllLocalSyncDirty=()=>{};
      renderLocalSyncStatus=()=>{};
      renderFullDataCloudPreview=()=>{};
      saveFullDataCloudStatus=()=>actions.push('matched');
      saveObservedFullDataCloudStatus=()=>{};
      saveLocalSyncStatus=s=>{if(s.status==='sync-error') actions.push('error:'+s.lastSyncError)};
      setSyncCheckMessage=()=>{};
      chooseFullSyncConflictAction=async()=>{actions.push('conflict');return 'cancel'};
      applyFullDataCloudCopy=async()=>{actions.push('download');return {}};
      uploadFullDataCloudCopy=async()=>{actions.push('upload');return {}};
      alert=()=>actions.push('unexpected alert');
      confirm=()=>{actions.push('unexpected confirm');return false};
      await runFullDataCloudSync({auto:true});
      return actions.length ? actions.join(',') : 'defer';
    },scenario);
    assert.equal(result,scenario.expect,scenario.name);
    await syncPage.close();
    console.log('PASS: auto-sync '+scenario.name);
  }
  assert.deepEqual(errors,[],'browser JavaScript errors');
  await browser.close();
})().catch(e => {console.error(e);process.exit(1)});
