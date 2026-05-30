import app from "./calendar-format-router.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return app.fetch(request, env, ctx);

    let update;
    try {
      update = await request.clone().json();
    } catch {
      return app.fetch(request, env, ctx);
    }

    const message = update.message || update.edited_message;
    if (!message || message.from?.is_bot) return app.fetch(request, env, ctx);

    const chatId = message.chat.id;
    const threadId = message.message_thread_id;
    const original = getText(message).trim();
    const commandText = String(message.text || "").trim();
    const lower = commandText.toLowerCase();

    await rememberUserAndMessage({ env, message, chatId });

    if (isCmd(lower, ["/resetopomene", "/ресетопомене", "/resetwarn", "/opomene0"])) {
      return resetWarnings({ env, message, chatId, threadId, original: commandText });
    }

    if (!lower.startsWith("/") && original) {
      const t = latin(original);

      if (hasSeriousProfanity(t)) {
        return warnOnly({ env, message, chatId, threadId, original, reason: "псовка / простачки речник" });
      }

      if (isTheologicalOrChurchDebate(original)) {
        return new Response("OK", { status: 200 });
      }
    }

    return app.fetch(request, env, ctx);
  }
};

async function warnOnly({ env, message, chatId, threadId, original, reason }) {
  const count = await addWarning({ env, chatId, userId: message.from?.id, original, reason });
  await sendAdminNotice({ env, message, chatId, original, reason, count });

  const countLine = count ? `\n\nОпомена: ${count}` : "";
  return send(chatId, `☦️ <b>Опомена</b>\n\nПазимо на речник. Без псовки и простаклука.${countLine}`, threadId);
}

async function addWarning({ env, chatId, userId, original, reason }) {
  if (!env.MOD_STATE || !userId) return null;
  const key = `warn:${chatId}:${userId}`;
  const existing = await env.MOD_STATE.get(key, "json");
  const count = Number(existing?.count || 0) + 1;

  await env.MOD_STATE.put(key, JSON.stringify({
    count,
    lastReason: reason,
    lastMessage: String(original || "").slice(0, 500),
    updatedAt: new Date().toISOString()
  }), { expirationTtl: 60 * 60 * 24 * 7 });

  return count;
}

async function sendAdminNotice({ env, message, chatId, original, reason, count }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return { ok: false };

  const report = `⚠️ <b>Јавна опомена</b>\n\n` +
    `<b>Корисник:</b> ${esc(formatUser(message.from))}\n` +
    `<b>User ID:</b> ${esc(message.from?.id || "?")}\n` +
    `<b>Chat ID:</b> ${esc(chatId)}\n` +
    `<b>Ниво:</b> LOW\n` +
    (count ? `<b>Број опомена:</b> ${esc(count)}\n` : "") +
    `<b>Акција:</b> warn_only\n` +
    `<b>Разлог:</b> ${esc(reason)}\n` +
    `<b>Предлог:</b> Само опомена. Нема mute/ban/kick.\n\n` +
    `<b>Порука:</b>\n${esc(String(original || "").slice(0, 3000))}`;

  return tg(env, "sendMessage", {
    chat_id: env.ADMIN_CHAT_ID,
    message_thread_id: env.ADMIN_THREAD_ID ? Number(env.ADMIN_THREAD_ID) : undefined,
    text: report,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

async function resetWarnings({ env, message, chatId, threadId, original }) {
  if (!senderAllowed(env, message.from?.id)) {
    return send(chatId, "⛔ Ниси на листи admin ID-јева за ову команду.", threadId);
  }

  const targetId = getTargetId(message, original);
  if (!targetId) {
    return send(chatId, "⚠️ Користи reply или User ID. Пример: <code>/resetopomene 5227965029</code>", threadId);
  }

  if (!env.MOD_STATE) return send(chatId, "⚠️ MOD_STATE KV binding није подешен.", threadId);

  await env.MOD_STATE.delete(`warn:${chatId}:${targetId}`);
  return send(chatId, `✅ Опомене су ресетоване за User ID: <code>${esc(targetId)}</code>`, threadId);
}

async function rememberUserAndMessage({ env, message, chatId }) {
  if (!env.MOD_STATE || !message.from?.id) return;

  const user = message.from;
  if (user.username) {
    await env.MOD_STATE.put(`userbyname:${chatId}:${String(user.username).toLowerCase()}`, JSON.stringify({ id: String(user.id), username: user.username, updatedAt: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
  }

  await env.MOD_STATE.put(`userbyid:${chatId}:${user.id}`, JSON.stringify({ id: String(user.id), username: user.username || "", name: formatUser(user), updatedAt: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
}

function isTheologicalOrChurchDebate(value) {
  const t = latin(value);

  if (t.includes("kurziv")) return true;

  return has(t, [
    "isus", "hrist", "gospod", "bog", "sveti", "svetog", "svetome", "svetinja",
    "crkva", "manastir", "ikona", "liturgija", "pricesce", "jevandjelje", "svestenik",
    "episkop", "vladika", "patrijarh", "kanon", "sabor", "jeres", "jeretik",
    "raskol", "raskolnik", "novotar", "ziloti", "zilot", "katolik", "papa", "vatikan",
    "protestant", "islam", "dogma", "blagodat", "predanje", "post", "molitva"
  ]);
}

function hasSeriousProfanity(t) {
  const badRoots = ["jeb", "piz", "pick", "govn", "sran", "odjeb"];
  if (has(t, badRoots)) return true;

  const roughKRoot = /(^|\s)kur[a-z]{0,6}(\s|$)/.test(t);
  if (roughKRoot && !t.includes("kurziv")) return true;

  return false;
}

function senderAllowed(env, userId) {
  const allowed = String(env.ADMIN_USER_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes(String(userId));
}

function getTargetId(message, original) {
  if (message.reply_to_message?.from?.id) return String(message.reply_to_message.from.id);
  const args = original.replace(/^\/\S+\s*/u, "").trim();
  const m = args.match(/\d{5,}/);
  return m ? m[0] : "";
}

function getText(message) {
  return message.text || message.caption || "";
}

async function tg(env, method, body) {
  if (!env.BOT_TOKEN) return { ok: false, description: "BOT_TOKEN није подешен." };
  try {
    const cleanBody = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleanBody)
    });
    return await res.json();
  } catch (e) {
    return { ok: false, description: e?.message || "Telegram API грешка" };
  }
}

function latin(v) {
  const map = {"а":"a","б":"b","в":"v","г":"g","д":"d","ђ":"dj","е":"e","ж":"z","з":"z","и":"i","ј":"j","к":"k","л":"l","љ":"lj","м":"m","н":"n","њ":"nj","о":"o","п":"p","р":"r","с":"s","т":"t","ћ":"c","у":"u","ф":"f","х":"h","ц":"c","ч":"c","џ":"dz","ш":"s","š":"s","č":"c","ć":"c","ž":"z","đ":"dj"};
  return Array.from(String(v || "").toLowerCase()).map((c) => map[c] || c).join("").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function formatUser(user) {
  if (!user) return "Непознат";
  if (user.username) return `@${user.username}`;
  return `${user.first_name || ""} ${user.last_name || ""}`.trim() || String(user.id || "Непознат");
}

function has(t, arr) { return arr.some((x) => t.includes(x)); }
function isCmd(t, arr) { return arr.some((c) => t === c || t.startsWith(c + " ") || t.startsWith(c + "@")); }
function send(chatId, text, threadId) {
  const payload = { method: "sendMessage", chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (threadId !== undefined && threadId !== null) payload.message_thread_id = threadId;
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}
function esc(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
