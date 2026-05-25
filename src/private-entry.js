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

    if (message?.text && !message.from?.is_bot) {
      const originalText = message.text.trim();
      const commandText = originalText.toLowerCase();

      if (isReportCommand(commandText)) {
        return handleReportCommand({ message, env, originalText });
      }
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

  const payload = {
    chat_id: env.ADMIN_CHAT_ID,
    text: report,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (env.ADMIN_THREAD_ID) {
    payload.message_thread_id = Number(env.ADMIN_THREAD_ID);
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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
  if (!message) return "Нема поруке.";
  return message.text || message.caption || "[порука нема текст, могуће слика/стикер/фајл]";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
