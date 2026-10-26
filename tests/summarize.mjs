import assert from 'node:assert/strict';
import {parseSummary,selectMessages,dayKey,ChatSummary,summaryRecord,coverageText} from '../src/summarize.js';
import bot from '../src/control-ban-router.js';
const msg = (text, extra={}) => ({text,message_id:1000,date:Math.floor(Date.now()/1000),chat:{id:-100,type:'supergroup'},from:{id:5,first_name:'Петар'},message_thread_id:7,...extra});
for(const text of ['/sumiraj','/сумирај','/summarize','/sumiraj@ced_podestnik_bot','Цед, сумирај последњих 100 порука','@ced_podestnik_bot sumiraj 100']) assert.deepEqual(parseSummary(msg(text)),{mode:'count',count:100});
assert.deepEqual(parseSummary(msg('/sumiraj 50')),{mode:'count',count:50});
for(const text of ['/sumiraj danas','/сумирај данас','Цед, шта се данас причало?']) assert.deepEqual(parseSummary(msg(text)),{mode:'today'});
for(const text of ['/sumiraj','Сумирај одовде']) assert.deepEqual(parseSummary(msg(text,{reply_to_message:{message_id:3}})),{mode:'reply',from:3});
for(const text of ['сумирај разговор','pričali smo o sumiranju','/sumiraj@other_bot','@other_bot sumiraj','/sumirajxyz']) assert.equal(parseSummary(msg(text)),null);
for(const text of ['/sumiraj 0','/sumiraj 501','/sumiraj -3','/sumiraj foo','Цед, сумирај одовде']) assert.ok(parseSummary(msg(text)).error);
assert.equal(dayKey(Date.parse('2026-10-26T23:30:00Z')),'2026-10-27');
const now=Date.now(), record=(id,at=now,text='Порука')=>({id,at,text,name:'Петар',version:at/1000});
const history=[record(1,now-8*86400000),record(2),record(3),record(4)];
assert.deepEqual(selectMessages(history,{mode:'reply',from:3},now,4).rows.map(r=>r.id),[3]);
assert.deepEqual(selectMessages(history,{mode:'count',count:1},now,4).rows.map(r=>r.id),[3]);
assert.ok(selectMessages(Array.from({length:30},(_,i)=>record(i,now,'а'.repeat(1500))),{mode:'count',count:30},now,40).clipped);
class Storage {
 constructor(){this.map=new Map();this.queue=Promise.resolve();}
 async get(k){return structuredClone(this.map.get(k));}
 async put(k,v){this.map.set(k,structuredClone(v));}
 async delete(k){this.map.delete(k);}
 async setAlarm(t){this.alarm=t;}
 transaction(fn){const p=this.queue.then(()=>fn(this));this.queue=p.catch(()=>{});return p;}
}
const objects=new Map();let aiCalls=0,fail=false,prompt;
const env={MOD_CHAT_ID:'-100',BOT_USERNAME:'ced_podestnik_bot',AI:{async run(model,args){aiCalls++;prompt=args;assert.ok(model.includes('llama-3.3'));if(fail)throw Error('fail');return {response:'Главна тема: договор о сусрету.'};}}};
env.CHAT_SUMMARIES={idFromName:n=>n,get(id){if(!objects.has(id))objects.set(id,new ChatSummary({storage:new Storage()},env));return objects.get(id);}};
async function run(m,edit=false){return bot.fetch(new Request('https://bot.test/',{method:'POST',body:JSON.stringify({[edit?'edited_message':'message']:m})}),env,{});}
assert.equal(await(await run(msg('Договор у осам',{message_id:1}))).text(),'OK');
assert.equal(await(await run(msg('Договор у осам',{message_id:1}))).text(),'OK');
await run(msg('Договор у девет',{message_id:1,edit_date:Math.floor(now/1000)+1}),true);
await run(msg('Договор у осам',{message_id:1})); // stale duplicate must not overwrite edit
const object=objects.get('-100:7');
assert.equal((await object.state.storage.get('history')).length,1);
assert.equal((await object.state.storage.get('history'))[0].text,'Договор у девет');
await run(msg('Друга тема',{message_id:2,message_thread_id:8}));
await run(msg('Приватна порука',{message_id:3,chat:{id:5,type:'private'}}));
await run(msg('Туђа група',{message_id:4,chat:{id:-999,type:'supergroup'}}));
await run(msg('Бот порука',{message_id:5,from:{id:9,is_bot:true}}));
await run(msg('/sumiraj@other_bot',{message_id:6}));
assert.equal(objects.size,2);
let result=await(await run(msg('/сумирај'))).json();
assert.match(result.text,/Сажетак разговора/);assert.equal(result.message_thread_id,7);assert.equal(result.parse_mode,undefined);
assert.ok(prompt.messages[1].content.includes('Договор у девет'));assert.ok(!prompt.messages[1].content.includes('Друга тема'));assert.equal(aiCalls,1);
assert.equal(await(await run(msg('/сумирај'))).text(),'OK');assert.equal(aiCalls,1);
result=await(await run(msg('/sumiraj',{message_id:1001}))).json();assert.match(result.text,/два минута/);assert.equal(aiCalls,1);
// Simultaneous requests reserve quota atomically; only one inference runs.
let quota=await object.state.storage.get('quota');quota.last=0;await object.state.storage.put('quota',quota);
await Promise.all([run(msg('/sumiraj',{message_id:1002})),run(msg('/sumiraj',{message_id:1003}))]);assert.equal(aiCalls,2);
quota=await object.state.storage.get('quota');quota.last=0;quota.count=30;await object.state.storage.put('quota',quota);
result=await(await run(msg('/sumiraj',{message_id:1004}))).json();assert.match(result.text,/дневни лимит/);
quota.count=0;quota.last=0;await object.state.storage.put('quota',quota);fail=true;
result=await(await run(msg('/sumiraj',{message_id:1005}))).json();assert.match(result.text,/није успео/);fail=false;
result=await(await run(msg('/sumiraj',{message_id:1006,message_thread_id:9}))).json();assert.match(result.text,/нема сачуваних/);
// Missing binding and AI produce actionable replies, no fake summary.
const binding=env.CHAT_SUMMARIES;delete env.CHAT_SUMMARIES;
result=await(await run(msg('/sumiraj'))).json();assert.match(result.text,/складиште/);env.CHAT_SUMMARIES=binding;
const ai=env.AI;delete env.AI;result=await(await run(msg('/sumiraj'))).json();assert.match(result.text,/AI сервис/);env.AI=ai;
await run(msg('/help',{message_id:1,edit_date:Math.floor(now/1000)+2}),true);
assert.equal((await object.state.storage.get('history')).length,0);
await object.state.storage.put('history',[record(1,now-8*86400000)]);await object.alarm();assert.equal((await object.state.storage.get('history')).length,0);
console.log('PASS: summary aliases, Serbian requests, reply/count/day, thread isolation, privacy scope, edits, duplicates, concurrent quotas, failures and expiry.');

// Regression: quoted speech, denial, full names, and unavailable audio must reach the model distinctly.
const original=msg('Ћутиш и затвараш очи',{message_id:20,from:{id:30,first_name:'Гријешни',last_name:'Мимоје'}});
const denial=msg('То је твоја пројекција, није истина',{message_id:21,from:{id:31,first_name:'Марко'},reply_to_message:original});
const saved=summaryRecord(denial);
assert.equal(saved.name,'Марко');assert.equal(saved.replyTo.name,'Гријешни Мимоје');assert.equal(saved.replyTo.id,20);
assert.equal(summaryRecord({...denial,reply_to_message:{...original,message_thread_id:999}}).replyTo,null);
assert.equal(summaryRecord(msg('а'.repeat(3500))).text.length,3500);
for(const phrase of ['@ced_podestnik_bot сумирај задње поруке од данас','Цед, сумирај последње поруке од данас']) assert.deepEqual(parseSummary(msg(phrase)),{mode:'today'});
assert.deepEqual(parseSummary(msg('/sumiraj zadnjih 20')),{mode:'count',count:20});
await run(original);await run(denial);
await run(msg(undefined,{message_id:22,voice:{file_id:'never-download'},reply_to_message:denial}));
const withMedia=await(await run(msg('/sumiraj danas',{message_id:2000}))).json();
assert.match(withMedia.text,/Медијске поруке: 1/);assert.match(withMedia.text,/не цео разговор/);assert.match(withMedia.text,/Није гарантовано/);
const sent=JSON.parse(prompt.messages[1].content);
assert.equal(sent.find(r=>r.id===21).replyTo.name,'Гријешни Мимоје');
assert.equal(sent.find(r=>r.id===22).media,'voice');assert.equal(sent.find(r=>r.id===22).text,'');
assert.ok(!JSON.stringify(sent).includes('never-download'));
await run(msg(undefined,{message_id:23,message_thread_id:10,voice:{file_id:'no-content'}}));
const beforeAI=aiCalls;const mediaOnly=await(await run(msg('/sumiraj',{message_id:2001,message_thread_id:10}))).json();
assert.match(mediaOnly.text,/само медијске/);assert.equal(aiCalls,beforeAI);
assert.match(coverageText({rows:[record(5)],clipped:false},{mode:'reply',from:1}),/Почетна порука није/);
assert.match(coverageText({rows:[record(5)],clipped:true},{mode:'count',count:100}),/скраћен/);
console.log('PASS: reply attribution, media gaps, natural today request and explicit partial coverage. AI prose quality still requires a live comparison.');
