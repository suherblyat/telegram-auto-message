import commandRouter from "./command-router.js";
import { calendar2026 } from "./data/calendar-2026.js";

const FASTING_OVERRIDES = {
  "2026-05-27": { fasting: "Пост", fastingType: "уље" },
  "2026-05-29": { fasting: "Пост", fastingType: "уље" }
};

const RED_DAY_DATES = new Set([
  // ЈАНУАР
  "2026-01-04", // Недеља пред Божић
  "2026-01-07", // Божић
  "2026-01-08", // Сабор Пресвете Богородице
  "2026-01-09", // Свети првомученик Стефан
  "2026-01-11", // Недеља по Рождеству
  "2026-01-14", // Свети Василије Велики / Српска Нова година
  "2026-01-18", // Зимски Крстовдан / Недеља пред Богојављење
  "2026-01-19", // Богојављење
  "2026-01-20", // Јовањдан
  "2026-01-25", // Недеља 33. по Духовима
  "2026-01-27", // Савиндан

  // ФЕБРУАР
  "2026-02-01", // Недеља о митару и фарисеју
  "2026-02-08", // Недеља о блудном сину
  "2026-02-15", // Сретење / Месопусна недеља
  "2026-02-22", // Недеља сиропусна / Беле покладе

  // МАРТ
  "2026-03-01", // Недеља Православља
  "2026-03-08", // Друга недеља поста
  "2026-03-15", // Крстопоклона недеља
  "2026-03-22", // Четврта недеља поста / Младенци
  "2026-03-29", // Пета недеља поста

  // АПРИЛ
  "2026-04-04", // Лазарева субота / Врбица
  "2026-04-05", // Цвети
  "2026-04-07", // Благовести
  "2026-04-10", // Велики петак
  "2026-04-12", // Васкрс
  "2026-04-13", // Васкршњи понедељак
  "2026-04-14", // Васкршњи уторак
  "2026-04-19", // Томина недеља
  "2026-04-26", // Недеља Мироносица

  // МАЈ
  "2026-05-03", // Недеља 4. по Васкрсу
  "2026-05-06", // Ђурђевдан
  "2026-05-10", // Недеља 5. по Васкрсу
  "2026-05-12", // Свети Василије Острошки
  "2026-05-17", // Недеља 6. по Васкрсу
  "2026-05-21", // Спасовдан
  "2026-05-22", // Летњи Свети Никола
  "2026-05-24", // Недеља 7. по Васкрсу / Свети Кирило и Методије
  "2026-05-31", // Духови / Света Тројица

  // ЈУН
  "2026-06-01", // Духовски понедељак
  "2026-06-02", // Духовски уторак
  "2026-06-03", // Свети цар Константин и царица Јелена
  "2026-06-07", // Недеља свих светих
  "2026-06-14", // Недеља 2. по Духовима
  "2026-06-21", // Недеља 3. по Духовима
  "2026-06-28", // Видовдан

  // ЈУЛ
  "2026-07-05", // Недеља 5. по Духовима
  "2026-07-07", // Ивањдан
  "2026-07-12", // Петровдан
  "2026-07-19", // Недеља 7. по Духовима
  "2026-07-26", // Недеља 8. по Духовима
  "2026-07-30", // Огњена Марија

  // АВГУСТ
  "2026-08-02", // Илиндан
  "2026-08-09", // Недеља 10. по Духовима
  "2026-08-16", // Недеља 11. по Духовима
  "2026-08-19", // Преображење Господње
  "2026-08-23", // Недеља 12. по Духовима
  "2026-08-28", // Велика Госпојина
  "2026-08-30", // Недеља 13. по Духовима

  // СЕПТЕМБАР
  "2026-09-06", // Недеља 14. по Духовима
  "2026-09-11", // Усековање главе Светог Јована Крститеља
  "2026-09-13", // Недеља 15. по Духовима
  "2026-09-20", // Недеља 16. по Духовима
  "2026-09-21", // Мала Госпојина
  "2026-09-27", // Крстовдан

  // ОКТОБАР
  "2026-10-04", // Недеља 18. по Духовима
  "2026-10-11", // Недеља 19. по Духовима
  "2026-10-12", // Михољдан
  "2026-10-14", // Покров Пресвете Богородице
  "2026-10-18", // Недеља 20. по Духовима
  "2026-10-19", // Томиндан
  "2026-10-20", // Срђевдан
  "2026-10-25", // Недеља 21. по Духовима
  "2026-10-27", // Света Петка
  "2026-10-31", // Свети апостол Лука

  // НОВЕМБАР
  "2026-11-01", // Недеља 22. по Духовима
  "2026-11-08", // Митровдан
  "2026-11-15", // Недеља 24. по Духовима
  "2026-11-21", // Аранђеловдан
  "2026-11-22", // Недеља 25. по Духовима
  "2026-11-29", // Недеља 26. по Духовима

  // ДЕЦЕМБАР
  "2026-12-04", // Ваведење Пресвете Богородице
  "2026-12-19"  // Никољдан
]);

const IMPORTANT_BLACK_DAY_DATES = new Set([
  "2026-02-12", // Света Три Јерарха
  "2026-02-14", // Зимске задушнице
  "2026-05-30", // Духовске задушнице
  "2026-11-07"  // Митровске задушнице
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
  const note = data.note ? `\n\n<b>Напомена</b>\n${escapeHtml(data.note)}` : "";

  return `☦️ <b>Календар за данас</b>\n\n` +
    `📅 <b>Датум:</b> ${escapeHtml(data.civilDate)}\n` +
    `🕊 <b>Црквени датум:</b> ${escapeHtml(data.churchDate || "Није уписано")}\n` +
    `📆 <b>Дан:</b> ${escapeHtml(data.day || "Није уписано")}\n` +
    `${formatDayRank(data)}\n` +
    `🎵 <b>${formatToneLine(data)}</b>\n\n` +
    `<b>Празник / светитељ дана</b>\n${escapeHtml(data.title || "Није уписано")}\n\n` +
    `<b>Пост</b>\n${formatFast(data)}\n\n` +
    `<b>Читања</b>\nАпостол: ${escapeHtml(data.apostle || "Није уписано")}\nЈеванђеље: ${escapeHtml(data.gospel || "Није уписано")}` +
    note;
}

function formatPost(data) {
  return `☦️ <b>Пост за данас</b>\n\n📅 ${escapeHtml(data.civilDate)}\n${formatDayRank(data)}\n\n${formatFast(data)}`;
}

function formatTomorrow(data) {
  return `☦️ <b>Сутра</b>\n\n📅 ${escapeHtml(data.civilDate)}\n📆 ${escapeHtml(data.day || "Није уписано")}\n${formatDayRank(data)}\n🎵 <b>${formatToneLine(data)}</b>\n\n<b>Празник / светитељ дана</b>\n${escapeHtml(data.title || "Није уписано")}\n\n<b>Пост</b>\n${formatFast(data)}`;
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

    lines.push(`<b>${escapeHtml(data.civilDate)}, ${escapeHtml(data.day || "")}</b> ${formatDayRank(data)}`);
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
  return `🔴 Пост: ${escapeHtml(data.fastingType || data.fasting || "пост")}`;
}

function formatDayRank(data) {
  const rank = getDayRank(data);
  if (rank === "red") return "🔴 <b>ЦРВЕНО СЛОВО</b>";
  return IMPORTANT_BLACK_DAY_DATES.has(data.date || data.dateKey)
    ? "⚫ <b>ЦРНО СЛОВО</b>"
    : "⚫ Црно слово";
}

function getDayRank(data) {
  const key = data.date || data.dateKey;
  if (RED_DAY_DATES.has(key)) return "red";
  if (isSunday(key)) return "red";

  const explicit = `${data.dayRank || ""} ${data.dayColor || ""} ${data.color || ""} ${data.feastColor || ""} ${data.redDay || ""} ${data.blackDay || ""}`.toLowerCase();
  if (data.redDay === true || explicit.includes("црвен") || explicit.includes("crven") || explicit.includes("red")) return "red";

  return "black";
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
