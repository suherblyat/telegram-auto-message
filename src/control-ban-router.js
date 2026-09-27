import app from "./userid-router.js";

const DEFAULT_TARGET_CHAT_ID = "-1001861714695";

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

    const text = message.text.trim();
    const lower = text.toLowerCase();
    if (!isCommand(lower, ["/ban", "/бан"])) return app.fetch(request, env, ctx);

    const chatId = String(message.chat.id);
    const targetChatId = String(env.TARGET_CHAT_ID || DEFAULT_TARGET_CHAT_ID);
    const threadId = message.message_thread_id;

    if (chatId !== targetChatId) {
      return send(message.chat.id, "⛔ /ban ради само у главној групи као reply на поруку.", threadId);
    }

    const allowed = getAllowedUserIds(env);
    const actorId = String(message.from?.id || "");

    if (!allowed.length || !allowed.includes(actorId)) {
      return send(message.chat.id, "⛔ Немаш дозволу за /ban.", threadId);
    }

    const replied = message.reply_to_message;
    const target = replied?.from;

    if (!replied || !target?.id) {
      return send(message.chat.id, "⚠️ Reply-уј директно на поруку корисника и напиши <code>/ban разлог</code>.", threadId);
    }

    if (target.is_bot || String(target.id) === actorId) {
      return send(message.chat.id, "⛔ Тај налог не може бити банован овом командом.", threadId);
    }

    const reason = text.replace(/^\/\S+\s*/u, "").trim().slice(0, 500);
    if (!reason) {
      return send(message.chat.id, "⚠️ Додај разлог. Пример: <code>/ban спам</code>", threadId);
    }

    const status = await tg(env, "getChatMember", {
      chat_id: targetChatId,
      user_id: Number(target.id)
    });

    if (!status?.ok) {
      return send(message.chat.id, "❌ Не могу да проверим корисника пре ban-а.", threadId);
    }

    const memberStatus = status.result?.status;
    if (memberStatus === "creator" || memberStatus === "administrator") {
      return send(message.chat.id, "⛔ Owner/admin не може бити банован овом командом.", threadId);
    }

    const result = await tg(env, "banChatMember", {
      chat_id: targetChatId,
      user_id: Number(target.id),
      revoke_messages: true
    });

    if (!result?.ok) {
      return send(message.chat.id, `❌ Ban није успео: ${esc(result?.description || "непозната грешка")}`, threadId);
    }

    return send(message.chat.id, `✅ Корисник је банован.\nРазлог: ${esc(reason)}`, threadId);
  }
};

function getAllowedUserIds(env) {
  const raw = String(env.CONTROL_USER_IDS || env.MODERATOR_USER_IDS || "").trim();
  return raw ? raw.split(",").map((x) => x.trim()).filter(Boolean) : [];
}

function isCommand(text, commands) {
  return commands.some((command) => text === command || text.startsWith(command + " ") || text.startsWith(command + "@"));
}

async function tg(env, method, body) {
  if (!env.BOT_TOKEN) return { ok: false, description: "BOT_TOKEN није подешен." };
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (error) {
    return { ok: false, description: error?.message || "Telegram API грешка." };
  }
}

function send(chatId, text, threadId) {
  const body = {
    method: "sendMessage",
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (threadId !== undefined && threadId !== null) body.message_thread_id = threadId;
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
