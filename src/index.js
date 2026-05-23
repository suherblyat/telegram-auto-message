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
      reply = `☦️ *Православни бот*

Команде:

*/помоћ* - приказује списак команди
*/правила* - правила групе
*/календар* - дневни црквени календар
*/пост* - да ли је данас пост и који је тип поста
*/сутра* - преглед за сутрашњи дан
*/недеља* - преглед наредних 7 дана
*/светитељ* - светитељ или празник дана
*/икона* - икона дана
*/свписмо* - дневно читање из Светог Писма
*/пролог* - Охридски пролог за данас
*/тропар* - тропар дана
*/кондак* - кондак дана
*/молитва* - кратка молитва
*/цитат* - насумичан православни цитат
*/линкови* - корисни православни линкови`;
    }

    else if (isCommand(text, ["/pravila", "/правила"])) {
      reply = `☦️ *Правила групе*

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
      reply = today
        ? `☦️ *Пост за данас*

Датум: ${today.civilDate}
Дан: ${today.day}

Пост: ${today.fasting || "Није уписано"}
Тип: ${today.fastingType || "Није уписано"}

Напомена:
${today.note || "Нема напомене."}`
        : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/sutra", "/сутра"])) {
      reply = tomorrow ? formatTomorrow(tomorrow) : missingDateMessage(tomorrowKey);
    }

    else if (isCommand(text, ["/nedelja", "/недеља"])) {
      reply = formatWeek();
    }

    else if (isCommand(text, ["/svetitelj", "/светитељ"])) {
      reply = today
        ? `☦️ *Светитељ / празник дана*

${today.title || "Није уписано"}

${formatSaints(today.saints)}`
        : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/ikona", "/икона"])) {
      reply = today
        ? `☦️ *Икона дана*

${today.title || "Није уписано"}

Путања слике:
${today.icon || "Икона још није додата."}`
        : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/svpismo", "/svpisмо", "/свписмо"])) {
      reply = today
        ? `☦️ *Свето Писмо за данас*

Апостол:
${today.apostle || "Није уписано"}

Јеванђеље:
${today.gospel || "Није уписано"}`
        : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/prolog", "/пролог"])) {
      reply = today
        ? `☦️ *Охридски пролог*

${today.prolog || "Пролог још није уписан за овај датум."}`
        : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/tropar", "/тропар"])) {
      reply = today
        ? `☦️ *Тропар дана*

${today.title || ""}

${today.tropar || "Тропар још није уписан за овај датум."}`
        : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/kondak", "/кондак"])) {
      reply = today
        ? `☦️ *Кондак дана*

${today.title || ""}

${today.kondak || "Кондак још није уписан за овај датум."}`
        : missingDateMessage(todayKey);
    }

    else if (isCommand(text, ["/molitva", "/молитва"])) {
      reply = `☦️ *Молитва*

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

      reply = quotes[Math.floor(Math.random() * quotes.length)];
    }

    else if (isCommand(text, ["/linkovi", "/линкови"])) {
      reply = `☦️ *Корисни линкови*

Охридски пролог:
https://www.pravoslavnikalendar.rs/prolog/

Свето Писмо:
https://www.svetopismo.info/

Светосавље:
https://svetosavlje.org/

СПЦ:
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
      parse_mode: "Markdown",
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

function addDaysKey(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

function formatCalendar(data) {
  return `☦️ *Календар*

Датум: ${data.civilDate}
Црквени датум: ${data.churchDate || "Није уписано"}
Дан: ${data.day}

*${data.title || "Није уписано"}*

Светитељи:
${formatSaints(data.saints)}

Тип празника:
${data.feastType || "Није уписано"}

Пост:
${data.fasting || "Није уписано"}
${data.fastingType ? `Тип: ${data.fastingType}` : ""}

Апостол:
${data.apostle || "Није уписано"}

Јеванђеље:
${data.gospel || "Није уписано"}

Напомена:
${data.note || "Нема напомене."}`;
}

function formatTomorrow(data) {
  return `☦️ *Сутра*

Датум: ${data.civilDate}
Црквени датум: ${data.churchDate || "Није уписано"}
Дан: ${data.day}

*${data.title || "Није уписано"}*

Светитељи:
${formatSaints(data.saints)}

Пост:
${data.fasting || "Није уписано"}
${data.fastingType ? `Тип: ${data.fastingType}` : ""}

Апостол:
${data.apostle || "Није уписано"}

Јеванђеље:
${data.gospel || "Није уписано"}`;
}

function formatWeek() {
  let lines = ["☦️ *Наредних 7 дана*", ""];

  for (let i = 0; i < 7; i++) {
    const key = addDaysKey(i);
    const data = calendar2026[key];

    if (!data) {
      lines.push(`${key}: није уписано`);
      continue;
    }

    lines.push(`${data.civilDate} - ${data.day}`);
    lines.push(`${data.title || "Није уписано"}`);
    lines.push(`Пост: ${data.fasting || "Није уписано"}`);
    lines.push("");
  }

  return lines.join("\n");
}

function formatSaints(saints) {
  if (!saints || saints.length === 0) {
    return "Није уписано";
  }

  return saints.map((saint) => `- ${saint}`).join("\n");
}

function missingDateMessage(dateKey) {
  return `☦️ За датум ${dateKey} још нису додати подаци у календар.

Додај тај датум у:
src/data/calendar-2026.js`;
}
