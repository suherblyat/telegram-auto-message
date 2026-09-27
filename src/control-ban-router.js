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
    const chatId = String(message.chat.id);
    const targetChatId = String(env.TARGET_CHAT_ID || DEFAULT_TARGET_CHAT_ID);
    const threadId = message.message_thread_id;

    if (isCommand(lower, ["/modadd", "/модадд"])) {
      return manageModerator({ env, message, chatId, targetChatId, threadId, action: "add" });
    }

    if (isCommand(lower, ["/modremove", "/модремове"])) {
      return manageModerator({ env, message, chatId, targetChatId, threadId, action: "remove" });
    }

    if (!isCommand(lower, ["/ban", "/бан"])) return app.fetch(request, env, ctx);

    if (chatId !== targetChatId) {
      return send(message.chat.id, "⛔ /ban ради само у главној групи као reply на поруку.", threadId);
    }

    const actorId = String(message.from?.id || "");
    const allowed = await isAllowedModerator(env, targetChatId, actorId);

    if (!allowed) {
      return new Response("OK", { status: 200 });
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

async function manageModerator({ env, message, chatId, targetChatId, threadId, action }) {
  if (chatId !== targetChatId) {
    return send(message.chat.id, "⛔ Ова команда ради само у главној групи.", threadId);
  }

  const actorId = String(message.from?.id || "");
  const actorStatus = await tg(env, "getChatMember", {
    chat_id: targetChatId,
    user_id: Number(actorId)
  });

  if (!actorStatus?.ok || actorStatus.result?.status !== "creator") {
    return send(message.chat.id, "⛔ Само owner групе може да мења ban модераторе.", threadId);
  }

  const target = message.reply_to_message?.from;
  if (!target?.id || target.is_bot) {
    return send(
      message.chat.id,
      action === "add"
        ? "⚠️ Reply-уј на поруку човека коме желиш да даш право и напиши <code>/modadd</code>."
        : "⚠️ Reply-уј на поруку човека коме желиш да одузмеш право и напиши <code>/modremove</code>.",
      threadId
    );
  }

  if (!env.MOD_STATE) {
    return send(message.chat.id, "❌ MOD_STATE KV није повезан, не могу да сачувам whitelist.", threadId);
  }

  const targetId = String(target.id);
  const key = moderatorKey(targetChatId, targetId);

  try {
    if (action === "add") {
      await env.MOD_STATE.put(key, JSON.stringify({
        userId: targetId,
        username: target.username || "",
        addedBy: actorId,
        addedAt: new Date().toISOString()
      }));
      return send(message.chat.id, `✅ ${esc(formatUser(target))} сада може да користи reply + <code>/ban разлог</code>.`, threadId);
    }

    await env.MOD_STATE.delete(key);
    return send(message.chat.id, `✅ ${esc(formatUser(target))} више нема право на /ban.`, threadId);
  } catch (error) {
    return send(message.chat.id, `❌ Нисам успео да изменим whitelist: ${esc(error?.message || "KV грешка")}`, threadId);
  }
}

async function isAllowedModerator(env, chatId, userId) {
  if (!userId) return false;

  const staticIds = getAllowedUserIds(env);
  if (staticIds.includes(String(userId))) return true;

  if (!env.MOD_STATE) return false;

  try {
    const value = await env.MOD_STATE.get(moderatorKey(chatId, userId));
    return Boolean(value);
  } catch {
    return false;
  }
}

function moderatorKey(chatId, userId) {
  return `banmod:${chatId}:${userId}`;
}

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

function formatUser(user) {
  if (!user) return "Непознат";
  if (user.username) return `@${user.username}`;
  return `${user.first_name || ""} ${user.last_name || ""}`.trim() || String(user.id || "Непознат");
}

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
