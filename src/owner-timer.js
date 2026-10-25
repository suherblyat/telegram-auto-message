// One durable object per Telegram message: webhook retries cannot create extra timers.
const MAX_MS = 30 * 86400000;
const cyrillic = 'абвгдђежзијклљмнњопрстћуфхцчџш';
const latin = ['a','b','v','g','d','dj','e','z','z','i','j','k','l','lj','m','n','nj','o','p','r','s','t','c','u','f','h','c','c','dz','s'];
function formatDuration(ms) {
  let seconds = ms / 1000;
  return [[86400,'д'],[3600,'ч'],[60,'мин'],[1,'сек']].flatMap(([unit,label]) => {
    const amount = Math.floor(seconds / unit);
    seconds %= unit;
    return amount ? [`${amount} ${label}`] : [];
  }).join(' ');
}
function normalize(text) {
  return text.toLowerCase().replace(/[а-яђјљњћџ]/g, c => latin[cyrillic.indexOf(c)] ?? c)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function reply(message, text) {
  return Response.json({method:'sendMessage',chat_id:message.chat.id,text,
    ...(message.message_thread_id != null ? {message_thread_id:message.message_thread_id} : {})});
}

export function parseDuration(input) {
  let text = normalize(input).trim();
  if (text === 'pola sata') return 1800000;
  const numbers = {jedan:1,jedna:1,jednu:1,dva:2,dve:2,tri:3,cetiri:4,pet:5,sest:6,sedam:7,osam:8,devet:9,deset:10};
  text = text.replace(/\b(jedan|jedna|jednu|dva|dve|tri|cetiri|pet|sest|sedam|osam|devet|deset)\b/g, n => numbers[n]);
  let total = 0;
  // Consume the entire expression so malformed durations never silently schedule.
  while (text) {
    const part = text.match(/^(\d+(?:[.,]\d+)?)\s*(sekundi|sekunde|sekunda|sekundu|sek|s|minuta|minute|minutu|min|m|sati|sata|sat|h|dana|dan|d)(?=\s|\d|$)/);
    if (!part) return null;
    const unit = part[2];
    const multiplier = /^(sek|s$)/.test(unit) ? 1000 : /^(min|m$)/.test(unit) ? 60000 : /^(sat|h$)/.test(unit) ? 3600000 : 86400000;
    total += Number(part[1].replace(',', '.')) * multiplier;
    text = text.slice(part[0].length).trim().replace(/^i\s+/, '');
  }
  return Number.isSafeInteger(total) && total >= 1000 && total <= MAX_MS ? total : null;
}

export function timerInput(raw, username) {
  let text = normalize(raw).trim();
  const bot = normalize(username.replace(/^@/, ''));
  const slash = text.match(/^\/(?:tajmer|timer|тајмер)(?:@([^\s]+))?(?:\s+([\s\S]*))?$/);
  if (slash) return !slash[1] || slash[1] === bot ? (slash[2] || '') : null;
  const mention = text.match(/^@([^\s,]+)[,\s]+/);
  let addressed = false;
  if (mention) {
    if (mention[1] !== bot) return null;
    addressed = true;
    text = text.slice(mention[0].length);
  }
  const alias = text.match(/^ced\s+bot[,\s]+/);
  if (alias) { addressed = true; text = text.slice(alias[0].length); }
  if (!addressed) return null;
  const request = text.match(/^(?:podesi|postavi|namesti|pokreni)\s+(?:tajmer|timer)(?:\s+(?:na|za))?(?:\s+([\s\S]*))?$/);
  return request ? (request[1] || '') : null;
}

export async function handleTimer(message, env) {
  const input = timerInput(message.text, env.BOT_USERNAME || 'ced_podestnik_bot');
  if (input === null) return null;
  // Only the explicit owner, not moderators or ADMIN_USER_IDS. Anonymous posts cannot prove ownership.
  if (!env.OWNER_USER_ID || message.sender_chat || String(message.from?.id) !== String(env.OWNER_USER_ID).trim()) {
    return reply(message, '⛔ Само власник бота може да поставља тајмере.');
  }
  const duration = parseDuration(input);
  if (!duration) return reply(message, 'Наведи трајање од 1 секунде до 30 дана. Пример: @ced_podestnik_bot подеси тајмер на 20 минута или /tajmer 1h 30m.');
  if (!env.OWNER_TIMERS || !env.BOT_TOKEN) return reply(message, '⚠️ Тајмер није подешен: недостаје конфигурација сервиса.');
  const id = env.OWNER_TIMERS.idFromName(`${message.chat.id}:${message.message_id}`);
  const timer = env.OWNER_TIMERS.get(id);
  const response = await timer.fetch(new Request('https://timer.internal/', {
    method:'POST',body:JSON.stringify({duration,chatId:message.chat.id,threadId:message.message_thread_id,
      messageId:message.message_id,ownerId:String(message.from.id)})
  }));
  if (!response.ok) throw new Error('Timer persistence failed');
  const saved = await response.json();
  if (saved.status !== 'pending') return new Response('OK');
  const end = new Intl.DateTimeFormat('sr-RS',{timeZone:'Europe/Belgrade',dateStyle:'short',timeStyle:'medium'}).format(saved.dueAt);
  return reply(message, `⏱️ Тајмер је подешен на ${formatDuration(saved.duration)}. Јављам се овде када истекне.\nИстиче: ${end} (Београд).`);
}

export class OwnerTimer {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
    const input = await request.json();
    if (input.ownerId !== String(this.env.OWNER_USER_ID).trim() || !Number.isSafeInteger(input.duration) || input.duration < 1000 || input.duration > MAX_MS) {
      return new Response('Invalid timer', {status:400});
    }
    const saved = await this.state.storage.transaction(async tx => {
      const existing = await tx.get('timer');
      if (existing) return existing;
      const timer = {...input, dueAt:Date.now() + input.duration, status:'pending', attempts:0};
      await tx.put('timer', timer);
      await tx.setAlarm(timer.dueAt);
      return timer;
    });
    return Response.json(saved);
  }
  async alarm() {
    const timer = await this.state.storage.get('timer');
    if (!timer || timer.status !== 'pending') return;
    if (timer.dueAt > Date.now()) { await this.state.storage.setAlarm(timer.dueAt); return; }
    let data;
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.env.BOT_TOKEN}/sendMessage`, {
        method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
        body:JSON.stringify({chat_id:timer.chatId,
          text:`⏰ Тајмер је истекао! Трајање: ${formatDuration(timer.duration)}.`,
          reply_parameters:{message_id:timer.messageId,allow_sending_without_reply:true},
          ...(timer.threadId != null ? {message_thread_id:timer.threadId} : {})})
      });
      data = await response.json();
    } catch { data = {ok:false}; }
    if (data?.ok) {
      // Telegram has no idempotency key; a crash after delivery but before this write can duplicate delivery.
      await this.state.storage.put('timer', {...timer,status:'sent',sentAt:Date.now()});
      return;
    }
    if ([400,401,403].includes(data?.error_code)) {
      await this.state.storage.put('timer', {...timer,status:'failed',errorCode:data.error_code});
      console.error('Timer delivery permanently rejected', {chatId:timer.chatId,errorCode:data.error_code});
      return;
    }
    // Explicit rearming survives long Telegram outages, beyond the platform's automatic retry window.
    await this.state.storage.transaction(async tx => {
      await tx.put('timer', {...timer,attempts:timer.attempts + 1});
      const delay = Math.max(30000, Math.min(3600000, 30000 * 2 ** Math.min(timer.attempts, 7)), (Number(data?.parameters?.retry_after) || 0) * 1000);
      await tx.setAlarm(Date.now() + delay);
    });
  }
}
