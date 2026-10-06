// Local storage only: cloud packages and downloaded backups remain plain JSON.
(function(root){
  const prefix='STEELER-LZ1:';
  const lz=typeof module!=='undefined'&&module.exports?require('./vendor/lz-string.js'):root.LZString;
  function checksum(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
  function encode(value){
    const text=String(value);
    if(text.length<4096)return text;
    const compressed=prefix+text.length+':'+checksum(text)+':'+lz.compressToUTF16(text);
    // Check reversibility before touching the previously saved record.
    if(decode(compressed)!==text)throw new Error('Local storage compression verification failed.');
    return compressed.length<text.length?compressed:text;
  }
  function decode(raw){
    if(raw==null||!raw.startsWith(prefix))return raw;
    const endLength=raw.indexOf(':',prefix.length),endHash=raw.indexOf(':',endLength+1);
    const length=Number(raw.slice(prefix.length,endLength));
    if(endLength<0||endHash<0||!Number.isSafeInteger(length)||length<0)throw new Error('Invalid compressed storage header.');
    const text=lz.decompressFromUTF16(raw.slice(endHash+1));
    if(typeof text!=='string'||text.length!==length||checksum(text)!==raw.slice(endLength+1,endHash))throw new Error('Compressed storage failed integrity verification.');
    return text;
  }
  const api={encode,decode};root.STEELER=root.STEELER||{};root.STEELER.storageCodec=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
