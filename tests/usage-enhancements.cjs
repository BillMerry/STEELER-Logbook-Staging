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
  assert.equal(await page.evaluate(() => APP_VERSION), '1.3.5-rc7');
  assert.deepEqual(await page.evaluate(()=>['refillHistoryCard','overnightStatsCard','passageAnalyticsCard'].map(id=>document.getElementById(id).open)),[false,false,false]);
  const oob = await page.evaluate(async () => {
    const day = date => ({date, overnightOnBoard:true, fee:'',notes:''});
    const fixture = {id:'oob',plan:{date:'2026-03-27',dailySummaries:[...['2026-03-27','2026-03-28','2026-03-29','2026-03-30','2026-04-02','2026-04-03'].map(day),day('bad'),{date:'2026-04-01'}]},entries:[
      {id:'r1',time:'2026-03-27T10:00',refuel:{litres:100,tankFull:true}},
      {id:'r2',time:'2026-03-29T10:00',refuel:{litres:20,tankFull:false}},
      {id:'r3',time:'2026-04-02T10:00',refuel:{litres:100,tankFull:true}},
      {id:'deleted',deleted:true,time:'2026-03-28T10:00',refuel:{litres:100,tankFull:true}}
    ]};
    const duplicate = {id:'dup',plan:{dailySummaries:[day('2026-03-28')]},entries:[]};
    const deleted = {id:'gone',deleted:true,plan:{dailySummaries:[day('2026-03-31')]},entries:[]};
    const stats=computeOvernightStats([fixture,duplicate,deleted],'2026-04-03');
    const empty=computeOvernightStats([], '2026-04-03');
    renderDailySummaries(fixture);
    const loaded=document.querySelector('.ds-oob').checked;
    document.querySelector('.ds-oob').checked=false;
    const unchecked=readDailySummariesFromForm()[0].overnightOnBoard;
    document.querySelector('.ds-oob').checked=true;
    fixture.plan.dailySummaries=readDailySummariesFromForm();
    const read=fixture.plan.dailySummaries[0].overnightOnBoard;
    syncDailySummaryDatesWithPassageDate(fixture,'2026-03-27','2026-04-10');
    const retainedDate=fixture.plan.dailySummaries[0].date;
    passages=[fixture]; currentPassageId='oob'; ensureDetailedPassagePlans(fixture); loadPassageIntoUI();
    const backup=JSON.parse(JSON.stringify(createDataBackupPayload()));
    await applyFullDataCloudCopy({backup,record:{payload:{backup}}},nowIso());
    const restored=passages.find(p=>p.id==='oob').plan.dailySummaries[0].overnightOnBoard;
    const copied=clonePassagePlanForCopy(fixture.plan).dailySummaries[0].overnightOnBoard;
    return {stats,empty,loaded,unchecked,read,retainedDate,restored,copied};
  });
  assert.equal(oob.stats.total,5);
  assert.equal(oob.stats.longest,4);
  assert.equal(oob.stats.latest,1);
  assert.equal(oob.stats.latestDate,'2026-04-02');
  assert.equal(oob.stats.sinceRefuel,1);
  assert.equal(oob.stats.sinceFull,1);
  assert.deepEqual(oob.stats.intervals.map(r=>r.nights),[2,2]);
  assert.deepEqual(oob.stats.fullIntervals.map(r=>r.nights),[4]);
  assert.equal(oob.stats.invalidDates,1);
  assert.equal(oob.empty.total,0);
  assert.equal(oob.empty.sinceRefuel,null);
  assert.equal(oob.copied,false);
  assert.equal(oob.loaded,true);
  assert.equal(oob.unchecked,false);
  assert.equal(oob.read,true);
  assert.equal(oob.restored,true);
  assert.equal(oob.retainedDate,'2026-03-27');
  if (!process.env.DOM_TEST) {
    await page.evaluate(() => {
      const p=getCurrentPassage();
      renderDailySummaries({...p,plan:{...p.plan,dailySummaries:p.plan.dailySummaries.slice(0,2)}});
      switchToTab('planTab');
    });
    for (const width of [1024,390]) {
      await page.setViewportSize({width,height:900});
      const fits=await page.evaluate(() => {
        const row=document.querySelector('.daily-summary-row');
        const checkbox=row.querySelector('.ds-oob');
        return row.scrollWidth<=row.clientWidth+1 && checkbox.getBoundingClientRect().width>0 && getComputedStyle(checkbox.parentElement).display==='flex' && getComputedStyle(checkbox.parentElement).flexDirection==='row';
      });
      assert.ok(fits,`OOB Daily Summary fits at ${width}px`);
    }
    await page.setViewportSize({width:1024,height:900});
    await page.locator('#planDailySummaryCard').screenshot({path:'test-results/oob-daily.png'});
    await page.evaluate(() => { switchToTab('settingsTab'); document.getElementById('fuelManagementPanel').hidden=false; renderFuelManagementSettings(); });
    const disclosures=await page.evaluate(()=>{
      return ['refillHistoryCard','overnightStatsCard','passageAnalyticsCard'].map(id=>{
        const card=document.getElementById(id); card.open=false;
        const compact=card.getBoundingClientRect().height<100;
        card.querySelector('summary').click(); const opens=card.open;
        card.querySelector('summary').click(); return compact && opens && !card.open;
      });
    });
    assert.deepEqual(disclosures,[true,true,true]);
    await page.locator('#fuelManagementPanel').screenshot({path:'test-results/collapsed-analytics.png'});
    await page.evaluate(()=>document.getElementById('overnightStatsCard').open=true);
    await page.locator('#overnightStats').screenshot({path:'test-results/oob-stats.png'});
  }
  console.log('PASS: OOB dates, deduplication, DST streaks, partial/full refill intervals, deleted/future exclusion, form and backup persistence');
  const fuel = await page.evaluate(() => {
    const night=date=>({date,overnightOnBoard:true});
    const ref=(id,time,fuelUsed,litres,cost,tankFull,leg=0)=>({id,time,leg,fuelUsed,refuel:{litres,cost,tankFull}});
    const p={id:'fuel',plan:{date:'2026-01-01',timeZone:'UTC',dailySummaries:['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-08','2026-01-09'].map(night)},entries:[
      ref('r0','2026-01-01T10:00','0',100,100,true),
      {id:'u1',time:'2026-01-02T12:00',fuelUsed:'40'},
      ref('r1','2026-01-03T10:00','',60,72,false),
      ref('r2','2026-01-05T10:00','180',150,180,true),
      {id:'u2',time:'2026-01-05T13:00',fuelUsed:'200'},
      ref('r3','2026-01-06T10:00','0',20,0,true,1),
      ref('r4','2026-01-08T10:00','0',10,'',true,2),
      ref('r5','2026-01-09T10:00','',5,'',true,3)
    ]};
    p.entries[2].refuel.location='Lymington';
    p.entries[3].refuel.location='Cowes';
    const duplicate={id:'dup',plan:{dailySummaries:[night('2026-01-01')]},entries:[]};
    const deleted={...p,id:'deleted',deleted:true};
    const data=computeRefillHistory([p,duplicate,deleted],'2026-02-01');
    const result={rows:data.rows.map(r=>({id:r.entry.id,used:r.used,difference:r.difference,nights:r.nights,perNight:r.perNight,price:r.price})),cycles:data.cycles,price:data.price,perNight:data.perNight,totalFilled:data.sum('filled')};
    const cross={id:'cross',plan:{date:'2025-12-31',categories:['Cruise'],dailySummaries:[night('2025-12-31'),night('2026-01-01')]},entries:[]};
    result.month=renderPassageCategorySummary([cross],{dimension:'month',metrics:['nights']});
    result.all=renderPassageCategorySummary([cross,{...cross,id:'cross2'}],{dimension:'all',metrics:['nights']});
    result.runs=computeOvernightStats([p,duplicate,deleted],'2026-02-01').runs;
    const ambiguous={id:'amb',plan:{timeZone:'UTC'},entries:[{id:'before',time:'2026-01-01T09:00',fuelUsed:'10'},ref('a','2026-01-01T10:00','',10,10,true),ref('b','2026-01-02T10:00','30',30,30,true)]};
    result.ambiguous=computeRefillHistory([ambiguous],'2026-02-01').rows[1].used;
    ambiguous.entries[2].refuel.fuelUsedSincePrevious=999;
    result.manual=computeRefillHistory([ambiguous],'2026-02-01').rows[1].used;
    result.html=renderRefillHistory([p]);
    passages=[p,deleted];
    result.tank=computeFuelManagementStats({beforeTime:'2026-01-05T13:00:00Z'}).remaining;
    result.usage=computeFuelManagementStats({beforeTime:'2026-01-05T13:00:00Z'}).fuelUsed;
    renderFuelManagementSettings();
    result.chips=document.querySelectorAll('#fuelMgmtStats .st-metric-chip').length;
    result.openingHidden=document.getElementById('fuelOpeningBalance').hidden;
    result.noRefillNights=!document.getElementById('overnightStats').textContent.includes('refill');
    result.nightsOption=!!document.querySelector('[data-analytics-metric="nights"]');
    return result;
  });
  assert.equal(fuel.rows.length,6);
  assert.equal(fuel.rows[0].used,0);
  assert.deepEqual(fuel.rows.slice(1,4).map(r=>r.used),[null,180,20]);
  assert.deepEqual(fuel.rows.slice(1,4).map(r=>r.difference),[null,30,0]);
  assert.deepEqual(fuel.rows.slice(1,4).map(r=>r.nights),[null,4,0]);
  assert.equal(fuel.rows[3].price,0);
  assert.equal(fuel.rows[3].perNight,null);
  assert.equal(fuel.rows[4].price,null);
  assert.equal(fuel.rows[4].used,0);
  assert.equal(fuel.rows[5].used,0);
  assert.equal(fuel.totalFilled,345);
  assert.ok(Math.abs(fuel.price-352/330)<1e-9);
  assert.equal(fuel.perNight,7);
  assert.equal(fuel.cycles.length,4);
  assert.equal(fuel.cycles[0].filled,210);
  assert.equal(fuel.cycles[0].used,180);
  assert.equal(fuel.cycles[0].difference,30);
  assert.equal(fuel.cycles[0].perNight,7.5);
  assert.deepEqual(fuel.runs,[{from:'2026-01-01',to:'2026-01-04',nights:4},{from:'2026-01-08',to:'2026-01-09',nights:2}]);
  assert.match(fuel.month,/2025-12.*Nights on board: 1.*2026-01.*Nights on board: 1/);
  assert.match(fuel.all,/Nights on board: 2/);
  assert.equal(fuel.ambiguous,20);
  assert.equal(fuel.manual,20);
  assert.equal(fuel.tank,780);
  assert.equal(fuel.usage,20);
  assert.equal(fuel.chips,2);
  assert.equal(fuel.openingHidden,true);
  assert.equal(fuel.noRefillNights,true);
  assert.equal(fuel.nightsOption,true);
  assert.doesNotMatch(fuel.html,/<summary>Details/);
  assert.doesNotMatch(fuel.html,/<summary>Location/);
  assert.match(fuel.html,/class="refill-location"/);
  assert.equal(fuel.rows[1].price,1.2);
  assert.doesNotMatch(fuel.html,/Add a known full-to-full|Included in full refill on|colspan="5"/);
  assert.match(fuel.html,/Full-refill totals/);
  assert.match(fuel.html,/Average \/ full refill/);
  if (!process.env.DOM_TEST) {
    await page.evaluate(() => {switchToTab('settingsTab');document.getElementById('fuelManagementPanel').hidden=false;renderFuelManagementSettings();});
    await page.setViewportSize({width:1024,height:1500});
    await page.evaluate(()=>document.getElementById('refillHistoryCard').open=true);
    await page.locator('#refillHistory').screenshot({path:'test-results/refill-history.png'});
    await page.evaluate(()=>document.getElementById('overnightStatsCard').open=true);
    await page.locator('#overnightStats').screenshot({path:'test-results/overnight-runs.png'});
    await page.setViewportSize({width:390,height:900});
    const fits=await page.evaluate(()=>document.getElementById('refillHistory').getBoundingClientRect().width<=390);
    assert.ok(fits,'refill table scrolls inside phone layout');
    await page.setViewportSize({width:1024,height:768});
  }
  console.log('PASS: refill reconciliation, partial-fill cycle, weighted rates, missing/zero readings, legacy override isolation, tank continuity, ranked runs and dated OOB analytics');
  const fullCycles=await page.evaluate(()=>{
    const ref=(id,date,litres,cost,full,fuelUsed='')=>({id,time:date+'T10:00',fuelUsed,refuel:{litres,cost,tankFull:full}});
    const p={id:'cycle',plan:{timeZone:'UTC'},entries:[ref('f1','2026-01-01',100,100,true,'0'),ref('p1','2026-01-02',60,60,false),ref('p2','2026-01-03',40,40,false),ref('f2','2026-01-05',150,150,true,'180'),ref('pending','2026-01-07',20,20,false)]};
    p.entries[3].refuel.fuelUsedSincePrevious=80;
    const data=computeRefillHistory([p]);
    const row=data.rows[3];
    const result={used:row.used,filled:row.filled,difference:row.difference,total:data.sum('filled'),pending:data.pending.length,partials:data.rows.filter(r=>!r.full).map(r=>r.used)};
    p.entries[3].refuel.fuelUsedSinceFull=190;
    result.override=computeRefillHistory([p]).rows[3].used;
    p.entries[1].deleted=true;
    result.afterDeletion=computeRefillHistory([p]).rows[2].filled;
    return result;
  });
  assert.deepEqual(fullCycles,{used:180,filled:250,difference:70,total:350,pending:1,partials:[null,null,null],override:180,afterDeletion:190});
  console.log('PASS: multiple partials need no readings, full cycles avoid double counting, pending partials and legacy overrides stay separate');
  const counterAgreement=await page.evaluate(()=>{
    const entries=[
      {id:'f0',time:'2026-02-01T10:00',fuelUsed:'0',refuel:{litres:100,tankFull:true}},
      {id:'u0',time:'2026-02-02T10:00',fuelUsed:'40'},
      {id:'p0',time:'2026-02-03T10:00',refuel:{litres:60,cost:72,tankFull:false}},
      {id:'u1',time:'2026-02-04T10:00',fuelUsed:'180'},
      {id:'f1',time:'2026-02-05T10:00',refuel:{litres:150,cost:180,tankFull:true}},
      {id:'u2',time:'2026-02-06T10:00',fuelUsed:'200'}
    ];
    const p={id:'agreement',plan:{timeZone:'UTC'},entries};
    const counter=n=>computeFuelManagementStats({sourcePassages:[{...p,entries:entries.slice(0,n)}]}).fuelUsed;
    const row=computeRefillHistory([p]).rows[2];
    return {beforePartial:counter(2),afterPartial:counter(3),beforeFull:counter(4),atFull:row.used,afterFull:counter(5),later:counter(6),filled:row.filled,difference:row.difference};
  });
  assert.deepEqual(counterAgreement,{beforePartial:40,afterPartial:40,beforeFull:180,atFull:180,afterFull:0,later:20,filled:210,difference:30});
  console.log('PASS: history matches displayed counter at full refill without its own reading; partial preserves counter and full resets it');
  const refillForm = await page.evaluate(async () => {
    const p=passages[0];
    currentPassageId=p.id;
    ensureDetailedPassagePlans(p); loadPassageIntoUI();
    const entry={id:'new-refill',time:'2026-01-11T10:00',leg:4,refuel:{litres:20,cost:0,fuelUsedSinceFull:0,tankFull:true,location:'Cowes'}};
    const pending=openManualEntryDialog(entry,{isNew:true,passage:p});
    const zeroShown=document.getElementById('dlgRefuelCost').value==='0' && document.getElementById('dlgRefuelUsed')===null;
    document.getElementById('dlgRefuelLocation').value='Lymington Fuel';
    modalOkBtn.click();
    await pending;
    p.entries.push(entry);
    const backup=JSON.parse(JSON.stringify(createDataBackupPayload()));
    await applyFullDataCloudCopy({backup,record:{payload:{backup}}},nowIso());
    const restored=passages[0].entries.find(e=>e.id==='new-refill').refuel;
    return {zeroShown,location:restored.location,used:restored.fuelUsedSinceFull,cost:restored.cost,price:restored.costPerLitre};
  });
  assert.deepEqual(refillForm,{zeroShown:true,location:'Lymington Fuel',used:0,cost:0,price:0});
  console.log('PASS: refill form retains zero cost, saves location, preserves legacy data and survives verified backup restore');
  const baseline = await page.evaluate(() => {
    const saved=loadFuelManagementSettings();
    saveFuelManagementSettings({tankCapacity:800,resetLevel:500,resetAt:'2026-01-02T00:00:00Z'});
    passages=[{id:'partial',plan:{date:'2026-01-01',timeZone:'UTC'},entries:[
      {id:'before',time:'2026-01-01T10:00',fuelUsed:'100'},
      {id:'after',time:'2026-01-02T10:00',fuelUsed:'120',refuel:{litres:50,cost:50,tankFull:false,tankRemaining:790}}
    ]}];
    const stats=computeFuelManagementStats();
    renderFuelManagementSettings();
    const openingVisible=!document.getElementById('fuelOpeningBalance').hidden;
    saveFuelManagementSettings(saved,{preserveResetAt:true});
    return {remaining:stats.remaining,used:stats.fuelUsed,openingVisible};
  });
  assert.deepEqual(baseline,{remaining:530,used:20,openingVisible:true});

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
