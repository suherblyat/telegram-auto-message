import originalWorker from "./index.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return originalWorker.fetch(request, env, ctx);
    }

    const clonedRequest = request.clone();

    let update;
    try {
      update = await clonedRequest.json();
    } catch {
      return originalWorker.fetch(request, env, ctx);
    }

    const message = update.message || update.edited_message;

    if (!message || message.from?.is_bot) {
      return originalWorker.fetch(request, env, ctx);
    }

    const originalText = getMessageText(message).trim();
    const commandText = String(message.text || "").trim().toLowerCase();

    if (message.text && isReportCommand(commandText)) {
      return handleReportCommand({ message, env, originalText: message.text.trim() });
    }

    const hardDecision = await hardModerationCheck({ message, env, originalText });
    if (hardDecision) {
      return hardDecision;
    }

    return originalWorker.fetch(request, env, ctx);
  }
};

function isReportCommand(text) {
  const commands = ["/prijava", "/prijavi", "/пријава", "/пријави", "/report"];
  return commands.some((command) =>
    text === command ||
    text.startsWith(command + " ") ||
    text.startsWith(command + "@")
  );
}

async function handleReportCommand({ message, env, originalText }) {
  const chatId = message.chat.id;
  const threadId = message.message_thread_id;
  const details = getReportDetails(originalText);

  if (!message.reply_to_message && !details.note && !details.mentionedUser) {
    return sendGroupMessage(
      chatId,
      "☦️ <b>Пријава</b>\n\nМожеш овако:\n• reply на поруку + <code>/пријави</code>\n• <code>/пријави @username</code>\n• <code>/пријави @username објашњење</code>\n• <code>/пријави објашњење проблема</code>",
      threadId
    );
  }

  const result = await sendUserReport({ env, message, chatId, threadId, details });

  if (result.ok) {
    return sendGroupMessage(chatId, "✅ Пријава је послата админима.", threadId);
  }

  return sendGroupMessage(
    chatId,
    `⚠️ Пријава није послата. Разлог: ${escapeHtml(result.description || "непозната грешка")}`,
    threadId
  );
}

async function hardModerationCheck({ message, env, originalText }) {
  const chatId = message.chat.id;
  const threadId = message.message_thread_id;
  const text = normalizeText(originalText);
  const userId = message.from?.id;

  if (!userId) return null;

  const mediaDecision = getBlockedMediaDecision(message, env);
  const textDecision = getSevereTextDecision(text);
  const decision = textDecision || mediaDecision;

  if (!decision) return null;

  const status = await getMemberStatus({ env, chatId, userId });
  const isPrivileged = status === "creator" || status === "administrator";

  if (isPrivileged) {
    await sendAdminAlert({
      env,
      title: "High risk од admin-а/owner-а",
      severity: "HIGH",
      action: "admin_exempt",
      reason: decision.reason,
      message,
      originalText,
      extra: "Бот не банује admin/owner налоге. Провери ручно."
    });
    return sendGroupMessage(chatId, "☦️ <b>Опомена</b>\n\nПорука је означена као тежак прекршај, али корисник је admin/owner. Админи су обавештени.", threadId);
  }

  const deleteResult = await telegramApi(env, "deleteMessage", {
    chat_id: chatId,
    message_id: message.message_id
  });

  const banResult = await telegramApi(env, "banChatMember", {
    chat_id: chatId,
    user_id: userId,
    revoke_messages: true
  });

  await sendAdminAlert({
    env,
    title: banResult.ok ? "High risk ban" : "High risk ban није успео",
    severity: banResult.ok ? "CRITICAL" : "ERROR",
    action: "delete_and_ban",
    reason: decision.reason,
    message,
    originalText,
    extra:
      `deleteMessage: ${JSON.stringify(deleteResult)}\n` +
      `banChatMember: ${JSON.stringify(banResult)}\n` +
      "Бот је покушао да обрише поруку и трајно банује корисника. За брисање старијих порука користи се Telegram revoke_messages, колико Telegram дозволи."
  });

  if (!banResult.ok) {
    return sendGroupMessage(chatId, "⚠️ Тежак прекршај је детектован, али ban није успео. Провери да ли бот има Ban users и Delete messages дозволе.", threadId);
  }

  return sendGroupMessage(chatId, "⛔ Корисник је уклоњен из групе због тешког прекршаја.", threadId);
}

function getBlockedMediaDecision(message, env) {
  const mediaLockdown = String(env.MEDIA_LOCKDOWN || "false").toLowerCase() === "true";
  if (!mediaLockdown) return null;

  if (hasAnyMedia(message)) {
    return { reason: "media lockdown је укључен: медија није дозвољена за non-admin кориснике" };
  }

  return null;
}

function hasAnyMedia(message) {
  const isGifDocument = message.document?.mime_type === "image/gif";
  return Boolean(
    message.photo ||
    message.video ||
    message.animation ||
    message.sticker ||
    message.audio ||
    message.voice ||
    message.video_note ||
    message.document ||
    isGifDocument
  );
}

function getSevereTextDecision(text) {
  if (!text) return null;

  const hasSacredTarget = includesAny(text, SACRED_TARGETS);
  const hasHardRoot = includesAny(text, HARD_ROOTS);
  const hasSexualTopic = includesAny(text, SEXUAL_ROOTS);
  const hasDirectAttack = includesAny(text, ATTACK_PATTERNS);

  if (hasSacredTarget && hasHardRoot) {
    return { reason: "псовка или вулгарност усмерена на светињу" };
  }

  if (hasSexualTopic && hasHardRoot) {
    return { reason: "вулгаран/саблажњив сексуални говор" };
  }

  if (hasDirectAttack && hasHardRoot) {
    return { reason: "тешка лична увреда са вулгарношћу" };
  }

  return null;
}

function getReportDetails(originalText) {
  const note = originalText.replace(/^\/\S+\s*/u, "").trim();
  const mentionedUser = (note.match(/@[a-zA-Z0-9_]{3,32}/) || [""])[0];
  return { note, mentionedUser };
}

async function sendUserReport({ env, message, chatId, threadId, details }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) {
    return { ok: false, description: "BOT_TOKEN или ADMIN_CHAT_ID није подешен." };
  }

  const reporter = formatUser(message.from);
  const reportedMessage = message.reply_to_message;
  const reportedUser = reportedMessage ? formatUser(reportedMessage.from) : (details.mentionedUser || "Није наведено");
  const reportedId = reportedMessage?.from?.id || "није познат";
  const reportedText = reportedMessage ? getMessageText(reportedMessage) : "Нема reply поруке. Пријава је послата преко текста команде.";

  const report = `🚩 <b>Корисничка пријава</b>\n\n` +
    `<b>Пријавио:</b> ${escapeHtml(reporter)}\n` +
    `<b>Reporter ID:</b> ${escapeHtml(message.from?.id || "?")}\n` +
    `<b>Пријављен:</b> ${escapeHtml(reportedUser)}\n` +
    `<b>Reported ID:</b> ${escapeHtml(reportedId)}\n` +
    `<b>Chat ID:</b> ${escapeHtml(chatId)}\n` +
    `<b>Thread ID:</b> ${escapeHtml(threadId || "нема")}\n` +
    `<b>Message ID:</b> ${escapeHtml(reportedMessage?.message_id || "нема reply-а")}\n` +
    (details.note ? `<b>Напомена:</b> ${escapeHtml(details.note.slice(0, 1000))}\n` : "") +
    `\n<b>Пријављена порука:</b>\n${escapeHtml(reportedText.slice(0, 3000))}`;

  return sendAdminRaw(env, report);
}

async function sendAdminAlert({ env, title, severity, action, reason, message, originalText, extra }) {
  const report = `⚠️ <b>${escapeHtml(title)}</b>\n\n` +
    `<b>Корисник:</b> ${escapeHtml(formatUser(message.from))}\n` +
    `<b>User ID:</b> ${escapeHtml(message.from?.id || "?")}\n` +
    `<b>Chat ID:</b> ${escapeHtml(message.chat?.id || "?")}\n` +
    `<b>Thread ID:</b> ${escapeHtml(message.message_thread_id || "нема")}\n` +
    `<b>Message ID:</b> ${escapeHtml(message.message_id || "?")}\n` +
    `<b>Ниво:</b> ${escapeHtml(severity)}\n` +
    `<b>Акција:</b> ${escapeHtml(action)}\n` +
    `<b>Разлог:</b> ${escapeHtml(reason)}\n\n` +
    `<b>Порука:</b>\n${escapeHtml(originalText.slice(0, 3000))}\n\n` +
    `<b>Технички детаљи:</b>\n${escapeHtml(extra || "-")}`;

  return sendAdminRaw(env, report);
}

async function sendAdminRaw(env, text) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) {
    return { ok: false, description: "BOT_TOKEN или ADMIN_CHAT_ID није подешен." };
  }

  const payload = {
    chat_id: env.ADMIN_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (env.ADMIN_THREAD_ID) {
    payload.message_thread_id = Number(env.ADMIN_THREAD_ID);
  }

  return telegramApi(env, "sendMessage", payload);
}

async function getMemberStatus({ env, chatId, userId }) {
  const result = await telegramApi(env, "getChatMember", { chat_id: chatId, user_id: userId });
  return result?.result?.status || "unknown";
}

async function telegramApi(env, method, body) {
  if (!env.BOT_TOKEN) return { ok: false, description: "BOT_TOKEN није подешен." };

  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (error) {
    return { ok: false, description: error?.message || "Telegram request није успео." };
  }
}

function sendGroupMessage(chatId, text, threadId = undefined) {
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

function getMessageText(message) {
  if (!message) return "";
  return message.text || message.caption || "";
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/š/g, "s").replace(/č/g, "c").replace(/ć/g, "c").replace(/ž/g, "z").replace(/đ/g, "dj")
    .replace(/ђ/g, "дј")
    .replace(/[0]/g, "o").replace(/[1!]/g, "i").replace(/[3]/g, "e").replace(/[4@]/g, "a").replace(/[5$]/g, "s").replace(/[7]/g, "t")
    .replace(/[?.:,;()\[\]{}"'`´“”‘’_+=*~|\\/<>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function s(...codes) {
  return String.fromCharCode(...codes);
}

const HARD_ROOTS = [
  s(106, 101, 98),
  s(107, 117, 114),
  s(112, 105, 122),
  s(112, 105, 99, 107),
  s(103, 111, 118, 110),
  s(115, 114, 97, 110),
  s(111, 100, 106, 101, 98),
  s(111, 108, 111, 115),
  s(111, 108, 111, 353),
  s(111, 108, 111, 115),
  s(111, 108, 111, 115),
  s(108, 111, 112, 111, 118),
  s(111, 108, 111, 353),
  s(111, 108, 111, 115),
  s(108, 111, 112, 111, 118),
  "јеб", "кур", "пиз", "пич", "говн", "срањ", "одјеб", "олош", "лопов"
];

const SEXUAL_ROOTS = [
  "блуд", "разврат", "порно", "секс", "проститу", "похот", "голотињ",
  "blud", "razvrat", "porno", "seks", "prostitu", "pohot", "golotinj"
];

const SACRED_TARGETS = [
  "бог", "господ", "исус", "христ", "свети дух", "богородиц", "пресвет", "светитељ", "икон", "крст", "литурги", "причешћ", "јеванђељ", "цркв", "храм", "манастир", "мошт",
  "bog", "gospod", "isus", "hrist", "sveti duh", "bogorodic", "presvet", "svetitelj", "ikon", "krst", "liturg", "pricesc", "jevandjel", "crkv", "hram", "manastir", "most"
];

const ATTACK_PATTERNS = [
  "мајку ти", "маму ти", "матер ти", "majku ti", "mamu ti", "mater ti",
  "глуп си", "glup si", "дебил", "debil", "идиот", "idiot", "ретард", "retard",
  "будало", "budalo", "стоко", "stoko"
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
