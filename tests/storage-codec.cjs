const assert=require('node:assert/strict');const codec=require('../js/storage-codec.js');
for(const text of ['',JSON.stringify({notes:'STEELER 🌊 café — 中文'.repeat(2000)}),JSON.stringify(Array.from({length:10000},(_,i)=>({id:i,notes:'At sea',reading:String(i/10)})))]){
 const encoded=codec.encode(text);assert.equal(codec.decode(encoded),text);if(text.length>4096){assert.ok(encoded.length<text.length);assert.throws(()=>codec.decode(encoded.slice(0,-12)));}
}
assert.equal(codec.decode('{"legacy":true}'),'{"legacy":true}');console.log('PASS: Unicode lossless compression, legacy reads and corrupt payload detection');
