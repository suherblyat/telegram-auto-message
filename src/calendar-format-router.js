import commandRouter from "./command-router.js";
import { calendar2026 } from "./data/calendar-2026.js";

const FASTING_OVERRIDES = {
  "2026-05-27": { fasting: "Пост", fastingType: "уље" },
  "2026-05-29": { fasting: "Пост", fastingType: "уље" },

  // Апостолски пост 2026: пон/сре/пет вода, уто/чет уље, суб/нед риба.
  // Посебни празници у посту могу имати разрешење на рибу.
  "2026-06-08": { fasting: "Пост", fastingType: "вода", note: "Почиње Апостолски пост. Пост на води." },
  "2026-06-09": { fasting: "Пост", fastingType: "уље" },
  "2026-06-10": { fasting: "Пост", fastingType: "вода" },
  "2026-06-11": { fasting: "Пост", fastingType: "уље" },
  "2026-06-12": { fasting: "Пост", fastingType: "вода" },
  "2026-06-13": { fasting: "Пост", fastingType: "риба" },
  "2026-06-14": { fasting: "Пост", fastingType: "риба" },
  "2026-06-15": { fasting: "Пост", fastingType: "вода" },
  "2026-06-16": { fasting: "Пост", fastingType: "уље" },
  "2026-06-17": { fasting: "Пост", fastingType: "вода" },
  "2026-06-18": { fasting: "Пост", fastingType: "уље" },
  "2026-06-19": { fasting: "Пост", fastingType: "вода" },
  "2026-06-20": { fasting: "Пост", fastingType: "риба" },
  "2026-06-21": { fasting: "Пост", fastingType: "риба" },
  "2026-06-22": { fasting: "Пост", fastingType: "вода" },
  "2026-06-23": { fasting: "Пост", fastingType: "уље" },
  "2026-06-24": { fasting: "Пост", fastingType: "риба" },
  "2026-06-25": { fasting: "Пост", fastingType: "уље" },
  "2026-06-26": { fasting: "Пост", fastingType: "вода" },
  "2026-06-27": { fasting: "Пост", fastingType: "риба" },
  "2026-06-28": { fasting: "Пост", fastingType: "риба" },
  "2026-06-29": { fasting: "Пост", fastingType: "вода" },
  "2026-06-30": { fasting: "Пост", fastingType: "уље" },
  "2026-07-01": { fasting: "Пост", fastingType: "вода" },
  "2026-07-02": { fasting: "Пост", fastingType: "уље" },
  "2026-07-03": { fasting: "Пост", fastingType: "вода" },
  "2026-07-04": { fasting: "Пост", fastingType: "риба" },
  "2026-07-05": { fasting: "Пост", fastingType: "риба" },
  "2026-07-06": { fasting: "Пост", fastingType: "вода" },
  "2026-07-07": { fasting: "Пост", fastingType: "риба" },
  "2026-07-08": { fasting: "Пост", fastingType: "вода" },
  "2026-07-09": { fasting: "Пост", fastingType: "уље" },
  "2026-07-10": { fasting: "Пост", fastingType: "вода" },
  "2026-07-11": { fasting: "Пост", fastingType: "риба" }
};

const RED_DAY_DATES = new Set([
  "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-14", "2026-01-19", "2026-01-20", "2026-01-27",
  "2026-02-15", "2026-04-05", "2026-04-10", "2026-04-12", "2026-04-13", "2026-04-14",
  "2026-05-06", "2026-05-12", "2026-05-21", "2026-05-22", "2026-05-31",
  "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-28",
  "2026-07-07", "2026-07-12", "2026-08-02", "2026-08-19", "2026-08-28",
  "2026-09-11", "2026-09-21", "2026-09-27", "2026-10-27", "2026-11-08", "2026-11-21",
  "2026-12-04", "2026-12-19"
]);

const BLACK_DAY_DATES = new Set([
  "2026-01-02", "2026-01-06", "2026-01-18", "2026-01-29", "2026-01-31",
  "2026-02-14", "2026-02-16", "2026-02-23", "2026-03-02", "2026-03-09", "2026-03-22", "2026-03-30",
  "2026-04-04", "2026-04-06", "2026-04-07", "2026-04-08", "2026-04-09", "2026-04-11",
  "2026-05-08", "2026-05-14", "2026-05-30", "2026-06-07", "2026-06-08", "2026-06-24", "2026-06-27",
  "2026-07-14", "2026-07-21", "2026-07-26", "2026-07-28", "2026-07-30",
  "2026-08-04", "2026-08-08", "2026-08-09", "2026-08-14",
  "2026-09-04", "2026-09-08", "2026-09-12", "2026-09-14", "2026-09-22", "2026-09-30",
  "2026-10-03", "2026-10-06", "2026-10-09", "2026-10-12", "2026-10-14", "2026-10-19", "2026-10-20", "2026-10-31",
  "2026-11-05", "2026-11-11", "2026-11-14", "2026-11-16", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-29",
  "2026-12-07", "2026-12-08", "2026-12-09", "2026-12-13", "2026-12-17", "2026-12-18", "2026-12-25"
]);

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return commandRouter.fetch(request, env, ctx);

    let update;
    try {
      update = await request.clone().json();
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
  const rank = formatDayRank(data);
  const rankLine = rank ? `${rank}\n` : "";
  const note = data.note ? `\n\n<b>Напомена</b>\n${escapeHtml(data.note)}` : "";
  return `☦️ <b>Календар за данас</b>\n\n` +
    `📅 <b>Датум:</b> ${escapeHtml(data.civilDate)}\n` +
    `🕊 <b>Црквени датум:</b> ${escapeHtml(data.churchDate || "Није уписано")}\n` +
    `📆 <b>Дан:</b> ${escapeHtml(data.day || "Није уписано")}\n` +
    rankLine +
    `🎵 <b>${formatToneLine(data)}</b>\n\n` +
    `<b>Празник / светитељ дана</b>\n${escapeHtml(data.title || "Није уписано")}\n\n` +
    `<b>Пост</b>\n${formatFast(data)}\n\n` +
    `<b>Читања</b>\nАпостол: ${escapeHtml(data.apostle || "Није уписано")}\nЈеванђеље: ${escapeHtml(data.gospel || "Није уписано")}` + note;
}

function formatPost(data) {
  const rank = formatDayRank(data);
  const rankLine = rank ? `\n${rank}` : "";
  return `☦️ <b>Пост за данас</b>\n\n📅 ${escapeHtml(data.civilDate)}${rankLine}\n\n${formatFast(data)}`;
}

function formatTomorrow(data) {
  const rank = formatDayRank(data);
  const rankLine = rank ? `${rank}\n` : "";
  return `☦️ <b>Сутра</b>\n\n📅 ${escapeHtml(data.civilDate)}\n📆 ${escapeHtml(data.day || "Није уписано")}\n${rankLine}🎵 <b>${formatToneLine(data)}</b>\n\n<b>Празник / светитељ дана</b>\n${escapeHtml(data.title || "Није уписано")}\n\n<b>Пост</b>\n${formatFast(data)}`;
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
    const rank = formatDayRank(data);
    lines.push(`<b>${escapeHtml(data.civilDate)}, ${escapeHtml(data.day || "")}</b>${rank ? ` ${rank}` : ""}`);
    lines.push(escapeHtml(data.title || "Није уписано"));
    lines.push(formatToneLine(data));
    lines.push(formatFast(data));
    lines.push("");
  }
  return lines.join("\n").trim();
}

function formatFast(data) {
  const combined = `${data.fasting || ""} ${data.fastingType || ""}`.toLowerCase();
  if (combined.includes("нема поста") || combined.includes("без поста") || combined.includes("разрешено")) return "🟢 Без поста";
  return `🔴 Пост: ${escapeHtml(data.fastingType || data.fasting || "пост")}`;
}

function formatDayRank(data) {
  const rank = getDayRank(data);
  if (rank === "red") return "🔴 <b>ЦРВЕНО СЛОВО</b>";
  if (rank === "black") return "⚫ <b>ЦРНО СЛОВО</b>";
  return "";
}

function getDayRank(data) {
  const key = data.date || data.dateKey;
  if (RED_DAY_DATES.has(key)) return "red";
  if (isSunday(key)) return "red";
  if (BLACK_DAY_DATES.has(key)) return "black";
  return "none";
}

function isSunday(key) {
  if (!key) return false;
  return new Date(key + "T12:00:00Z").getUTCDay() === 0;
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
  return `${(weeks % 8) + 1}. глас`;
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
