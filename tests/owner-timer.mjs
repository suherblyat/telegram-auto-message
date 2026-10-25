import assert from 'node:assert/strict';
import bot from '../src/control-ban-router.js';
import {OwnerTimer, parseDuration, timerInput} from '../src/owner-timer.js';
for (const [s, ms] of [['20 минута',1200000],['1h 30m',5400000],['1 сат и 30 минута',5400000],['пет секунди',5000],['пола сата',1800000],['1,5 sata',5400000],['30d',2592000000]]) assert.equal(parseDuration(s),ms,s);
for (const s of ['','0m','-5m','31d','2','5 minuta sutra','1m i','1e3s','Infinity h']) assert.equal(parseDuration(s),null,s);
for (const s of ['@ced_podestnik_bot ced bot podesi tajmer na 20 minuta','цед бот, подеси тајмер на 20 минута','@ced_podestnik_bot постави тајмер за 20 минута','/tajmer@ced_podestnik_bot 20 minuta']) assert.equal(parseDuration(timerInput(s,'ced_podestnik_bot')),1200000,s);
for (const s of ['podesi tajmer na 5m','@other_bot podesi tajmer na 5m','/timer@other_bot 5m','hello']) assert.equal(timerInput(s,'ced_podestnik_bot'),null,s);
const owner='2073293508';
class Storage {
  data = new Map(); alarmAt = null;
  async get(k) { return structuredClone(this.data.get(k)); }
  async put(k,v) { this.data.set(k,structuredClone(v)); }
  async setAlarm(t) { this.alarmAt = t; }
  async transaction(fn) { return fn(this); }
}
const objects = new Map();
const env={OWNER_USER_ID:owner,BOT_TOKEN:'fake',OWNER_TIMERS:{idFromName:n=>n,get(id){
 if (!objects.has(id)) {const state={storage:new Storage()}; objects.set(id,{state,obj:new OwnerTimer(state,env)});}
 return objects.get(id).obj;
}}};
const message={text:'@ced_podestnik_bot цед бот подеси тајмер на 1 секунду',message_id:99,message_thread_id:7,from:{id:Number(owner)},chat:{id:-100,type:'supergroup'}};
async function run(overrides={}, e=env, edited=false) {
 return bot.fetch(new Request('https://bot.test/',{method:'POST',body:JSON.stringify({[edited?'edited_message':'message']:{...message,...overrides}})}),e,{});
}
let clock=1000000;
const now=Date.now;
Date.now=()=>clock;
let calls=[];
globalThis.fetch=async (url,options)=>{calls.push(JSON.parse(options.body));return Response.json({ok:true});};
assert.match((await (await run()).json()).text,/Тајмер је подешен/);
const entry=objects.get('-100:99');
assert.equal(entry.state.storage.alarmAt,clock+1000);
clock+=300;
await run();
assert.equal(entry.state.storage.alarmAt,1001000,'duplicate webhook must not reset timer');
assert.equal(objects.size,1);
for (const overrides of [{from:{id:33}}, {sender_chat:{id:-100}}, {from:{id:33},text:'/tajmer 5m'}]) assert.match((await (await run(overrides)).json()).text,/Само власник/);
assert.equal(objects.size,1);
assert.equal(await (await run({},env,true)).text(),'OK');
assert.equal(await (await run({text:'ordinary text'})).text(),'OK');
assert.match((await (await run({text:'/tajmer nope'})).json()).text,/Наведи трајање/);
assert.match((await (await run({}, {...env,OWNER_TIMERS:null})).json()).text,/недостаје/);
await entry.obj.alarm(); assert.equal(calls.length,0);
clock+=1000;
entry.obj=new OwnerTimer(entry.state,env); // Simulated eviction/restart: only storage persists.
await entry.obj.alarm();
assert.equal(calls.length,1); assert.equal(calls[0].chat_id,-100); assert.equal(calls[0].message_thread_id,7);
assert.equal(calls[0].reply_parameters.message_id,99);
await entry.obj.alarm(); await run(); assert.equal(calls.length,1);
assert.equal((await entry.state.storage.get('timer')).status,'sent');
await run({message_id:100,chat:{id:123,type:'private'},message_thread_id:undefined});
const second=objects.get('123:100');clock+=1001;
globalThis.fetch=async()=>Response.json({ok:false,error_code:429,parameters:{retry_after:90}});
await second.obj.alarm(); assert.equal(second.state.storage.alarmAt,clock+90000);
assert.equal((await second.state.storage.get('timer')).status,'pending');
globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({ok:true});};
clock+=90000; await second.obj.alarm();assert.equal(calls.length,2);assert.ok(!('message_thread_id' in calls[1]));
await run({message_id:101});clock+=1001;
globalThis.fetch=async()=>{throw Error('offline');};
await objects.get('-100:101').obj.alarm();assert.equal((await objects.get('-100:101').state.storage.get('timer')).status,'pending');
Date.now=now;
console.log('PASS: owner-only routing, Serbian/Latin duration parsing, persistence/restart, duplicate updates, expiry, topics/private chat, retry and delivery.');
