// DOM integration fallback for environments that cannot launch Chromium.
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');
exports.launch = async () => {
  const pages=[];
  return {
    newContext: async () => ({
      route: async()=>{},
      newPage: async()=>{
        let dom;
        const listeners=[];
        const load=(saved={})=>{
          dom?.window.close();
          const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
          dom=new JSDOM(html,{url:'http://127.0.0.1:8765',runScripts:'outside-only',pretendToBeVisual:true});
          const w=dom.window;
          w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});
          w.scrollTo=()=>{};
          w.HTMLElement.prototype.scrollIntoView=()=>{};
          w.alert=()=>{};
          w.confirm=()=>false;
          w.fetch=async()=>{throw new Error('Network disabled in tests')};
          w.addEventListener('error',event=>listeners.forEach(fn=>fn(event.error)));
          Object.entries(saved).forEach(([k,v])=>w.localStorage.setItem(k,v));
          const scripts=[...w.document.querySelectorAll('script[src]')].map(el=>el.getAttribute('src'));
          for(const src of scripts) vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),dom.getInternalVMContext(),{filename:src});
        };
        const page={on:(event,fn)=>{if(event==='pageerror')listeners.push(fn)},goto:async()=>load(),waitForFunction:async()=>{},evaluate:async(fn,arg)=>JSON.parse(JSON.stringify(await vm.runInContext(`(${fn.toString()})(${JSON.stringify(arg) ?? 'undefined'})`,dom.getInternalVMContext())) ?? 'null'),reload:async()=>{const saved={...dom.window.localStorage};load(saved)},close:async()=>dom?.window.close()};
        pages.push(page);return page;
      }
    }),
    close:async()=>{for(const p of pages)await p.close()}
  };
};
