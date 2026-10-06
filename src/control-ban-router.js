import app from "./userid-router.js";
import { icons } from "./data/icons.js";
import { calendar2026 } from "./data/calendar-all.js";

// Commands only. Ordinary messages, edits and media are ignored. Selected moderation commands are handled here.
export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("commands-only: moderation disabled");
    let update;
    try { update = await request.clone().json(); } catch { return ok(); }
    const message = update.message;
    if (!message?.text || message.from?.is_bot) return ok();
    const match = message.text.trim().match(/^\/([^\s@]+)(?:@([^\s]+))?(?:\s+([\s\S]*))?$/u);
    if (!match) return ok();
    if (match[2] && env.BOT_USERNAME && match[2].toLowerCase() !== env.BOT_USERNAME.replace(/^@/, "").toLowerCase()) return ok();
    const command = match[1].toLowerCase();
    const args = (match[3] || "").trim();

    if (["modadd","modremove","modlist","ban"].includes(command)) {
      return handleModeration({ message, env, command, args });
    }
    if (["icons", "иконе"].includes(command) && (!args || /^\d+$/.test(args))) {
      const page = Number(args) || 1;
      const pages = Math.ceil(icons.length / 30);
      if (page < 1 || page > pages) return send(message, {method:"sendMessage",text:`Страница мора бити између 1 и ${pages}.`});
      const text = `☦️ <b>Иконе, страна ${page}/${pages}</b>` + "\n\nКористи <code>/ikona назив</code> или <code>/icons део-назива</code>.\n\n" +
        icons.slice((page - 1) * 30, page * 30).map(i => `<code>${esc(i.name)}</code>`).join("\n");
      return send(message, { method: "sendMessage", text: text + (page < pages ? `\n\nСледећа страна: /icons ${page + 1}` : "") });
    }
    if (["icons", "icon", "ikona", "икона", "иконе"].includes(command)) {
      let icon;
      if (args) {
        const query = norm(args);
        icon = icons.find(i => norm(i.name) === query) || icons.find(i => norm(i.name).includes(query));
      } else {
        const key = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Belgrade",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
        const day = calendar2026[key];
        if (day?.icon) icon = {name:day.title,url:rawUrl(day.icon)};
      }
      if (!icon) return send(message, {method:"sendMessage",text:args ? "Икона није пронађена. Списак: /icons" : "Икона дана још није додата. Изабери икону: /icons"});
      return send(message, {method:"sendPhoto",photo:icon.url,caption:esc(icon.name)});
    }
    if (["citanja", "читања", "dnevnacitanja", "дневначитања", "dnevna_citanja", "дневна_читања"].includes(command)) {
      const key = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Belgrade",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      const day = calendar2026[key];
      return send(message,{method:"sendMessage",text:day ? `📖 <b>Дневна читања</b>\n\nАпостол: ${esc(day.apostle || "Још није уписано")}\nЈеванђеље: ${esc(day.gospel || "Још није уписано")}` : "Читања за данас још нису уписана."});
    }
    const allowed = new Set(["start","help","pomoc","помоћ","komande","commands","команде","ping","test","kalendar","kalnedar","calendar","календар","post","fast","пост","sutra","сутра","nedelja","nedejla","nedelaj","недеља","недејла","tropar","тропар","kondak","кондак","prolog","пролог","svpismo","свписмо","sveto_pismo","свето_писмо","chatid","четид","cid","userid","user_id","ид","корисникид","botstat","botstats","usage","стат","статистика","replydebug","debugreply","reply_debug"]);
    if (!allowed.has(command)) return ok();
    // Normalize bot suffixes and Latin help alias before forwarding.
    update.message.text = `/${command === "pomoc" ? "help" : command}${args ? " " + args : ""}`;
    return app.fetch(new Request(request.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(update)}),env,ctx);
  }
};

async function handleModeration({ message, env, command, args }) {
  if (!env.MOD_STATE) {
    return send(message, { method: "sendMessage", text: "⚠️ MOD_STATE KV binding није подешен." });
  }

  const actorId = String(message.from?.id || "");
  const owner = isOwner(env, actorId);

  if (["modadd", "modremove", "modlist"].includes(command) && !owner) {
    return send(message, { method: "sendMessage", text: "⛔ Само owner може да управља модераторима." });
  }

  if (command === "modadd") {
    const target = message.reply_to_message?.from;
    if (!target?.id) {
      return send(message, { method: "sendMessage", text: "⚠️ Одговори на поруку корисника кога желиш да додаш као мода, па пошаљи <code>/modadd</code>." });
    }

    const targetId = String(target.id);
    if (isOwner(env, targetId)) {
      return send(message, { method: "sendMessage", text: "ℹ️ Тај корисник је већ owner." });
    }
    if (target.is_bot) {
      return send(message, { method: "sendMessage", text: "⛔ Бот не може бити додат као мод." });
    }

    await env.MOD_STATE.put(modKey(message.chat.id, targetId), JSON.stringify({
      userId: targetId,
      username: target.username || "",
      firstName: target.first_name || "",
      lastName: target.last_name || "",
      addedBy: actorId,
      addedAt: new Date().toISOString()
    }));

    return send(message, {
      method: "sendMessage",
      text: `✅ Додат мод: ${formatUser(target)}\n<code>${esc(targetId)}</code>`
    });
  }

  if (command === "modremove") {
    const targetId = getTargetId(message, args);
    if (!targetId) {
      return send(message, { method: "sendMessage", text: "⚠️ Користи reply или User ID. Пример: <code>/modremove 123456789</code>" });
    }

    await env.MOD_STATE.delete(modKey(message.chat.id, targetId));
    return send(message, {
      method: "sendMessage",
      text: `✅ Мод права уклоњена за User ID: <code>${esc(targetId)}</code>`
    });
  }

  if (command === "modlist") {
    const mods = await listMods(env, message.chat.id);
    if (!mods.length) {
      return send(message, { method: "sendMessage", text: "ℹ️ Нема додатих модератора." });
    }

    const lines = mods.map((m, i) => {
      const name = m.username ? `@${m.username}` : [m.firstName, m.lastName].filter(Boolean).join(" ");
      return `${i + 1}. ${esc(name || "Непознат")} — <code>${esc(m.userId)}</code>`;
    });

    return send(message, {
      method: "sendMessage",
      text: `🛡️ <b>Модератори</b>\n\n${lines.join("\n")}`
    });
  }

  if (command === "ban") {
    const actorIsMod = await isModerator(env, message.chat.id, actorId);
    if (!owner && !actorIsMod) {
      return send(message, { method: "sendMessage", text: "⛔ Немаш дозволу за <code>/ban</code>." });
    }

    const target = message.reply_to_message?.from;
    if (!target?.id) {
      return send(message, { method: "sendMessage", text: "⚠️ <code>/ban</code> мора бити reply на поруку корисника кога банујеш." });
    }

    const targetId = String(target.id);

    if (targetId === actorId) {
      return send(message, { method: "sendMessage", text: "⛔ Не можеш бановати самог себе." });
    }
    if (target.is_bot) {
      return send(message, { method: "sendMessage", text: "⛔ Не можеш бановати бота овом командом." });
    }

    const targetIsOwner = isOwner(env, targetId);
    const targetIsMod = await isModerator(env, message.chat.id, targetId);

    if (!owner && targetIsOwner) {
      return send(message, { method: "sendMessage", text: "⛔ Модератор не може бановати owner-а." });
    }

    if (!owner && targetIsMod) {
      return send(message, { method: "sendMessage", text: "⛔ Модератори не могу бановати друге модераторе." });
    }

    const member = await tg(env, "getChatMember", {
      chat_id: message.chat.id,
      user_id: Number(targetId)
    });
    const status = member?.result?.status;

    if (!owner && (status === "creator" || status === "administrator")) {
      return send(message, { method: "sendMessage", text: "⛔ Модератор не може бановати Telegram админа." });
    }

    const banned = await tg(env, "banChatMember", {
      chat_id: message.chat.id,
      user_id: Number(targetId),
      revoke_messages: true
    });

    if (!banned?.ok) {
      return send(message, {
        method: "sendMessage",
        text: `⚠️ Бан није успео: ${esc(banned?.description || "непозната Telegram API грешка")}`
      });
    }

    const repliedMessageId = message.reply_to_message?.message_id;
    if (repliedMessageId) {
      await tg(env, "deleteMessage", {
        chat_id: message.chat.id,
        message_id: repliedMessageId
      });
    }

    const reason = args || "без наведеног разлога";
    const notified = await notifyOwnerOfBan(env, { message, target, reason });
    return send(message, {
      method: "sendMessage",
      text: `✅ <b>Корисник је банован.</b>\nКорисник: ${formatUser(target)}\nUser ID: <code>${esc(targetId)}</code>\nРазлог: ${esc(reason)}` +
        (notified ? "" : "\n⚠️ Приватно обавештење власнику није достављено.")
    });
  }

  return ok();
}


async function notifyOwnerOfBan(env, { message, target, reason }) {
  // Notify the configured owner directly; never send private reports to all admins.
  const ownerId = String(env.OWNER_USER_ID || "").trim();
  if (!/^\d+$/.test(ownerId)) return false;

  const timestamp = new Intl.DateTimeFormat("sr-RS", {
    timeZone: "Europe/Belgrade",
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date());

  const result = await tg(env, "sendMessage", {
    chat_id: Number(ownerId),
    parse_mode: "HTML",
    text:
      `🛡️ <b>Обавештење о бану</b>\n\n` +
      `<b>Група:</b> ${esc(message.chat.title || String(message.chat.id))}\n` +
      `<b>ID групе:</b> <code>${esc(message.chat.id)}</code>\n` +
      `<b>Банован:</b> ${formatUser(target)}\n` +
      `<b>ID корисника:</b> <code>${esc(target.id)}</code>\n` +
      `<b>Бановао:</b> ${formatUser(message.from)}\n` +
      `<b>ID модератора:</b> <code>${esc(message.from.id)}</code>\n` +
      `<b>Разлог:</b> ${esc(String(reason).slice(0, 1000))}\n` +
      `<b>Време (Београд):</b> ${esc(timestamp)}`
  });
  // A blocked bot or unopened private chat must not undo a successful ban.
  return result?.ok === true;
}

function ownerIds(env) {
  return new Set(
    [env.OWNER_USER_ID, ...(String(env.ADMIN_USER_IDS || "").split(","))]
      .map(v => String(v || "").trim())
      .filter(Boolean)
  );
}

function isOwner(env, userId) {
  return ownerIds(env).has(String(userId || ""));
}

function modKey(chatId, userId) {
  return `mod:${chatId}:${userId}`;
}

async function isModerator(env, chatId, userId) {
  if (!userId || !env.MOD_STATE) return false;
  return (await env.MOD_STATE.get(modKey(chatId, userId))) !== null;
}

async function listMods(env, chatId) {
  const prefix = `mod:${chatId}:`;
  const out = [];
  let cursor;

  do {
    const page = await env.MOD_STATE.list({ prefix, cursor });
    for (const key of page.keys || []) {
      const userId = key.name.slice(prefix.length);
      const raw = await env.MOD_STATE.get(key.name);
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch {}
      out.push({
        userId: String(data.userId || userId),
        username: data.username || "",
        firstName: data.firstName || "",
        lastName: data.lastName || ""
      });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return out.sort((a, b) => String(a.userId).localeCompare(String(b.userId)));
}

function getTargetId(message, args) {
  if (message.reply_to_message?.from?.id) return String(message.reply_to_message.from.id);
  const m = String(args || "").match(/\d{5,}/);
  return m ? m[0] : "";
}

async function tg(env, method, body) {
  if (!env.BOT_TOKEN) return { ok: false, description: "BOT_TOKEN није подешен." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    return { ok: false, description: e?.message || "Telegram API грешка" };
  }
}

function formatUser(user) {
  if (!user) return "Непознат";
  if (user.username) return `@${esc(user.username)}`;
  return esc(`${user.first_name || ""} ${user.last_name || ""}`.trim() || String(user.id || "Непознат"));
}

function ok() { return new Response("OK"); }
function send(message, payload) {
  const body = {...payload,chat_id:message.chat.id,parse_mode:"HTML"};
  if (message.message_thread_id != null) body.message_thread_id = message.message_thread_id;
  return new Response(JSON.stringify(body),{headers:{"Content-Type":"application/json"}});
}
function esc(s) { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function rawUrl(s) { return s.replace(/^https:\/\/github.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(?:\?raw=true)?$/, "https://raw.githubusercontent.com/$1/$2/$3/$4"); }
function norm(s) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g,"-"); }
