import originalWorker from "./index.js";
import { calendar2026 } from "./data/calendar-2026.js";

const FASTING_OVERRIDES = {
  "2026-05-27": { fasting: "Пост", fastingType: "уље", overrideApplied: true },
  "2026-05-29": { fasting: "Пост", fastingType: "уље", overrideApplied: true },
  "2026-06-08": { fasting: "Пост", fastingType: "вода", note: "Почиње Апостолски пост. Пост на води.", overrideApplied: true },
  "2026-06-09": { fasting: "Пост", fastingType: "уље", overrideApplied: true },
  "2026-06-10": { fasting: "Пост", fastingType: "вода", overrideApplied: true },
  "2026-06-11": { fasting: "Пост", fastingType: "уље", overrideApplied: true },
  "2026-06-12": { fasting: "Пост", fastingType: "вода", overrideApplied: true },
  "2026-06-13": { fasting: "Пост", fastingType: "риба", overrideApplied: true },
  "2026-06-14": { fasting: "Пост", fastingType: "риба", overrideApplied: true }
};

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return originalWorker.fetch(request, env, ctx);

    let update;
    try {
      update = await request.clone().json();
    } catch {
      return originalWorker.fetch(request, env, ctx);
    }

    const message = update.message || update.edited_message;
    if (!message || message.from?.is_bot) return originalWorker.fetch(request, env, ctx);

    const originalText = getMessageText(message).trim();
    const commandText = String(message.text || "").trim().toLowerCase();

    const calendarResponse = handleCalendarOverrideCommand({ message, commandText });
    if (calendarResponse) return calendarResponse;

    if (message.text && isReportCommand(commandText)) {
      return handleReportCommand({ message, env, originalText: message.text.trim() });
    }

    const hardDecision = await hardModerationCheck({ message, env, originalText });
    if (hardDecision) return hardDecision;

    return originalWorker.fetch(request, env, ctx);
  }
};

function handleCalendarOverrideCommand({ message, commandText }) {
  if (!message.text) return null;

  const chatId = message.chat.id;
  const threadId = message.message_thread_id;

  if (isCommand(commandText, ["/post", "/пост"])) {
    const todayKey = getTodayKey();
    const today = getCalendarDay(todayKey);
    return sendGroupMessage(chatId, today ? formatPost(today) : missingDateMessage(todayKey), threadId);
  }

  if (isCommand(commandText, ["/kalendar", "/kalnedar", "/calendar", "/календар"])) {
    const todayKey = getTodayKey();
    const today = getCalendarDay(todayKey);
    if (!today) return sendGroupMessage(chatId, missingDateMessage(todayKey), threadId);
    return sendGroupMessage(chatId, formatCalendar(today), threadId);
  }

  if (isCommand(commandText, ["/sutra", "/сутра"])) {
    const tomorrowKey = getTomorrowKey();
    const tomorrow = getCalendarDay(tomorrowKey);
    return sendGroupMessage(chatId, tomorrow ? formatTomorrow(tomorrow) : missingDateMessage(tomorrowKey), threadId);
  }

  if (isCommand(commandText, ["/nedelja", "/недеља"])) return sendGroupMessage(chatId, formatWeek(), threadId);

  return null;
}

function isReportCommand(text) {
  const commands = ["/prijava", "/prijavi", "/пријава", "/пријави", "/report"];
  return commands.some((command) => text === command || text.startsWith(command + " ") || text.startsWith(command + "@"));
}

function isCommand(text, commands) {
  return commands.some((command) => text === command || text.startsWith(command + "@") || text.startsWith(command + " "));
}

function getCalendarDay(dateKey) {
  const base = calendar2026[dateKey];
  if (!base) return null;
  return { ...base, ...(FASTING_OVERRIDES[dateKey] || {}) };
}

function getTodayKey() { return formatDateKey(new Date()); }
function getTomorrowKey() { const date = new Date(); date.setDate(date.getDate() + 1); return formatDateKey(date); }
function addDaysKey(days) { const date = new Date(); date.setDate(date.getDate() + days); return formatDateKey(date); }

function formatDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}-${parts.find((p) => p.type === "day").value}`;
}

function formatCalendar(data) {
  const noteBlock = data.note ? `\n\n<b>Напомена</b>\n${escapeHtml(data.note)}` : "";
  return `☦️ <b>Календар за данас</b>\n\n` +
    `📅 <b>Датум:</b> ${escapeHtml(data.civilDate)}\n` +
    `🕊 <b>Црквени датум:</b> ${escapeHtml(data.churchDate || "Није уписано")}\n` +
    `📆 <b>Дан:</b> ${escapeHtml(data.day || "Није уписано")}\n\n` +
    `<b>Празник / светитељ дана</b>\n${escapeHtml(data.title || "Није уписано")}\n\n` +
    `<b>Пост</b>\n${formatFastStatus(data)}\n\n` +
    `<b>Читања</b>\nАпостол: ${escapeHtml(data.apostle || "Није уписано")}\nЈеванђеље: ${escapeHtml(data.gospel || "Није уписано")}` +
    noteBlock;
}

function formatPost(data) {
  const noteBlock = data.note ? `\n\n<b>Напомена</b>\n${escapeHtml(data.note)}` : "";
  return `☦️ <b>Пост за данас</b>\n\n📅 ${escapeHtml(data.civilDate)}\n\n${formatFastStatus(data)}${noteBlock}`;
}

function formatTomorrow(data) {
  return `☦️ <b>Сутра</b>\n\n📅 ${escapeHtml(data.civilDate)}\n📆 ${escapeHtml(data.day || "Није уписано")}\n\n<b>Празник / светитељ дана</b>\n${escapeHtml(data.title || "Није уписано")}\n\n<b>Пост</b>\n${formatFastStatus(data)}`;
}

function formatWeek() {
  const lines = ["☦️ <b>Наредних 7 дана</b>", ""];
  for (let i = 0; i < 7; i++) {
    const key = addDaysKey(i);
    const data = getCalendarDay(key);
    if (!data) {
      lines.push(`<b>${escapeHtml(key)}</b>`);
      lines.push("Подаци још нису уписани.");
      lines.push("");
      continue;
    }
    lines.push(`<b>${escapeHtml(data.civilDate)}, ${escapeHtml(data.day || "")}</b>`);
    lines.push(escapeHtml(data.title || "Није уписано"));
    lines.push(formatFastStatus(data));
    lines.push("");
  }
  return lines.join("\n").trim();
}

function formatFastStatus(data) {
  const fasting = `${data.fasting || ""} ${data.fastingType || ""}`.toLowerCase();
  if (fasting.includes("нема поста") || fasting.includes("без поста") || fasting.includes("разрешено")) return "🟢 Без поста";
  return `🔴 Пост: ${escapeHtml(data.fastingType || data.fasting || "да")}`;
}

function missingDateMessage(dateKey) { return `☦️ За датум ${escapeHtml(dateKey)} још нису додати подаци у календар.`; }

async function handleReportCommand({ message, env, originalText }) {
  const chatId = message.chat.id;
  const threadId = message.message_thread_id;
  const details = getReportDetails(originalText);

  if (!message.reply_to_message && !details.note && !details.mentionedUser) {
    return sendGroupMessage(chatId, "☦️ <b>Пријава</b>\n\nМожеш овако:\n• reply на поруку + <code>/пријави</code>\n• <code>/пријави @username</code>\n• <code>/пријави @username објашњење</code>\n• <code>/пријави објашњење проблема</code>", threadId);
  }

  const result = await sendUserReport({ env, message, chatId, threadId, details });
  if (result.ok) return sendGroupMessage(chatId, "✅ Пријава је послата админима.", threadId);
  return sendGroupMessage(chatId, `⚠️ Пријава није послата. Разлог: ${escapeHtml(result.description || "непозната грешка")}`, threadId);
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
    await sendAdminAlert({ env, title: "High risk од admin-а/owner-а", severity: "HIGH", action: "admin_exempt", reason: decision.reason, message, originalText, extra: "Бот не банује admin/owner налоге. Провери ручно." });
    return sendGroupMessage(chatId, "☦️ <b>Опомена</b>\n\nПорука је означена као тежак прекршај, али корисник је admin/owner. Админи су обавештени.", threadId);
  }

  const deleteResult = await telegramApi(env, "deleteMessage", { chat_id: chatId, message_id: message.message_id });
  const banResult = await telegramApi(env, "banChatMember", { chat_id: chatId, user_id: userId, revoke_messages: true });
  await sendAdminAlert({ env, title: banResult.ok ? "High risk ban" : "High risk ban није успео", severity: banResult.ok ? "CRITICAL" : "ERROR", action: "delete_and_ban", reason: decision.reason, message, originalText, extra: `deleteMessage: ${JSON.stringify(deleteResult)}\nbanChatMember: ${JSON.stringify(banResult)}` });
  if (!banResult.ok) return sendGroupMessage(chatId, "⚠️ Тежак прекршај је детектован, али ban није успео. Провери дозволе бота.", threadId);
  return sendGroupMessage(chatId, "⛔ Корисник је уклоњен из групе због тешког прекршаја.", threadId);
}

function getBlockedMediaDecision(message, env) {
  const mediaLockdown = String(env.MEDIA_LOCKDOWN || "false").toLowerCase() === "true";
  if (!mediaLockdown) return null;
  if (hasAnyMedia(message)) return { reason: "media lockdown је укључен: медија није дозвољена за non-admin кориснике" };
  return null;
}

function hasAnyMedia(message) {
  const isGifDocument = message.document?.mime_type === "image/gif";
  return Boolean(message.photo || message.video || message.animation || message.sticker || message.audio || message.voice || message.video_note || isGifDocument);
}

function getSevereTextDecision(text) {
  if (!text) return null;
  if (containsAny(text, ["јебем бога", "jebem boga", "jebo boga", "јебо бога"])) return { reason: "тешка псовка усмерена на светињу" };
  return null;
}

function getMessageText(message) { return message.text || message.caption || ""; }

function getReportDetails(text) {
  const cleaned = String(text || "").replace(/^\/\S+\s*/u, "").trim();
  const mentioned = cleaned.match(/@[a-zA-Z0-9_]{3,32}/)?.[0] || "";
  const note = mentioned ? cleaned.replace(mentioned, "").trim() : cleaned;
  return { mentionedUser: mentioned, note };
}

async function sendUserReport({ env, message, chatId, threadId, details }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return { ok: false, description: "ADMIN_CHAT_ID или BOT_TOKEN није подешен." };
  const target = message.reply_to_message?.from;
  const reportedMessage = message.reply_to_message?.text || message.reply_to_message?.caption || "";
  const report = `🚨 <b>Пријава корисника</b>\n\n<b>Пријавио:</b> ${escapeHtml(formatUser(message.from))}\n<b>Chat ID:</b> <code>${escapeHtml(chatId)}</code>\n<b>Thread ID:</b> <code>${escapeHtml(threadId || "нема")}</code>\n\n<b>Пријављени:</b> ${escapeHtml(target ? formatUser(target) : (details.mentionedUser || "није наведен"))}\n<b>Разлог:</b> ${escapeHtml(details.note || "није наведен")}\n\n<b>Порука:</b>\n${escapeHtml(reportedMessage || "нема reply поруке")}`;
  return telegramApi(env, "sendMessage", { chat_id: env.ADMIN_CHAT_ID, message_thread_id: env.ADMIN_THREAD_ID ? Number(env.ADMIN_THREAD_ID) : undefined, text: report, parse_mode: "HTML", disable_web_page_preview: true });
}

async function sendAdminAlert({ env, title, severity, action, reason, message, originalText, extra = "" }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return { ok: false };
  const report = `⚠️ <b>${escapeHtml(title)}</b>\n\n<b>Корисник:</b> ${escapeHtml(formatUser(message.from))}\n<b>User ID:</b> ${escapeHtml(message.from?.id || "?")}\n<b>Chat ID:</b> ${escapeHtml(message.chat?.id || "?")}\n<b>Ниво:</b> ${escapeHtml(severity)}\n<b>Акција:</b> ${escapeHtml(action)}\n<b>Разлог:</b> ${escapeHtml(reason)}\n\n<b>Порука:</b>\n${escapeHtml(String(originalText || "").slice(0, 3000))}\n\n${escapeHtml(extra)}`;
  return telegramApi(env, "sendMessage", { chat_id: env.ADMIN_CHAT_ID, message_thread_id: env.ADMIN_THREAD_ID ? Number(env.ADMIN_THREAD_ID) : undefined, text: report, parse_mode: "HTML", disable_web_page_preview: true });
}

async function getMemberStatus({ env, chatId, userId }) {
  const result = await telegramApi(env, "getChatMember", { chat_id: chatId, user_id: userId });
  return result?.result?.status || "unknown";
}

async function telegramApi(env, method, body) {
  if (!env.BOT_TOKEN) return { ok: false, description: "BOT_TOKEN није подешен." };
  try {
    const cleanBody = Object.fromEntries(Object.entries(body || {}).filter(([, value]) => value !== undefined));
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cleanBody) });
    return await response.json();
  } catch (error) {
    return { ok: false, description: error?.message || "Telegram API грешка." };
  }
}

function sendGroupMessage(chatId, text, threadId = undefined) {
  const payload = { method: "sendMessage", chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (threadId !== undefined && threadId !== null) payload.message_thread_id = threadId;
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

function sendPhoto(chatId, photo, caption, threadId = undefined) {
  const payload = { method: "sendPhoto", chat_id: chatId, photo, caption, parse_mode: "HTML" };
  if (threadId !== undefined && threadId !== null) payload.message_thread_id = threadId;
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[!?.:,;"'`~*()[\]{}<>]/g, " ").replace(/\s+/g, " ").trim();
}

function containsAny(text, phrases) { return phrases.some((phrase) => text.includes(phrase)); }
function formatUser(user) { if (!user) return "Непознат"; if (user.username) return `@${user.username}`; return `${user.first_name || ""} ${user.last_name || ""}`.trim() || String(user.id || "Непознат"); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
