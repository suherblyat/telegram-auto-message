import app from "./userid-router.js";

const DEFAULT_CONTROL_CHAT_ID = "-1003745214852";
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

    const chatId = String(message.chat.id);
    const threadId = message.message_thread_id;
    const text = message.text.trim();
    const lower = text.toLowerCase();

    if (!isCommand(lower, ["/ban", "/бан"])) {
      return app.fetch(request, env, ctx);
    }

    const controlChatId = String(env.CONTROL_CHAT_ID || DEFAULT_CONTROL_CHAT_ID);
    const targetChatId = String(env.TARGET_CHAT_ID || DEFAULT_TARGET_CHAT_ID);

    if (chatId !== controlChatId) {
      return sendMessage(message.chat.id, "⛔ Команда /ban ради само у посебној control групи.", threadId);
    }

    const parsed = parseBanCommand(text);
    const target = await resolveTargetUser({ env, targetText: parsed.targetText, targetChatId, controlChatId });

    if (!target.id) {
      return sendMessage(
        message.chat.id,
        "⚠️ Нисам нашао корисника.\n\nКористи:\n<code>/ban 123456789 разлог</code>\n\nИли:\n<code>/ban @username разлог</code>\n\nUsername ради само ако је бот већ видео тог корисника у групи.",
        threadId
      );
    }

    if (!parsed.reason) {
      return sendMessage(
        message.chat.id,
        `⚠️ Додај разлог.\n\nПример:\n<code>/ban ${escapeHtml(target.label || target.id)} богохулни спам</code>`,
        threadId
      );
    }

    const result = await telegramApi(env, "banChatMember", {
      chat_id: targetChatId,
      user_id: Number(target.id),
      revoke_messages: true
    });

    if (env.MOD_STATE) {
      await env.MOD_STATE.delete(`warn:${targetChatId}:${target.id}`);
    }

    await notifyAdmin(env, {
      actor: message.from,
      target,
      targetChatId,
      reason: parsed.reason,
      result
    });

    if (!result.ok) {
      return sendMessage(
        message.chat.id,
        `❌ Ban није успео.\n\nUser ID: <code>${escapeHtml(target.id)}</code>\nРазлог: ${escapeHtml(result.description || "непозната грешка")}`,
        threadId
      );
    }

    return sendMessage(
      message.chat.id,
      `✅ Корисник је избачен из главне групе.\n\nUser ID: <code>${escapeHtml(target.id)}</code>\nРазлог: ${escapeHtml(parsed.reason)}\nОпомене су ресетоване.`,
      threadId
    );
  }
};

function parseBanCommand(text) {
  const args = text.replace(/^\/\S+\s*/u, "").trim();
  const targetMatch = args.match(/^(@[a-zA-Z0-9_]{3,32}|\d{5,})/);

  if (!targetMatch) {
    return { targetText: "", reason: "" };
  }

  const targetText = targetMatch[1];
  const reason = args.slice(targetText.length).trim().slice(0, 500);

  return { targetText, reason };
}

async function resolveTargetUser({ env, targetText, targetChatId, controlChatId }) {
  const idMatch = String(targetText || "").match(/\d{5,}/);
  if (idMatch) {
    return { id: idMatch[0], label: idMatch[0] };
  }

  const username = (String(targetText || "").match(/@[a-zA-Z0-9_]{3,32}/) || [""])[0]
    .replace("@", "")
    .toLowerCase();

  if (!username || !env.MOD_STATE) {
    return { id: "", label: username ? `@${username}` : "" };
  }

  const fromTarget = await env.MOD_STATE.get(`userbyname:${targetChatId}:${username}`, "json");
  if (fromTarget?.id) {
    return { id: String(fromTarget.id), label: `@${username}` };
  }

  const fromControl = await env.MOD_STATE.get(`userbyname:${controlChatId}:${username}`, "json");
  if (fromControl?.id) {
    return { id: String(fromControl.id), label: `@${username}` };
  }

  return { id: "", label: `@${username}` };
}

async function notifyAdmin(env, { actor, target, targetChatId, reason, result }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return;

  const text =
    `⛔ <b>Control ban</b>\n\n` +
    `<b>Покренуо:</b> ${escapeHtml(formatUser(actor))}\n` +
    `<b>Target:</b> ${escapeHtml(target.label || target.id)}\n` +
    `<b>User ID:</b> <code>${escapeHtml(target.id)}</code>\n` +
    `<b>Target chat:</b> <code>${escapeHtml(targetChatId)}</code>\n` +
    `<b>Разлог:</b> ${escapeHtml(reason || "није наведен")}\n` +
    `<b>Result:</b> <code>${escapeHtml(JSON.stringify(result))}</code>`;

  await telegramApi(env, "sendMessage", {
    chat_id: env.ADMIN_CHAT_ID,
    message_thread_id: env.ADMIN_THREAD_ID ? Number(env.ADMIN_THREAD_ID) : undefined,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}

async function telegramApi(env, method, body) {
  if (!env.BOT_TOKEN) {
    return { ok: false, description: "BOT_TOKEN није подешен." };
  }

  try {
    const cleanBody = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    );

    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cleanBody)
    });

    return await response.json();
  } catch (error) {
    return { ok: false, description: error?.message || "Telegram API грешка." };
  }
}

function isCommand(text, commands) {
  return commands.some((command) =>
    text === command ||
    text.startsWith(command + " ") ||
    text.startsWith(command + "@")
  );
}

function sendMessage(chatId, text, threadId) {
  const payload = {
    method: "sendMessage",
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (threadId !== undefined && threadId !== null) {
    payload.message_thread_id = threadId;
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function formatUser(user) {
  if (!user) return "Непознат";
  if (user.username) return `@${user.username}`;
  return `${user.first_name || ""} ${user.last_name || ""}`.trim() || String(user.id || "Непознат");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
