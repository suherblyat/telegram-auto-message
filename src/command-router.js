import guardedWorker from "./public-warning-guard.js";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return guardedWorker.fetch(request, env, ctx);
    }

    const clonedRequest = request.clone();

    let update;
    try {
      update = await clonedRequest.json();
    } catch {
      return guardedWorker.fetch(request, env, ctx);
    }

    const message = update.message || update.edited_message;

    if (!message?.text) {
      return guardedWorker.fetch(request, env, ctx);
    }

    const text = message.text.trim();
    const lower = text.toLowerCase();

    if (isCommand(lower, ["/citanja", "/читања", "/dnevnacitanja", "/дневначитања", "/dnevna_citanja", "/дневна_читања"])) {
      const rewritten = rewriteMessageText(update, "/svpismo");
      return guardedWorker.fetch(jsonRequest(request, rewritten), env, ctx);
    }

    if (isCommand(lower, ["/svpismo", "/свписмо"]) && !getCommandArgs(text)) {
      return sendGroupMessage(
        message.chat.id,
        "📖 <b>Цитат из Светог Писма</b>\n\nЗа цитат унеси и место:\n<code>/свписмо Римљанима 2:14-15</code>\n<code>/svpismo Jovan 3:16</code>\n\nЗа дневна читања користи:\n<code>/читања</code>",
        message.message_thread_id
      );
    }

    return guardedWorker.fetch(request, env, ctx);
  }
};

function isCommand(text, commands) {
  return commands.some((command) =>
    text === command ||
    text.startsWith(command + " ") ||
    text.startsWith(command + "@")
  );
}

function getCommandArgs(originalText) {
  return originalText.replace(/^\/\S+\s*/u, "").trim();
}

function rewriteMessageText(update, newText) {
  const copy = JSON.parse(JSON.stringify(update));
  if (copy.message?.text) copy.message.text = newText;
  if (copy.edited_message?.text) copy.edited_message.text = newText;
  return copy;
}

function jsonRequest(originalRequest, body) {
  return new Request(originalRequest.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
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
