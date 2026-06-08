export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("worker ok", { status: 200 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("ok", { status: 200 });
    }

    const message = update.message || update.edited_message;
    if (!message || !message.text || message.from?.is_bot) {
      return new Response("ok", { status: 200 });
    }

    const chatId = message.chat.id;
    const threadId = message.message_thread_id;
    const text = String(message.text).trim().toLowerCase();

    if (isCommand(text, ["/ping", "/test"])) {
      return reply(chatId, "OK: worker is alive", threadId);
    }

    if (isCommand(text, ["/kalendar", "/kalnedar", "/calendar", "/календар"])) {
      return reply(chatId, "Calendar command works. Date: 2026-06-08. Fast: water.", threadId);
    }

    if (isCommand(text, ["/post", "/fast", "/пост"])) {
      return reply(chatId, "Fast today: water.", threadId);
    }

    return new Response("ok", { status: 200 });
  }
};

function isCommand(text, commands) {
  return commands.some((command) => text === command || text.startsWith(command + " ") || text.startsWith(command + "@"));
}

function reply(chatId, text, threadId) {
  const body = {
    method: "sendMessage",
    chat_id: chatId,
    text
  };

  if (threadId !== undefined && threadId !== null) {
    body.message_thread_id = threadId;
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
