import app from "./safety-fix-router.js";

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
    if (!message?.text || message.from?.is_bot) return app.fetch(request, env, ctx);

    const chatId = message.chat.id;
    const threadId = message.message_thread_id;
    const text = message.text.trim();
    const lower = text.toLowerCase();

    await rememberUser(env, chatId, message.from);

    if (!isCmd(lower, ["/userid", "/user_id", "/ид", "/корисникид"])) {
      return app.fetch(request, env, ctx);
    }

    if (message.reply_to_message?.from?.id) {
      const u = message.reply_to_message.from;
      await rememberUser(env, chatId, u);
      return send(chatId, `🆔 <b>User ID</b>\n\nКорисник: ${esc(formatUser(u))}\nUser ID: <code>${esc(u.id)}</code>`, threadId);
    }

    const username = (text.match(/@[a-zA-Z0-9_]{3,32}/) || [""])[0].replace("@", "").toLowerCase();
    if (username) {
      if (!env.MOD_STATE) return send(chatId, "⚠️ MOD_STATE није подешен, не могу да тражим username из меморије.", threadId);
      const found = await env.MOD_STATE.get(`userbyname:${chatId}:${username}`, "json");
      if (found?.id) {
        return send(chatId, `🆔 <b>User ID</b>\n\nКорисник: @${esc(username)}\nUser ID: <code>${esc(found.id)}</code>`, threadId);
      }
      return send(chatId, `⚠️ Немам ID за @${esc(username)}. Нека тај корисник пошаље нешто у групу, па онда пробај поново.`, threadId);
    }

    const u = message.from;
    return send(chatId, `🆔 <b>Твој User ID</b>\n\nКорисник: ${esc(formatUser(u))}\nUser ID: <code>${esc(u.id)}</code>`, threadId);
  }
};

async function rememberUser(env, chatId, user) {
  if (!env.MOD_STATE || !user?.id) return;
  if (user.username) {
    await env.MOD_STATE.put(`userbyname:${chatId}:${String(user.username).toLowerCase()}`, JSON.stringify({ id: String(user.id), username: user.username, updatedAt: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
  }
  await env.MOD_STATE.put(`userbyid:${chatId}:${user.id}`, JSON.stringify({ id: String(user.id), username: user.username || "", name: formatUser(user), updatedAt: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
}

function isCmd(t, arr) {
  return arr.some((c) => t === c || t.startsWith(c + " ") || t.startsWith(c + "@"));
}

function send(chatId, text, threadId) {
  const payload = { method: "sendMessage", chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (threadId !== undefined && threadId !== null) payload.message_thread_id = threadId;
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

function formatUser(user) {
  if (!user) return "Непознат";
  if (user.username) return `@${user.username}`;
  return `${user.first_name || ""} ${user.last_name || ""}`.trim() || String(user.id || "Непознат");
}

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
