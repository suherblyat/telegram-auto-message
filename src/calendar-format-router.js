import commandRouter from "./command-router.js";
import { calendar2026 } from "./data/calendar-2026.js";

const FASTING_OVERRIDES = {
  "2026-05-27": { fasting: "Пост", fastingType: "уље" },
  "2026-05-29": { fasting: "Пост", fastingType: "уље" }
};

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return commandRouter.fetch(request, env, ctx);

    const cloned = request.clone();
    let update;

    try {
      update = await cloned.json();
    } catch {
      return commandRouter.fetch(request, env, ctx);
    }

    const message = update.message || update.edited_message;
    if (!message?.text || message.from?.is_bot) return commandRouter.fetch(request, env, ctx);

    const text = message.text.trim().toLowerCase();
    const chatId = message.chat.id;
    const threadId = message.message_thread_id;

    if (isCommand(text, ["/kalendar", "/календар"])) {
      const data = getCalendarDay(todayKey());
      if (!data) return sendMessage(chatId, missingMessage(todayKey()), threadId);
      if (data.icon) return sendPhoto(chatId, data.icon, formatCalendar(data), threadId);
      return sendMessage(chatId, formatCalendar(data), threadId);
    }

    if (isCommand(text, ["/post", "/пост"])) {
      const data = getCalendarDay(todayKey());
      return sendMessage(chatId, data ? formatPost(data) : missingMessage(todayKey()), threadId);
    }

    if (isCommand(text, ["/sutra", "/сутра"])) {
      const key = tomorrowKey();
      const data = getCalendarDay(key);
      return sendMessage(chatId, data ? formatTomorrow(data) : missingMessage(key), threadId);
    }

    if (isCommand(text, ["/nedelja", "/недеља"])) {
      return sendMessage(chatId, formatWeek(), threadId);
    }

    return commandRouter.fetch(request, env, ctx);
  }
};

function isCommand(text, commands) {
  return commands.some((command) => text === command || text.startsWith(command + " ") || text.startsWith(command + "@"));
}

function getCalendarDay(key) {
  const base = calendar2026[key];
  if (!base) return null;
  return { ...base, ...(FASTING_OVERRIDES[key] || {}) };
}

function todayKey() {
  return dateKey(new Date());
}

function tomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return dateKey(date);
}

function addDaysKey(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function dateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}-${parts.find((p) => p.type === "day").value}`;
}

function formatCalendar(data) {
  const note = data.note ? `\n\n<b>Напомена</b>\n${escapeHtml(data.note)}` : "";

  return `☦️ <b>Календар за данас</b>\n\n` +
    `📅 <b>Датум:</b> ${escapeHtml(data.civilDate)}\n` +
    `🕊 <b>Црквени датум:</b> ${escapeHtml(data.churchDate || "Није уписано")}\n` +
    `📆 <b>Дан:</b> ${escapeHtml(data.day || "Није уписано")}\n` +
    `🎵 <b>${formatToneLine(data)}</b>\n\n` +
    `<b>Празник / светитељ дана</b>\n${escapeHtml(data.title || "Није уписано")}\n\n` +
    `<b>Пост</b>\n${formatFast(data)}\n\n` +
    `<b>Читања</b>\nАпостол: ${escapeHtml(data.apostle || "Није уписано")}\nЈеванђеље: ${escapeHtml(data.gospel || "Није уписано")}` +
    note;
}

function formatPost(data) {
  return `☦️ <b>Пост за данас</b>\n\n📅 ${escapeHtml(data.civilDate)}\n\n${formatFast(data)}`;
}

function formatTomorrow(data) {
  return `☦️ <b>Сутра</b>\n\n📅 ${escapeHtml(data.civilDate)}\n📆 ${escapeHtml(data.day || "Није уписано")}\n🎵 <b>${formatToneLine(data)}</b>\n\n<b>Празник / светитељ дана</b>\n${escapeHtml(data.title || "Није уписано")}\n\n<b>Пост</b>\n${formatFast(data)}`;
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
    lines.push(formatToneLine(data));
    lines.push(formatFast(data));
    lines.push("");
  }

  return lines.join("\n").trim();
}

function formatFast(data) {
  const combined = `${data.fasting || ""} ${data.fastingType || ""}`.toLowerCase();
  if (combined.includes("нема поста") || combined.includes("без поста") || combined.includes("разрешено")) {
    return "🟢 Без поста";
  }
  return `🔴 ${escapeHtml(data.fastingType || data.fasting || "пост")}`;
}

function formatToneLine(data) {
  const tone = getWeekToneByDateKey(data.date || data.dateKey || todayKey());
  return tone ? `Глас недеље: ${escapeHtml(tone)}` : "Глас није израчунат за овај датум.";
}

function getWeekToneByDateKey(dateKey) {
  const thomasSunday2026 = "2026-04-19";
  const currentSunday = getSundayOfWeek(dateKey);

  if (currentSunday < thomasSunday2026) return "";

  const diffDays = daysBetween(thomasSunday2026, currentSunday);
  const weeks = Math.floor(diffDays / 7);
  const tone = (weeks % 8) + 1;

  return `${tone}. глас`;
}

function getSundayOfWeek(dateKey) {
  const date = new Date(dateKey + "T12:00:00Z");
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startKey, endKey) {
  const start = new Date(startKey + "T12:00:00Z");
  const end = new Date(endKey + "T12:00:00Z");
  return Math.round((end - start) / 86400000);
}

function missingMessage(key) {
  return `☦️ За датум ${escapeHtml(key)} још нису додати подаци у календар.`;
}

function sendMessage(chatId, text, threadId) {
  const payload = { method: "sendMessage", chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (threadId !== undefined && threadId !== null) payload.message_thread_id = threadId;
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

function sendPhoto(chatId, photo, caption, threadId) {
  const payload = { method: "sendPhoto", chat_id: chatId, photo, caption, parse_mode: "HTML" };
  if (threadId !== undefined && threadId !== null) payload.message_thread_id = threadId;
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
