import { calendar2026 } from "./data/calendar-2026.js";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Православни бот ради ☦️", { status: 200 });
    }

    let update;

    try {
      update = await request.json();
    } catch (error) {
      return new Response("Bad request", { status: 400 });
    }

    const message = update.message || update.edited_message;

    if (!message || !message.text) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text.trim().toLowerCase();

    const todayKey = getTodayKey();
    const tomorrowKey = getTomorrowKey();
    const today = calendar2026[todayKey];
    const tomorrow = calendar2026[tomorrowKey];

    let reply = "";

    if (isCommand(text, ["/start", "/help", "/pomoc", "/помоћ"])) {
      reply = formatHelp();
    }

    else if (isCommand(text, ["/pravila", "/правила"])) {
      reply = `☦️ <b>Правила групе</b>

1. Без псовки, вређања и личних напада.
2. Критикуј аргумент, не човека.
3. За озбиљне тврдње о Цркви, историји и светитељима дај извор.
4. Без спама, провокација и непристојних слика.
5. Чувајмо мир, али не по цену истине.`;
    }

    else if (isCommand(text, ["/kalendar", "/календар"])) {
      reply = today ? formatCalendar(today) : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/post", "/пост"])) {
      reply = today ? formatPost(today) : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/sutra", "/сутра"])) {
      reply = tomorrow ? formatTomorrow(tomorrow) : missingDateMessage(tomorrowKey);
    }

    else if (isCommand(text, ["/nedelja", "/недеља"])) {
      reply = formatWeek();
    }

    else if (isCommand(text, ["/svetitelj", "/светитељ"])) {
      reply = today ? formatSaintCommand(today) : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/ikona", "/икона"])) {
      if (!today) {
        reply = missingDateMessage(todayKey);
      } else if (!today.icon) {
        reply = `☦️ <b>Икона дана</b>
    
    ${e(today.title || "Није уписано")}
    
    Икона још није додата.`;
      } else {
        return sendPhoto(chatId, today.icon, `☦️ <b>Икона дана</b>
    
    ${e(today.title || "Није уписано")}`);
      }
    }

    else if (isCommand(text, ["/svpismo", "/svpisмо", "/свписмо"])) {
      reply = today ? formatScripture(today) : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/prolog", "/пролог"])) {
      reply = today
        ? `☦️ <b>Охридски пролог</b>\n\n${e(today.prolog || "Пролог још није уписан за овај датум.")}`
        : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/tropar", "/тропар"])) {
      reply = today ? formatTropar(today) : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/kondak", "/кондак"])) {
      reply = today ? formatKondak(today) : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/molitva", "/молитва"])) {
      reply = `☦️ <b>Молитва</b>

Господе Исусе Христе, Сине Божији, помилуј ме грешног.

Пресвета Богородице, спаси нас.`;
    }

    else if (isCommand(text, ["/citat", "/цитат"])) {
      const quotes = [
        "☦️ Ништа није јаче од човека који се моли.",
        "☦️ Стекни дух мира, и хиљаде око тебе ће се спасти.",
        "☦️ Без Господа ни преко прага, а са Господом и преко мора.",
        "☦️ Где има смирења, тамо има и благодати Божије.",
        "☦️ Боље је изгубити расправу него изгубити мир душе."
      ];

      reply = e(quotes[Math.floor(Math.random() * quotes.length)]);
    }

    else if (isCommand(text, ["/linkovi", "/линкови"])) {
      reply = `☦️ <b>Корисни линкови</b>

<b>Охридски пролог</b>
https://www.pravoslavnikalendar.rs/prolog/

<b>Свето Писмо</b>
https://www.svetopismo.info/

<b>Светосавље</b>
https://svetosavlje.org/

<b>СПЦ</b>
https://spc.rs/`;
    }

    if (!reply) {
      return new Response("OK", { status: 200 });
    }

    return sendMessage(chatId, reply);
  }
};

function sendMessage(chatId, text) {
  return new Response(
    JSON.stringify({
      method: "sendMessage",
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}

function isCommand(text, commands) {
  return commands.some((command) =>
    text === command ||
    text.startsWith(command + "@") ||
    text.startsWith(command + " ")
  );
}

function getTodayKey() {
  return formatDateKey(new Date());
}

function getTomorrowKey() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatDateKey(date);
}

function addDaysKey(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

function formatDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;

  return `${year}-${month}-${day}`;
}

function formatHelp() {
  return `☦️ <b>Православни бот</b>

<b>Основне команде</b>
/календар  Данашњи црквени календар
/светитељ  Светитељ или празник дана
/пост      Да ли је данас пост
/свписмо   Дневна читања
/тропар    Тропар дана
/кондак    Кондак дана

<b>Преглед дана</b>
/сутра     Преглед за сутрашњи дан
/недеља    Наредних 7 дана

<b>Духовни садржај</b>
/пролог    Охридски пролог
/молитва   Кратка молитва
/цитат     Насумичан православни цитат
/икона     Икона дана

<b>Остало</b>
/правила   Правила групе
/линкови   Корисни православни линкови`;
}

function formatCalendar(data) {
  return `☦️ <b>Календар за данас</b>

📅 <b>Датум:</b> ${e(data.civilDate)}
🕊 <b>Црквени датум:</b> ${e(data.churchDate || "Није уписано")}
📆 <b>Дан:</b> ${e(data.day || "Није уписано")}

<b>Празник / светитељ дана</b>
${e(data.title || "Није уписано")}

<b>Остали светитељи</b>
${formatOtherSaints(data.saints, data.title)}

<b>Тип празника</b>
${e(data.feastType || "Није уписано")}

<b>Пост</b>
${e(data.fasting || "Није уписано")}

<b>Читања</b>
Апостол: ${e(data.apostle || "Није уписано")}
Јеванђеље: ${e(data.gospel || "Није уписано")}

<b>Напомена</b>
${e(data.note || "Нема напомене.")}`;
}

function formatTomorrow(data) {
  return `☦️ <b>Сутра</b>

📅 ${e(data.civilDate)}
🕊 Црквени датум: ${e(data.churchDate || "Није уписано")}
📆 ${e(data.day || "Није уписано")}

<b>Празник / светитељ дана</b>
${e(data.title || "Није уписано")}

<b>Остали светитељи</b>
${formatOtherSaints(data.saints, data.title)}

<b>Пост</b>
${e(data.fasting || "Није уписано")}

<b>Читања</b>
Апостол: ${e(data.apostle || "Није уписано")}
Јеванђеље: ${e(data.gospel || "Није уписано")}`;
}

function formatWeek() {
  const lines = ["☦️ <b>Наредних 7 дана</b>", ""];

  for (let i = 0; i < 7; i++) {
    const key = addDaysKey(i);
    const data = calendar2026[key];

    if (!data) {
      lines.push(`<b>${e(key)}</b>`);
      lines.push("Подаци још нису уписани.");
      lines.push("");
      continue;
    }

    lines.push(`<b>${e(data.civilDate)}, ${e(data.day || "")}</b>`);
    lines.push(e(data.title || "Није уписано"));
    lines.push(formatFastLine(data));
    lines.push("");
  }

  return lines.join("\n").trim();
}

function formatPost(data) {
  const isFasting = hasFast(data);

  return `☦️ <b>Пост за данас</b>

📅 ${e(data.civilDate)}

${isFasting ? "Данас је пост." : "Данас нема поста."}
${data.fastingType ? `Тип: ${e(data.fastingType)}` : `Тип: ${e(data.fasting || "Није уписано")}`}

<b>Напомена</b>
${e(data.note || "Нема напомене.")}`;
}

function formatSaintCommand(data) {
  return `☦️ <b>Светитељ дана</b>

${e(data.title || "Није уписано")}

<b>Остали помени</b>
${formatOtherSaints(data.saints, data.title)}`;
}

function formatScripture(data) {
  return `☦️ <b>Свето Писмо за данас</b>

<b>Апостол</b>
${e(data.apostle || "Није уписано")}

<b>Јеванђеље</b>
${e(data.gospel || "Није уписано")}`;
}

function formatTropar(data) {
  return `☦️ <b>Тропар дана</b>

<b>${e(data.title || "")}</b>

${e(data.tropar || "Тропар још није уписан за овај датум.")}`;
}

function formatKondak(data) {
  return `☦️ <b>Кондак дана</b>

<b>${e(data.title || "")}</b>

${e(data.kondak || "Кондак још није уписан за овај датум.")}`;
}

function formatIcon(data) {
  return `☦️ <b>Икона дана</b>

${e(data.title || "Није уписано")}

${data.icon ? e(data.icon) : "Икона још није додата."}`;
}

function formatOtherSaints(saints, title) {
  if (!saints || saints.length === 0) {
    return "Није уписано";
  }

  const filtered = saints.filter((saint) => saint && saint !== title);
  const list = filtered.length > 0 ? filtered : saints;

  return list.map((saint) => `• ${e(saint)}`).join("\n");
}

function formatFastLine(data) {
  return hasFast(data) ? `🔴 Пост: ${e(data.fasting || "да")}` : "🟢 Без поста";
}

function hasFast(data) {
  const fasting = `${data.fasting || ""} ${data.fastingType || ""}`.toLowerCase();
  return fasting.includes("пост") || fasting.includes("вода") || fasting.includes("уље") || fasting.includes("риба");
}

function missingDateMessage(dateKey) {
  return `☦️ За датум ${e(dateKey)} још нису додати подаци у календар.

Додај тај датум у:
src/data/calendar-2026.js`;
}

function e(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
