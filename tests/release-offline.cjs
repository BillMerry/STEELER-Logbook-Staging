const chromium=require('@playwright/test')[process.env.BROWSER_ENGINE || 'webkit'];
const http=require('node:http'),fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
let previous=true;
const server=http.createServer((req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  try {
    const body=previous ? cp.execFileSync('git',['show',`6b59c8d:${path}`],{stdio:['ignore','pipe','ignore']}) : fs.readFileSync(path);
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':path.endsWith('.json')?'application/json':'application/octet-stream');
    res.setHeader('Cache-Control','no-store');res.end(body);
  } catch {res.statusCode=404;res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(8766,'127.0.0.1',resolve));
 const browser=await chromium.launch(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {});
 try {
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:8766');
  await page.waitForFunction(()=>typeof APP_VERSION!=='undefined' && APP_VERSION==='1.3.6');
  // Local development deliberately disables automatic registration; install explicitly for this PWA test.
  const initialReload = page.waitForEvent('domcontentloaded');
  await page.evaluate(()=>navigator.serviceWorker.register('service-worker.js'));
  await initialReload;
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.active);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(()=>{
   passages=[{id:'release-check',plan:{date:'2026-09-01',origin:'Test origin',destination:'Test destination'},entries:[]}];savePassages();
  });
  previous=false;
  const upgradeReload = page.waitForEvent('domcontentloaded');
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();}).catch(()=>{});
  await upgradeReload;
  await page.waitForFunction(async()=> (await caches.keys()).includes('steeler-logbook-v1.4.0'));
  await page.reload();
  await page.waitForFunction(()=>APP_VERSION==='1.4.0');
  assert.equal(await page.evaluate(()=>passages[0].id),'release-check');
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(()=>APP_VERSION==='1.4.0');
  await page.evaluate(()=>{
   passages[0].entries.push({id:'offline-check',time:'2026-09-01T12:00',fuelUsed:'12',notes:'Saved offline',windDir:'SW',windBft:'0',seaState:'0'});
   passages[0].plan.dailySummaries=[{date:'2026-09-01',overnightOnBoard:true}];savePassages();
  });
  await page.reload();
  await page.waitForFunction(()=>typeof createDataBackupPayload==='function');
  assert.equal(await page.evaluate(()=>passages[0].entries[0].notes),'Saved offline');
  assert.equal(await page.evaluate(()=>passages[0].plan.dailySummaries[0].overnightOnBoard),true);
  assert.ok(await page.evaluate(()=>JSON.stringify(createDataBackupPayload()).includes('offline-check')));
  for (const id of ['homeTab','planTab','logTab','settingsTab']) await page.evaluate(id=>switchToTab(id),id);
  await context.setOffline(false);await page.reload();
  assert.equal(await page.evaluate(()=>passages[0].entries[0].id),'offline-check');
  assert.equal(await page.evaluate(()=>passages[0].entries[0].seaState),'0');
  assert.equal(await page.title(),'STEELER Logbook');
  console.log('PASS: 1.3.6 → 1.4.0 worker update, retained passage, offline reload/write/reload/backup, reconnect and live title');
 } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
