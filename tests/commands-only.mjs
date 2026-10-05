import assert from 'node:assert/strict';
import bot from '../src/control-ban-router.js';
import { calendar2026 } from '../src/data/calendar-all.js';
let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error('Unexpected outbound call'); };
const env = {BOT_TOKEN:'test',MOD_STATE:new Proxy({}, {get(){throw new Error('Moderation KV must not be used');}})};
async function run(text, extra = {}) {
 const message = {text,from:{id:11},chat:{id:-100},message_id:1,message_thread_id:7,...extra};
 return bot.fetch(new Request('https://worker.test/',{method:'POST',body:JSON.stringify({message})}),env,{});
}
for (const text of ['јебем бога','псовка','/ban спам','/upozori','/prijavi','/modadd','/unknown']) {
 assert.equal(await (await run(text)).text(),'OK');
}
assert.equal(await (await run(undefined,{photo:[{}]})).text(),'OK');
const edit = new Request('https://worker.test/',{method:'POST',body:JSON.stringify({edited_message:{text:'јебем бога',chat:{id:-100},from:{id:11}}})});
assert.equal(await (await bot.fetch(edit,env,{})).text(),'OK');
for (const cmd of ['/kalendar','/kalendar@ced_podestnik_bot','/post','/sutra','/nedelja','/tropar','/kondak','/prolog','/help','/pomoc','/ping','/citanja']) {
 const data = await (await run(cmd)).json();
 assert.equal(data.chat_id,-100);assert.equal(data.message_thread_id,7);assert.ok(data.text || data.caption);
 assert.ok(!JSON.stringify(data).includes('Calendar command works'));
 if (cmd.startsWith('/kalendar')) assert.ok(!data.text?.includes('још нису додати'));
}
for (let page=1;page<=5;page++) { const data=await (await run(`/icons ${page}`)).json();assert.ok(data.text.length<4096); }
assert.ok((await (await run('/icons')).json()).text.includes('/ikona'));
const icon = await (await run('/ikona simon-zilot')).json();assert.equal(icon.method,'sendPhoto');assert.ok(icon.photo.startsWith('https://raw.githubusercontent.com/'));
assert.equal(calls,0);
assert.ok(calendar2026['2026-10-05'].title.includes('Фока'));
assert.equal(Object.keys(calendar2026).filter(k=>k.startsWith('2026-10')).length,31);
console.log('PASS: moderation inert; commands, suffixes, forum topics, icon pages and October calendar. No outbound or moderation KV calls.');
