import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { handleSummaryBridge } from '../src/summary-bridge.js';
import { handleSummary } from '../src/summarize.js';
if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", {value:webcrypto});
const key = await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const env = {SUMMARY_BRIDGE_PUBLIC_KEY:Buffer.from(await crypto.subtle.exportKey('raw',key.publicKey)).toString('base64'), AI:{run:async()=>({response:'Тест сажетка.'})}};
async function request(body, stamp=String(Math.floor(Date.now()/1000))) {
 const raw=JSON.stringify(body);
 const signature=Buffer.from(await crypto.subtle.sign('Ed25519',key.privateKey,new TextEncoder().encode(stamp+'\n'+raw))).toString('base64');
 return new Request('https://test/internal/summary',{method:'POST',body:raw,headers:{'X-Summary-Time':stamp,'X-Summary-Signature':signature}});
}
assert.equal((await handleSummaryBridge(new Request('https://test',{method:'POST',body:'{}'}),env)).status,401);
assert.equal((await handleSummaryBridge(await request({mode:'final',text:'test'},'1'),env)).status,401);
assert.equal((await handleSummaryBridge(await request({mode:'invalid',text:'test'}),env)).status,400);
assert.equal((await handleSummaryBridge(await request({mode:'final',text:'test'}),env)).status,200);
const signed=await request({mode:'final',text:'test'});
assert.equal((await handleSummaryBridge(new Request(signed.url,{method:'POST',headers:signed.headers,body:'{"mode":"final","text":"tampered"}'}),env)).status,401);
const mode={SUMMARY_MODE:'on_demand',CHAT_SUMMARIES:{idFromName(){throw Error('History must not be written');}}};
assert.equal(await handleSummary({message:{text:'ordinary',chat:{id:-1,type:'supergroup'}}},mode),null);
assert.equal((await handleSummary({message:{text:'/sumiraj',chat:{id:-1,type:'supergroup'}}},mode)).status,200);
console.log('Summary bridge authentication and no-archive checks passed');
