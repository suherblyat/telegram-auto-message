import { SUMMARY_PROMPT } from './summarize.js';

const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export async function handleSummaryBridge(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
  const body = await request.text();
  if (body.length > 30000) return new Response('Too large', {status:413});
  const timestamp = request.headers.get('X-Summary-Time');
  const signature = request.headers.get('X-Summary-Signature');
  try {
    if (!timestamp || !signature || Math.abs(Date.now()/1000 - Number(timestamp)) > 90 || !Number.isFinite(Number(timestamp))) throw Error();
    const key = await crypto.subtle.importKey('raw', decode(env.SUMMARY_BRIDGE_PUBLIC_KEY), {name:'Ed25519'}, false, ['verify']);
    const valid = await crypto.subtle.verify('Ed25519', key, decode(signature), new TextEncoder().encode(timestamp+'\n'+body));
    if (!valid) throw Error();
  } catch { return new Response('Unauthorized', {status:401}); }
  let input;
  try { input = JSON.parse(body); } catch { return new Response('Bad JSON', {status:400}); }
  if (!['chunk','merge','final'].includes(input.mode) || typeof input.text !== 'string' || input.text.length > 18000) return new Response('Bad input', {status:400});
  const instruction = input.mode === 'chunk'
    ? '\nОво је један део дужег разговора. Направи прецизне радне белешке до 500 речи: главне теме, ко шта тврди, негације, појашњења и везе одговора. Сачувај имена и ID порука за спорне тврдње. Не доноси закључак о целом разговору.'
    : input.mode === 'merge'
      ? '\nДобијаш хронолошке радне белешке више делова истог разговора. Споји их до 500 речи, задржи различите теме, приписивање ставова, негације и каснија појашњења. Не измишљај изгубљени контекст.'
      : '\nДобијаш поруке или хронолошке радне белешке свих делова изабраног распона. Напиши коначни сажетак до 220 речи. Касније појашњење има предност над ранијим тумачењем.';
  try {
    const result = await env.AI.run(env.SUMMARY_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages:[{role:'system',content:SUMMARY_PROMPT+instruction},{role:'user',content:input.text}],
      max_tokens:input.mode === 'final' ? 1000 : 1800, temperature:0.1
    });
    const text = String(result?.response || '').trim();
    if (!text || text.length > 6000) throw Error();
    return Response.json({text}, {headers:{'Cache-Control':'no-store'}});
  } catch { return new Response('Inference failed', {status:502}); }
}
