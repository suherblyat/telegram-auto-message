import originalWorker from "./index.js";
import { calendar2026 } from "./data/calendar-all.js";

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

const APOSTLES_FAST_2026 = {
  start: "2026-06-08",
  end: "2026-07-11"
};

const APOSTLES_FAST_TYPES_BY_WEEKDAY = {
  0: "риба",
  1: "вода",
  2: "уље",
  3: "вода",
  4: "уље",
  5: "вода",
  6: "риба"
};

const FIXED_SCRIPTURE_QUOTES = {
  "матеј 23:27": {
    reference: "Матеј 23:27",
    text: "Тешко вама, књижевници и фарисеји, лицемери, што сте као окречени гробови, који споља изгледају лепи, а изнутра су пуни костију мртвачких и сваке нечистоте."
  }
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

    const commandText = String(message.text || "").trim().toLowerCase();

    const calendarResponse = await handleCalendarOverrideCommand({ message, commandText, env });
    if (calendarResponse) return calendarResponse;



    return originalWorker.fetch(request, env, ctx);
  }
};

async function handleCalendarOverrideCommand({ message, commandText, env }) {
  if (!message.text) return null;

  const chatId = message.chat.id;
  const threadId = message.message_thread_id;

  if (isCommand(commandText, ["/start", "/help", "/komande", "/commands", "/помоћ", "/команде"])) {
    return sendGroupMessage(chatId, formatHelp(), threadId);
  }

  if (isCommand(commandText, ["/ping", "/test"])) {
    return sendGroupMessage(chatId, "✅ Бот ради.", threadId);
  }

  if (isCommand(commandText, ["/post", "/пост"])) {
    const todayKey = getTodayKey();
    const today = getCalendarDay(todayKey);
    return sendGroupMessage(chatId, today ? formatPost(today) : missingDateMessage(todayKey), threadId);
  }

  if (isCommand(commandText, ["/tropar", "/тропар"])) {
    const todayKey = getTodayKey();
    const today = getCalendarDay(todayKey);
    return sendGroupMessage(chatId, today ? formatTropar(today) : missingDateMessage(todayKey), threadId);
  }

  if (isCommand(commandText, ["/kondak", "/кондак"])) {
    const todayKey = getTodayKey();
    const today = getCalendarDay(todayKey);
    return sendGroupMessage(chatId, today ? formatKondak(today) : missingDateMessage(todayKey), threadId);
  }

  if (isCommand(commandText, ["/svpismo", "/свписмо"])) {
    return sendGroupMessage(chatId, formatFixedScripture(getCommandArgument(message.text)), threadId);
  }

  if (isCommand(commandText, ["/prolog", "/пролог"])) {
    const todayKey = getTodayKey();
    const today = getCalendarDay(todayKey);
    return sendGroupMessage(chatId, today ? formatProlog(today) : missingDateMessage(todayKey), threadId);
  }

  if (isCommand(commandText, ["/kalendar", "/kalnedar", "/calendar", "/календар"])) {
    const todayKey = getTodayKey();
    const today = getCalendarDay(todayKey);
    if (!today) return sendGroupMessage(chatId, missingDateMessage(todayKey), threadId);

    const caption = formatCalendar(today);
    const icon = normalizeGithubRawUrl(today.icon || "");

    if (icon && env.BOT_TOKEN) {
      const photoResult = await telegramApi(env, "sendPhoto", {
        chat_id: chatId,
        message_thread_id: threadId,
        photo: icon,
        caption,
        parse_mode: "HTML"
      });

      if (photoResult.ok) {
        return new Response("OK", { status: 200 });
      }

      return sendGroupMessage(chatId, `${caption}\n\n⚠️ <i>Икона није послата. Telegram разлог: ${escapeHtml(photoResult.description || "непознато")}</i>`, threadId);
    }

    return sendGroupMessage(chatId, caption, threadId);
  }

  if (isCommand(commandText, ["/sutra", "/сутра"])) {
    const tomorrowKey = getTomorrowKey();
    const tomorrow = getCalendarDay(tomorrowKey);
    return sendGroupMessage(chatId, tomorrow ? formatTomorrow(tomorrow) : missingDateMessage(tomorrowKey), threadId);
  }

  if (isCommand(commandText, ["/nedelja", "/недеља"])) return sendGroupMessage(chatId, formatWeek(), threadId);

  return null;
}

function normalizeGithubRawUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";

  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(\?raw=true)?$/i);
  if (match) {
    return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`;
  }

  return url;
}

function isCommand(text, commands) {
  return commands.some((command) => text === command || text.startsWith(command + "@") || text.startsWith(command + " "));
}

function getCommandArgument(text) {
  return String(text || "").trim().replace(/^\/\S+\s*/u, "").trim();
}

function normalizeScriptureReference(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^мт\b/u, "матеј")
    .replace(/^mt\b/u, "матеј")
    .replace(/^matej\b/u, "матеј")
    .replace(/^matthew\b/u, "матеј");
}

function getCalendarDay(dateKey) {
  const base = calendar2026[dateKey];
  if (!base) return null;

  const apostlesFastOverride = getApostlesFast2026Override(dateKey, base);
  return { ...base, ...(apostlesFastOverride || {}), ...(FASTING_OVERRIDES[dateKey] || {}) };
}

function getApostlesFast2026Override(dateKey, base) {
  if (dateKey < APOSTLES_FAST_2026.start || dateKey > APOSTLES_FAST_2026.end) return null;

  const weekday = getUtcWeekday(dateKey);
  const fastingType = APOSTLES_FAST_TYPES_BY_WEEKDAY[weekday];
  const firstDayNote = dateKey === APOSTLES_FAST_2026.start ? "Почиње Апостолски пост. Пост на води." : "Апостолски пост.";

  return {
    fasting: "Пост",
    fastingType,
    note: base.note && !base.note.includes("Апостолски пост") ? `${base.note}\n${firstDayNote}` : firstDayNote,
    apostlesFastRuleApplied: true
  };
}

function getUtcWeekday(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
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

function formatTropar(data) {
  return `☦️ <b>Тропар за данас</b>\n\n` +
    `📅 ${escapeHtml(data.civilDate)}\n` +
    `<b>${escapeHtml(data.title || "Празник / светитељ дана")}</b>\n\n` +
    `${escapeHtml(data.tropar || "Тропар још није уписан.")}\n\n` +
    `<b>Кондак</b>\n${escapeHtml(data.kondak || "Кондак још није уписан.")}`;
}

function formatKondak(data) {
  return `☦️ <b>Кондак за данас</b>\n\n` +
    `📅 ${escapeHtml(data.civilDate)}\n` +
    `<b>${escapeHtml(data.title || "Празник / светитељ дана")}</b>\n\n` +
    `${escapeHtml(data.kondak || "Кондак још није уписан.")}`;
}

function formatFixedScripture(reference) {
  const normalizedReference = normalizeScriptureReference(reference || "Матеј 23:27");
  const quote = FIXED_SCRIPTURE_QUOTES[normalizedReference] || FIXED_SCRIPTURE_QUOTES["матеј 23:27"];

  return `☦️ <b>Свето Писмо</b>\n\n` +
    `<b>${escapeHtml(quote.reference)}</b>\n` +
    `${escapeHtml(quote.text)}`;
}

function formatProlog(data) {
  return `☦️ <b>Пролог за данас</b>\n\n` +
    `📅 ${escapeHtml(data.civilDate)}\n` +
    `<b>${escapeHtml(data.title || "Празник / светитељ дана")}</b>\n\n` +
    `${escapeHtml(data.prolog || "Пролог још није уписан.")}`;
}

function formatHelp() {
  return "☦️ <b>Команде бота</b>\n\n" +
    "<code>/kalendar</code>  календар за данас\n" +
    "<code>/post</code>  пост за данас\n" +
    "<code>/tropar</code>  тропар и кондак\n" +
    "<code>/свписмо Матеј 23:27</code>  цитат\n" +
    "<code>/sutra</code>  календар за сутра\n" +
    "<code>/nedelja</code>  наредних 7 дана\n" +
    "<code>/prolog</code>  Пролог за данас\n" +
    "<code>/icons</code>  списак икона\n" +
    "<code>/ikona назив</code>  икона по називу\n" +
    "<code>/ping</code>  провера да ли бот ради";
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
