import guardedWorker from "./public-warning-guard.js";

const BIBLE_TRANSLATION = "srkdekavski";

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

    if (isCommand(lower, ["/svpismo", "/свписмо"])) {
      const args = getCommandArgs(text);

      if (!args) {
        return sendGroupMessage(
          message.chat.id,
          "📖 <b>Цитат из Светог Писма</b>\n\nЗа цитат унеси и место:\n<code>/свписмо Римљанима 2:14-15</code>\n<code>/svpismo Jovan 3:16</code>\n\nЗа дневна читања користи:\n<code>/читања</code>",
          message.message_thread_id
        );
      }

      return handleBibleLookup({ message, args });
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

async function handleBibleLookup({ message, args }) {
  const parsed = parseBibleReference(args);

  if (!parsed.ok) {
    return sendGroupMessage(
      message.chat.id,
      "📖 <b>Свето Писмо</b>\n\nНе препознајем референцу. Пробај овако:\n<code>/свписмо Римљанима 2:14-15</code>\n<code>/svpismo Jovan 3:16</code>\n<code>/свписмо Мт 5:3-12</code>",
      message.message_thread_id
    );
  }

  const result = await fetchBiblePassage(parsed.queryReference);

  if (!result.ok) {
    return sendGroupMessage(
      message.chat.id,
      `📖 <b>Свето Писмо</b>\n\nНисам успео да нађем цитат. Разлог: ${escapeHtml(result.error || "непозната грешка")}`,
      message.message_thread_id
    );
  }

  return sendGroupMessage(message.chat.id, formatBiblePassage(parsed.displayReference, result.verses), message.message_thread_id);
}

function parseBibleReference(input) {
  const raw = String(input || "").trim().replace(/\s+/g, " ");
  const match = raw.match(/^(.+?)\s+(\d+)\s*:\s*([\d\s,\-–—]+)$/u);

  if (!match) return { ok: false };

  const rawBook = match[1].trim();
  const chapter = match[2].trim();
  const verses = match[3].replace(/[–—]/g, "-").replace(/\s+/g, "").trim();
  const bookKey = normalizeBookInput(rawBook);
  const book = BOOKS[bookKey];

  if (!book || !/^\d+([\-,]\d+)*$/u.test(verses)) {
    return { ok: false };
  }

  return {
    ok: true,
    queryReference: `${book.queryName} ${chapter}:${verses}`,
    displayReference: `${book.displayName} ${chapter}:${verses}`
  };
}

function normalizeBookInput(value) {
  return transliterateSerbian(String(value || "").toLowerCase())
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function transliterateSerbian(value) {
  const map = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ђ": "dj", "е": "e", "ж": "z", "з": "z", "и": "i", "ј": "j", "к": "k", "л": "l", "љ": "lj", "м": "m", "н": "n", "њ": "nj", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "ћ": "c", "у": "u", "ф": "f", "х": "h", "ц": "c", "ч": "c", "џ": "dz", "ш": "s",
    "š": "s", "č": "c", "ć": "c", "ž": "z", "đ": "dj"
  };

  return Array.from(value).map((char) => map[char] || char).join("");
}

async function fetchBiblePassage(queryReference) {
  const url = `https://query.getbible.net/v2/${BIBLE_TRANSLATION}/${encodeURIComponent(queryReference)}`;

  try {
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) return { ok: false, error: `GetBible HTTP ${response.status}` };

    const data = await response.json();
    const verses = extractVerses(data);

    if (!verses.length) return { ok: false, error: "GetBible је вратио одговор без стихова" };
    return { ok: true, verses };
  } catch (error) {
    return { ok: false, error: error?.message || "GetBible request није успео" };
  }
}

function extractVerses(data) {
  const verses = [];

  function walk(value) {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value !== "object") return;

    const text = value.text || value.verse_text || value.scripture;
    const verse = value.verse || value.verse_nr || value.verse_number || value.nr;

    if (text && verse !== undefined) {
      verses.push({ verse, text: cleanBibleText(text) });
      return;
    }

    Object.values(value).forEach(walk);
  }

  walk(data);
  return verses;
}

function cleanBibleText(value) {
  return String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function formatBiblePassage(reference, verses) {
  const lines = verses.slice(0, 30).map((v) => `${v.verse}. ${escapeHtml(v.text)}`);
  const truncated = verses.length > 30 ? "\n\n<i>Приказано је првих 30 стихова.</i>" : "";
  return `📖 <b>${escapeHtml(reference)}</b>\n\n${lines.join("\n")}${truncated}\n\n<i>Превод: Даничић-Караџић, екавски.</i>`;
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

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function b(queryName, displayName) {
  return { queryName, displayName };
}

const BOOKS = {
  "postanje": b("Genesis", "Постање"),
  "1 mojsijeva": b("Genesis", "Постање"),
  "izlazak": b("Exodus", "Излазак"),
  "2 mojsijeva": b("Exodus", "Излазак"),
  "levitska": b("Leviticus", "Левитска"),
  "3 mojsijeva": b("Leviticus", "Левитска"),
  "brojevi": b("Numbers", "Бројеви"),
  "4 mojsijeva": b("Numbers", "Бројеви"),
  "ponovljeni zakoni": b("Deuteronomy", "Поновљени закони"),
  "5 mojsijeva": b("Deuteronomy", "Поновљени закони"),
  "isus navin": b("Joshua", "Исус Навин"),
  "sudije": b("Judges", "Судије"),
  "ruta": b("Ruth", "Рута"),
  "jov": b("Job", "Јов"),
  "psalam": b("Psalms", "Псалам"),
  "psalmi": b("Psalms", "Псалми"),
  "price": b("Proverbs", "Приче"),
  "propovednik": b("Ecclesiastes", "Проповедник"),
  "isaija": b("Isaiah", "Исаија"),
  "jeremija": b("Jeremiah", "Јеремија"),
  "jezekilj": b("Ezekiel", "Језекиљ"),
  "danilo": b("Daniel", "Данило"),
  "matej": b("Matthew", "Матеј"),
  "mt": b("Matthew", "Матеј"),
  "marko": b("Mark", "Марко"),
  "mk": b("Mark", "Марко"),
  "luka": b("Luke", "Лука"),
  "lk": b("Luke", "Лука"),
  "jovan": b("John", "Јован"),
  "jn": b("John", "Јован"),
  "dela": b("Acts", "Дела апостолска"),
  "dap": b("Acts", "Дела апостолска"),
  "rimljanima": b("Romans", "Римљанима"),
  "rim": b("Romans", "Римљанима"),
  "1 korincanima": b("1 Corinthians", "1. Коринћанима"),
  "1 kor": b("1 Corinthians", "1. Коринћанима"),
  "2 korincanima": b("2 Corinthians", "2. Коринћанима"),
  "2 kor": b("2 Corinthians", "2. Коринћанима"),
  "galatima": b("Galatians", "Галатима"),
  "efescima": b("Ephesians", "Ефесцима"),
  "filibljanima": b("Philippians", "Филибљанима"),
  "kolosanima": b("Colossians", "Колошанима"),
  "1 solunjanima": b("1 Thessalonians", "1. Солуњанима"),
  "2 solunjanima": b("2 Thessalonians", "2. Солуњанима"),
  "1 timotiju": b("1 Timothy", "1. Тимотију"),
  "2 timotiju": b("2 Timothy", "2. Тимотију"),
  "titu": b("Titus", "Титу"),
  "filimonu": b("Philemon", "Филимону"),
  "jevrejima": b("Hebrews", "Јеврејима"),
  "jevrecima": b("Hebrews", "Јеврејима"),
  "jakovljeva": b("James", "Јаковљева"),
  "1 petrova": b("1 Peter", "1. Петрова"),
  "2 petrova": b("2 Peter", "2. Петрова"),
  "1 jovanova": b("1 John", "1. Јованова"),
  "2 jovanova": b("2 John", "2. Јованова"),
  "3 jovanova": b("3 John", "3. Јованова"),
  "judina": b("Jude", "Јудина"),
  "otkrivenje": b("Revelation", "Откривење")
};
