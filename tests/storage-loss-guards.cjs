const assert=require('node:assert/strict');
(async()=>{const browser=await require('./dom-harness.cjs').launch();try{
 const c=await browser.newContext(),p=await c.newPage();await p.goto('http://127.0.0.1:8765/');
 const failed=await p.evaluate(()=>{
  passages=[{id:'saved',plan:{date:'2026-09-01',from:'A',to:'B'},entries:[]}];savePassages();
  const before=storage.getItem(STORAGE_KEY),original=storage.setItem.bind(storage);
  storage.setItem=(k,v)=>{if(k===STORAGE_KEY)throw new DOMException('Quota','QuotaExceededError');original(k,v);};
  const result=restoreDataBackupObject({format:DATA_BACKUP_FORMAT,data:{passages:[{id:'imported',plan:{date:'2024-09-28'},entries:[]}]}},{skipConfirm:true,silent:true});
  const restored=passages[0].id,warning=!document.getElementById('storageWarning').hidden;
  storage.setItem=original;return {result,restored,warning,unchanged:before===storage.getItem(STORAGE_KEY)};
 });assert.deepEqual(failed,{result:false,restored:'saved',warning:true,unchanged:true});
 await p.reload();
 const blocked=await p.evaluate(()=>{
  storage.setItem(STORAGE_KEY,'damaged stored record');loadPassages();
  const saved=savePassages();let backupBlocked=false;try{createDataBackupPayload();}catch{backupBlocked=true;}
  return {saved,backupBlocked,raw:storage.getItem(STORAGE_KEY),warning:!document.getElementById('storageWarning').hidden};
 });assert.deepEqual(blocked,{saved:false,backupBlocked:true,raw:'damaged stored record',warning:true});
 const recovered=await p.evaluate(()=>restoreDataBackupObject({format:DATA_BACKUP_FORMAT,data:{passages:[{id:'explicit-recovery',plan:{date:'2026-09-01'},entries:[]}]}},{skipConfirm:true,silent:true}));assert.equal(recovered,true);
 const t=await c.newPage();await t.goto('http://127.0.0.1:8765/STEELER-Logbook-Staging/');
 const isolated=await t.evaluate(()=>{
  const live=JSON.stringify([{id:'live',plan:{date:'2026-09-01'},entries:[]}]);
  localStorage.setItem(STORAGE_KEY,live);localStorage.setItem(SYNC_CONFIG_KEY,JSON.stringify({autoSync:true}));
  localStorage.setItem(NARRATIVE_CONFIG_KEY,JSON.stringify({token:'live-private',url:'https://live.example'}));
  loadPassages();const loaded=passages.length;
  passages=[{id:'testbed',plan:{date:'2026-09-01'},entries:[]}];savePassages();
  return {loaded,liveUnchanged:localStorage.getItem(STORAGE_KEY)===live,testbed:JSON.parse(storage.getItem(STORAGE_KEY))[0].id,sync:storage.getItem(SYNC_CONFIG_KEY),ai:narrativeConfig()};
 });assert.deepEqual(isolated,{loaded:0,liveUnchanged:true,testbed:'testbed',sync:null,ai:{}});
 console.log('PASS: failed restores retain saved records and show persistent warning; unreadable data blocks writes/uploads until explicit restore; Testbed isolates records, sync and AI settings');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
