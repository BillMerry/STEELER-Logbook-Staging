const assert=require('node:assert/strict');
(async()=>{
 const {default:worker}=await import('../narrative-worker/src/index.js');
 const env={NARRATIVE_TOKEN:'test-token',OPENAI_API_KEY:'test-key',OPENAI_MODEL:'test-model'};
 const req=(token='test-token',payload={passage:{date:'2026-01-01',dailySummaries:[{notes:'Quiet evening.'}]}})=>new Request('https://example.invalid/v1/narrative',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(payload)});
 let calls=0;global.fetch=async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.match(body.instructions,/planningOnly/);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({narrative:'We had a quiet evening.',tags:['quiet evening']})}]}]});};
 assert.equal((await worker.fetch(req('wrong'),env)).status,401);assert.equal(calls,0);
 assert.equal((await worker.fetch(req(),{NARRATIVE_TOKEN:'test-token'})).status,503);assert.equal(calls,0);
 assert.equal((await worker.fetch(req('test-token',{}),env)).status,400);
 assert.equal((await worker.fetch(req('test-token',{passage:{notes:'x'.repeat(170000)}}),env)).status,413);
 const response=await worker.fetch(req(),env);assert.equal(response.status,200);assert.equal((await response.json()).narrative,'We had a quiet evening.');assert.equal(calls,1);
 global.fetch=async()=>Response.json({status:'incomplete',output:[]});assert.equal((await worker.fetch(req(),env)).status,502);
 global.fetch=async()=>Response.json({status:'completed',output:[]});assert.equal((await worker.fetch(req(),env)).status,502);
 global.fetch=async()=>{throw Error('network')};assert.equal((await worker.fetch(req(),env)).status,502);
 console.log('PASS: AI worker authorization, input bounds, server-only credentials, structured draft response and failure handling');
})().catch(e=>{console.error(e);process.exitCode=1;});
