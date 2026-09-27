import app from "./userid-router.js";

const DEFAULT_CONTROL_CHAT_IDS = "-1003745214852";
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

    const targetChatId = String(env.TARGET_CHAT_ID || DEFAULT_TARGET_CHAT_ID);
    const controlChatIds = getControlChatIds(env);
    const allowedUserIds = getAllowedUserIds(env);
    const actorId = String(message.from?.id || "");

    // Fail closed: delegated bans do not work until an explicit moderator whitelist exists.
    if (allowedUserIds.length === 0) {
      return sendMessage(
        message.chat.id,
        "⛔ /ban је закључан. CONTROL_USER_IDS whitelist још није подешен.",
        threadId
      );
    }

    if (!allowedUserIds.includes(actorId)) {
      await notifyUnauthorizedAttempt(env, {
        actor: message.from,
        sourceChatId: chatId,
        sourceThreadId: threadId,
        rawCommand: text
      });

      return sendMessage(
        message.chat.id,
        "⛔ Немаш дозволу за /ban. Ниси на whitelist-и модератора бота.",
        threadId
      );
    }

    // Preferred mode: in the main group, reply directly to the offending message.
    // Example: reply -> /ban спам
    if (chatId === targetChatId) {
      return handleReplyBan({ env, message, chatId, threadId, text, targetChatId });
    }

    // Fallback mode: remote control group can still ban by numeric ID or remembered username.
    if (controlChatIds.includes(chatId)) {
      return handleControlGroupBan({ env, message, chatId, threadId, text, targetChatId, controlChatIds });
    }

    return sendMessage(
      message.chat.id,
      "⛔ /ban ради само у главној групи преко reply-а или у овлашћеној control групи.",
      threadId
    );
  }
};

async function handleReplyBan({ env, message, chatId, threadId, text, targetChatId }) {
  const replied = message.reply_to_message;
  const targetUser = replied?.from;
  const reason = getReplyBanReason(text);

  if (!replied) {
    return sendMessage(
      message.chat.id,
      "⚠️ У главној групи /ban ради само као reply на поруку корисника.\n\nПример: reply на спам поруку → <code>/ban спам</code>",
      threadId
    );
  }

  if (!targetUser?.id) {
    return sendMessage(
      message.chat.id,
      "⛔ Не могу безбедно да утврдим User ID из те поруке. Ово се дешава код channel/anonymous admin порука, па бан није извршен.",
      threadId
    );
  }

  if (targetUser.is_bot) {
    return sendMessage(message.chat.id, "⛔ Ова команда не банује ботове.", threadId);
  }

  if (String(targetUser.id) === String(message.from?.id || "")) {
    return sendMessage(message.chat.id, "⛔ Не можеш овом командом да банујеш самог себе.", threadId);
  }

  if (!reason) {
    return sendMessage(
      message.chat.id,
      "⚠️ Додај кратак разлог.\n\nПример: <code>/ban спам</code>",
      threadId
    );
  }

  const target = {
    id: String(targetUser.id),
    label: formatUser(targetUser)
  };

  return executeBan({
    env,
    message,
    sourceChatId: chatId,
    sourceThreadId: threadId,
    target,
    targetChatId,
    reason,
    mode: "reply"
  });
}

async function handleControlGroupBan({ env, message, chatId, threadId, text, targetChatId, controlChatIds }) {
  const parsed = parseControlBanCommand(text);
  const controlChatIdForLookup = controlChatIds[0] || DEFAULT_CONTROL_CHAT_IDS;

  const target = await resolveTargetUser({
    env,
    targetText: parsed.targetText,
    targetChatId,
    controlChatId: chatId,
    fallbackControlChatId: controlChatIdForLookup
  });

  if (!target.id) {
    return sendMessage(
      message.chat.id,
      "⚠️ Нисам нашао корисника.\n\nКористи:\n<code>/ban 123456789 разлог</code>\n\nИли:\n<code>/ban @username разлог</code>\n\nНајпоузданије је користити User ID.",
      threadId
    );
  }

  if (!parsed.reason) {
    return sendMessage(
      message.chat.id,
      `⚠️ Додај разлог.\n\nПример:\n<code>/ban ${escapeHtml(target.label || target.id)} спам</code>`,
      threadId
    );
  }

  return executeBan({
    env,
    message,
    sourceChatId: chatId,
    sourceThreadId: threadId,
    target,
    targetChatId,
    reason: parsed.reason,
    mode: "control"
  });
}

async function executeBan({ env, message, sourceChatId, sourceThreadId, target, targetChatId, reason, mode }) {
  const status = await telegramApi(env, "getChatMember", {
    chat_id: targetChatId,
    user_id: Number(target.id)
  });

  if (!status?.ok) {
    return sendMessage(
      message.chat.id,
      `❌ Не могу да проверим корисника пре ban-а.\n\nUser ID: <code>${escapeHtml(target.id)}</code>\nРазлог: ${escapeHtml(status?.description || "непозната Telegram грешка")}`,
      sourceThreadId
    );
  }

  const targetStatus = status?.result?.status || "unknown";
  if (targetStatus === "creator" || targetStatus === "administrator") {
    return sendMessage(
      message.chat.id,
      `⛔ Не могу да банујем owner/admin налог преко ове команде.\n\nUser ID: <code>${escapeHtml(target.id)}</code>`,
      sourceThreadId
    );
  }

  const result = await telegramApi(env, "banChatMember", {
    chat_id: targetChatId,
    user_id: Number(target.id),
    // Safer default: do not wipe the user's full message history automatically.
    revoke_messages: false
  });

  if (result.ok && env.MOD_STATE) {
    try {
      await env.MOD_STATE.delete(`warn:${targetChatId}:${target.id}`);
    } catch {
      // A successful Telegram ban must not be reported as failed just because KV cleanup failed.
    }
  }

  await notifyAdmin(env, {
    actor: message.from,
    sourceChatId,
    sourceThreadId,
    target,
    targetChatId,
    reason,
    result,
    mode
  });

  if (!result.ok) {
    return sendMessage(
      message.chat.id,
      `❌ Ban није успео.\n\nUser ID: <code>${escapeHtml(target.id)}</code>\nРазлог: ${escapeHtml(result.description || "непозната грешка")}`,
      sourceThreadId
    );
  }

  return sendMessage(
    message.chat.id,
    `✅ Корисник је банован.\n\nКорисник: ${escapeHtml(target.label || target.id)}\nUser ID: <code>${escapeHtml(target.id)}</code>\nРазлог: ${escapeHtml(reason)}`,
    sourceThreadId
  );
}

function getControlChatIds(env) {
  const raw = String(env.CONTROL_CHAT_IDS || env.CONTROL_CHAT_ID || DEFAULT_CONTROL_CHAT_IDS);
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

function getAllowedUserIds(env) {
  const raw = String(env.CONTROL_USER_IDS || env.MODERATOR_USER_IDS || "").trim();
  if (!raw) return [];
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

function getReplyBanReason(text) {
  return String(text || "")
    .replace(/^\/\S+\s*/u, "")
    .trim()
    .slice(0, 500);
}

function parseControlBanCommand(text) {
  const args = text.replace(/^\/\S+\s*/u, "").trim();
  const targetMatch = args.match(/^(@[a-zA-Z0-9_]{3,32}|\d{5,})/);

  if (!targetMatch) {
    return { targetText: "", reason: "" };
  }

  const targetText = targetMatch[1];
  const reason = args.slice(targetText.length).trim().slice(0, 500);

  return { targetText, reason };
}

async function resolveTargetUser({ env, targetText, targetChatId, controlChatId, fallbackControlChatId }) {
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

  const fromCurrentControl = await env.MOD_STATE.get(`userbyname:${controlChatId}:${username}`, "json");
  if (fromCurrentControl?.id) {
    return { id: String(fromCurrentControl.id), label: `@${username}` };
  }

  if (fallbackControlChatId && fallbackControlChatId !== controlChatId) {
    const fromFallbackControl = await env.MOD_STATE.get(`userbyname:${fallbackControlChatId}:${username}`, "json");
    if (fromFallbackControl?.id) {
      return { id: String(fromFallbackControl.id), label: `@${username}` };
    }
  }

  return { id: "", label: `@${username}` };
}

async function notifyAdmin(env, { actor, sourceChatId, sourceThreadId, target, targetChatId, reason, result, mode }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return;

  const text =
    `⛔ <b>Delegated ban</b>\n\n` +
    `<b>Mode:</b> ${escapeHtml(mode || "?")}\n` +
    `<b>Покренуо:</b> ${escapeHtml(formatUser(actor))}\n` +
    `<b>Actor ID:</b> <code>${escapeHtml(actor?.id || "?")}</code>\n` +
    `<b>Source chat:</b> <code>${escapeHtml(sourceChatId || "?")}</code>\n` +
    `<b>Thread:</b> <code>${escapeHtml(sourceThreadId || "нема")}</code>\n` +
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

async function notifyUnauthorizedAttempt(env, { actor, sourceChatId, sourceThreadId, rawCommand }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return;

  const text =
    `⚠️ <b>Неовлашћен /ban покушај</b>\n\n` +
    `<b>Корисник:</b> ${escapeHtml(formatUser(actor))}\n` +
    `<b>User ID:</b> <code>${escapeHtml(actor?.id || "?")}</code>\n` +
    `<b>Chat:</b> <code>${escapeHtml(sourceChatId || "?")}</code>\n` +
    `<b>Thread:</b> <code>${escapeHtml(sourceThreadId || "нема")}</code>\n` +
    `<b>Команда:</b> <code>${escapeHtml(rawCommand || "")}</code>`;

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
