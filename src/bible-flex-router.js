import app from "./userid-router.js";

const BIBLE_TRANSLATION = "srkdekavski";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return app.fetch(request, env, ctx);

    let update;
    try {
      update = await request.clone().json();
    } catch {
      return app.fetch(request, env, ctx);
    }

    const message = update.message || update.edited_message;
    if (!message?.text || message.from?.is_bot) return app.fetch(request, env, ctx);

    const chatId = message.chat.id;
    const threadId = message.message_thread_id;
    const text = message.text.trim();
    const lower = text.toLowerCase();

    if (!isCommand(lower, ["/svpismo", "/свписмо", "/sveto_pismo", "/свето_писмо"])) {
      return app.fetch(request, env, ctx);
    }

    const args = text.replace(/^\/\S+\s*/u, "").trim();
    if (!args) return sendHelp(chatId, threadId);

    const parsed = parseReference(args);
    if (!parsed.ok) return sendHelp(chatId, threadId, true);

    const result = await fetchBiblePassage(parsed.queryReference);
    if (!result.ok) {
      return send(chatId, `📖 <b>Свето Писмо</b>\n\nНисам нашао цитат.\n\nРеференца: <code>${esc(parsed.displayReference)}</code>\nРазлог: ${esc(result.error || "непознато")}`, threadId);
    }

    return send(chatId, formatPassage(parsed.displayReference, result.verses), threadId);
  }
};

function sendHelp(chatId, threadId, unknown = false) {
  const intro = unknown ? "Не препознајем референцу." : "Унеси место из Светог Писма.";
  return send(chatId,
    `📖 <b>Свето Писмо</b>\n\n${intro}\n\nРади и са различитим писањем:\n<code>/свписмо Римљанима 2:14-15</code>\n<code>/свписмо Рим 2,14-15</code>\n<code>/свписмо Друга Петрова 2:6</code>\n<code>/svpismo 2 Petrova 2:6</code>\n<code>/svpismo II Petrova 2:6</code>\n<code>/свписмо Мт 5:3-12</code>`,
    threadId
  );
}

function parseReference(input) {
  const raw = String(input || "")
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");

  // Подршка за: Рим 2:14-15, Рим 2,14-15, Jn3:16, Друга Петрова 2:6.
  const match = raw.match(/^(.+?)\s*(\d+)\s*[:.,]\s*([\d\s,\-]+)$/u);
  if (!match) return { ok: false };

  const rawBook = match[1].trim();
  const chapter = match[2].trim();
  const verses = match[3].replace(/\s+/g, "").replace(/,+/g, ",").replace(/-+/g, "-").trim();
  if (!/^\d+([\-,]\d+)*$/u.test(verses)) return { ok: false };

  const book = findBook(rawBook);
  if (!book) return { ok: false };

  return {
    ok: true,
    queryReference: `${book.queryName} ${chapter}:${verses}`,
    displayReference: `${book.displayName} ${chapter}:${verses}`
  };
}

function findBook(rawBook) {
  const candidates = normalizeBookInput(rawBook);
  for (const key of candidates) {
    if (BOOKS[key]) return BOOKS[key];
  }
  return null;
}

function normalizeBookInput(value) {
  let v = transliterateSerbian(String(value || "").toLowerCase())
    .replace(/[.]/g, " ")
    .replace(/\bposlanica\b/g, " ")
    .replace(/\bposlanice\b/g, " ")
    .replace(/\bsvetog\b|\bsv\b|\bapostola\b|\bapostol\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  v = v
    .replace(/^prva\s+/u, "1 ")
    .replace(/^druga\s+/u, "2 ")
    .replace(/^treca\s+/u, "3 ")
    .replace(/^prvo\s+/u, "1 ")
    .replace(/^drugo\s+/u, "2 ")
    .replace(/^trece\s+/u, "3 ")
    .replace(/^i\s+/u, "1 ")
    .replace(/^ii\s+/u, "2 ")
    .replace(/^iii\s+/u, "3 ")
    .replace(/\s+/g, " ")
    .trim();

  const noSpaces = v.replace(/\s+/g, "");
  const withoutCase = v
    .replace(/\bpetrova\b/g, "petar")
    .replace(/\bpetrovu\b/g, "petar")
    .replace(/\bpeter\b/g, "petar")
    .replace(/\bpetr\b/g, "petar")
    .replace(/\bjovanova\b/g, "jovan")
    .replace(/\bjovanovu\b/g, "jovan")
    .replace(/\bkorincanima\b/g, "kor")
    .replace(/\bsolunjanima\b/g, "sol")
    .replace(/\btimotiju\b/g, "tim")
    .replace(/\s+/g, " ")
    .trim();

  return Array.from(new Set([v, withoutCase, withoutCase.replace(/^(\d)/, "$1 "), withoutCase.replace(/^(\d)(.+)$/u, "$1 $2"), withoutCase, withoutCase.replace("petrova", "petar"), withoutCase.replace("jovanova", "jovan"), withoutCase.replace("korincanima", "kor"), withoutCase.replace("solunjanima", "sol"), withoutCase.replace("timotiju", "tim"), withoutCase, withoutCase.replace("mt", "matej"), withoutCase.replace("jn", "jovan"), withoutCase.replace("rim", "rimljanima"), withoutCase.replace("dap", "dela"), withoutCase, withoutCase.replace("pet", "petar"), withoutCase.replace("petr", "petar"), withoutCase.replace("ptr", "petar"), withoutCase, withoutCase.replace(/^(\d)petrova$/u, "$1 petar"), withoutCase.replace(/^(\d)pet$/u, "$1 petar"), withoutCase.replace(/^(\d)petr$/u, "$1 petar"), withoutCase.replace(/^(\d)ptr$/u, "$1 petar"), withoutCase.replace(/^(\d)jov$/u, "$1 jovan"), withoutCase.replace(/^(\d)jn$/u, "$1 jovan"), withoutCase.replace(/^(\d)kor$/u, "$1 kor"), withoutCase.replace(/^(\d)sol$/u, "$1 sol"), withoutCase.replace(/^(\d)tim$/u, "$1 tim"), withoutCase.replace(/^(\d)(.+)$/u, "$1 $2"), withoutCase.replace(/^(\d)petar$/u, "$1 petar"), withoutCase.replace(/^(\d)jovan$/u, "$1 jovan"), withoutCase.replace(/^(\d)kor$/u, "$1 kor"), withoutCase.replace(/^(\d)sol$/u, "$1 sol"), withoutCase.replace(/^(\d)tim$/u, "$1 tim"), withoutCase.replace(/^(\d)(petar|jovan|kor|sol|tim)$/u, "$1 $2"), withoutCase.replace(/^(\d)(petrova)$/u, "$1 petar"), withoutCase.replace(/^(\d)(jovanova)$/u, "$1 jovan"), withoutCase.replace(/^(\d)(korincanima)$/u, "$1 kor"), withoutCase.replace(/^(\d)(solunjanima)$/u, "$1 sol"), withoutCase.replace(/^(\d)(timotiju)$/u, "$1 tim"), withoutCase.replace(/^(\d)(.+)$/u, "$1 $2"), withoutCase.replace(/^(\d)(pet|petr|ptr)$/u, "$1 petar"), withoutCase.replace(/^(\d)(jov|jn)$/u, "$1 jovan"), withoutCase.replace(/^(\d)(kor)$/u, "$1 kor"), withoutCase.replace(/^(\d)(sol)$/u, "$1 sol"), withoutCase.replace(/^(\d)(tim)$/u, "$1 tim"), withoutCase.replace(/^(\d)(.+)$/u, "$1 $2"), withoutCase.replace(/^(\d)(petrova|petra)$/u, "$1 petar"), withoutCase.replace(/^(\d)(jovanova)$/u, "$1 jovan"), withoutCase.replace(/^(\d)(korincanima)$/u, "$1 kor"), withoutCase.replace(/^(\d)(solunjanima)$/u, "$1 sol"), withoutCase.replace(/^(\d)(timotiju)$/u, "$1 tim"), withoutCase.replace(/^(\d)(.+)$/u, "$1 $2"), withoutCase.replace(/^(\d)(petar)$/u, "$1 petar"), withoutCase.replace(/^(\d)(jovan)$/u, "$1 jovan"), withoutCase.replace(/^(\d)(kor)$/u, "$1 kor"), withoutCase.replace(/^(\d)(sol)$/u, "$1 sol"), withoutCase.replace(/^(\d)(tim)$/u, "$1 tim"), withoutCase.replace(/^(\d)(.+)$/u, "$1 $2"), withoutCase, withoutCase.replace(/^(\d)/, "$1 "), withoutCase.replace(/^(\d)(petar|petrova|petra|pet|petr|ptr)$/u, "$1 petar"), withoutCase.replace(/^(\d)(jovan|jovanova|jov|jn)$/u, "$1 jovan"), withoutCase.replace(/^(\d)(korincanima|kor)$/u, "$1 kor"), withoutCase.replace(/^(\d)(solunjanima|sol)$/u, "$1 sol"), withoutCase.replace(/^(\d)(timotiju|tim)$/u, "$1 tim"), withoutCase.replace(/^(\d)(.+)$/u, "$1 $2"), withoutCase.replace(/^(\d)\s*(.+)$/u, "$1 $2"), withoutCase.replace(/^(\d)(.+)$/u, "$1 $2"), withoutCase.replace(/^(\d)(petrova)$/u, "$1 petar"), withoutCase.replace(/^(\d)(petra)$/u, "$1 petar"), withoutCase.replace(/^(\d)(pet)$/u, "$1 petar"), withoutCase.replace(/^(\d)(petr)$/u, "$1 petar"), withoutCase.replace(/^(\d)(ptr)$/u, "$1 petar"), withoutCase.replace(/^(\d)(jovanova)$/u, "$1 jovan"), withoutCase.replace(/^(\d)(jov)$/u, "$1 jovan"), withoutCase.replace(/^(\d)(jn)$/u, "$1 jovan"), withoutCase.replace(/^(\d)(kor)$/u, "$1 kor"), withoutCase.replace(/^(\d)(sol)$/u, "$1 sol"), withoutCase.replace(/^(\d)(tim)$/u, "$1 tim"), v, withoutCase]));
}

function transliterateSerbian(value) {
  const map = { "а":"a", "б":"b", "в":"v", "г":"g", "д":"d", "ђ":"dj", "е":"e", "ж":"z", "з":"z", "и":"i", "ј":"j", "к":"k", "л":"l", "љ":"lj", "м":"m", "н":"n", "њ":"nj", "о":"o", "п":"p", "р":"r", "с":"s", "т":"t", "ћ":"c", "у":"u", "ф":"f", "х":"h", "ц":"c", "ч":"c", "џ":"dz", "ш":"s", "š":"s", "č":"c", "ć":"c", "ž":"z", "đ":"dj" };
  return Array.from(value).map((char) => map[char] || char).join("");
}

async function fetchBiblePassage(queryReference) {
  const url = `https://query.getbible.net/v2/${BIBLE_TRANSLATION}/${encodeURIComponent(queryReference)}`;
  try {
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!response.ok) return { ok: false, error: `GetBible HTTP ${response.status}` };
    const data = await response.json();
    const verses = extractVerses(data);
    if (!verses.length) return { ok: false, error: "одговор је без стихова" };
    return { ok: true, verses };
  } catch (error) {
    return { ok: false, error: error?.message || "request није успео" };
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

function formatPassage(reference, verses) {
  const lines = verses.slice(0, 30).map((v) => `${v.verse}. ${esc(v.text)}`);
  const truncated = verses.length > 30 ? "\n\n<i>Приказано је првих 30 стихова.</i>" : "";
  return `📖 <b>${esc(reference)}</b>\n\n${lines.join("\n")}${truncated}\n\n<i>Превод: Даничић-Караџић, екавски.</i>`;
}

function b(queryName, displayName) { return { queryName, displayName }; }

const BOOKS = {
  "postanje": b("Genesis", "Постање"), "1 mojsijeva": b("Genesis", "Постање"),
  "izlazak": b("Exodus", "Излазак"), "2 mojsijeva": b("Exodus", "Излазак"),
  "levitska": b("Leviticus", "Левитска"), "3 mojsijeva": b("Leviticus", "Левитска"),
  "brojevi": b("Numbers", "Бројеви"), "4 mojsijeva": b("Numbers", "Бројеви"),
  "ponovljeni zakoni": b("Deuteronomy", "Поновљени закони"), "5 mojsijeva": b("Deuteronomy", "Поновљени закони"),
  "isus navin": b("Joshua", "Исус Навин"), "sudije": b("Judges", "Судије"), "ruta": b("Ruth", "Рута"),
  "1 samuilova": b("1 Samuel", "1. Самуилова"), "2 samuilova": b("2 Samuel", "2. Самуилова"),
  "1 carevima": b("1 Kings", "1. Царевима"), "2 carevima": b("2 Kings", "2. Царевима"),
  "1 dnevnika": b("1 Chronicles", "1. Дневника"), "2 dnevnika": b("2 Chronicles", "2. Дневника"),
  "jezdra": b("Ezra", "Јездра"), "nemija": b("Nehemiah", "Немија"), "jestira": b("Esther", "Јестира"),
  "jov": b("Job", "Јов"), "psalam": b("Psalms", "Псалам"), "psalmi": b("Psalms", "Псалми"),
  "price": b("Proverbs", "Приче"), "propovednik": b("Ecclesiastes", "Проповедник"), "pesma nad pesmama": b("Song of Solomon", "Песма над песмама"),
  "isaija": b("Isaiah", "Исаија"), "jeremija": b("Jeremiah", "Јеремија"), "plac jeremijin": b("Lamentations", "Плач Јеремијин"),
  "jezekilj": b("Ezekiel", "Језекиљ"), "danilo": b("Daniel", "Данило"), "osija": b("Hosea", "Осија"), "joil": b("Joel", "Јоил"), "amos": b("Amos", "Амос"), "avdija": b("Obadiah", "Авдија"), "jona": b("Jonah", "Јона"), "mihej": b("Micah", "Михеј"), "naum": b("Nahum", "Наум"), "avakum": b("Habakkuk", "Авакум"), "sofonija": b("Zephaniah", "Софонија"), "agej": b("Haggai", "Агеј"), "zaharija": b("Zechariah", "Захарија"), "malahija": b("Malachi", "Малахија"),
  "matej": b("Matthew", "Матеј"), "mt": b("Matthew", "Матеј"), "matthew": b("Matthew", "Матеј"),
  "marko": b("Mark", "Марко"), "mk": b("Mark", "Марко"),
  "luka": b("Luke", "Лука"), "lk": b("Luke", "Лука"),
  "jovan": b("John", "Јован"), "jn": b("John", "Јован"), "john": b("John", "Јован"),
  "dela": b("Acts", "Дела апостолска"), "dap": b("Acts", "Дела апостолска"), "acts": b("Acts", "Дела апостолска"),
  "rimljanima": b("Romans", "Римљанима"), "rim": b("Romans", "Римљанима"), "romans": b("Romans", "Римљанима"),
  "1 korincanima": b("1 Corinthians", "1. Коринћанима"), "1 kor": b("1 Corinthians", "1. Коринћанима"),
  "2 korincanima": b("2 Corinthians", "2. Коринћанима"), "2 kor": b("2 Corinthians", "2. Коринћанима"),
  "galatima": b("Galatians", "Галатима"), "efescima": b("Ephesians", "Ефесцима"), "filibljanima": b("Philippians", "Филибљанима"), "kolosanima": b("Colossians", "Колошанима"),
  "1 solunjanima": b("1 Thessalonians", "1. Солуњанима"), "1 sol": b("1 Thessalonians", "1. Солуњанима"),
  "2 solunjanima": b("2 Thessalonians", "2. Солуњанима"), "2 sol": b("2 Thessalonians", "2. Солуњанима"),
  "1 timotiju": b("1 Timothy", "1. Тимотију"), "1 tim": b("1 Timothy", "1. Тимотију"),
  "2 timotiju": b("2 Timothy", "2. Тимотију"), "2 tim": b("2 Timothy", "2. Тимотију"),
  "titu": b("Titus", "Титу"), "filimonu": b("Philemon", "Филимону"), "jevrejima": b("Hebrews", "Јеврејима"), "jevrecima": b("Hebrews", "Јеврејима"),
  "jakovljeva": b("James", "Јаковљева"), "jakov": b("James", "Јаковљева"),
  "1 petrova": b("1 Peter", "1. Петрова"), "1 petar": b("1 Peter", "1. Петрова"), "1 pet": b("1 Peter", "1. Петрова"),
  "2 petrova": b("2 Peter", "2. Петрова"), "2 petar": b("2 Peter", "2. Петрова"), "2 pet": b("2 Peter", "2. Петрова"),
  "1 jovanova": b("1 John", "1. Јованова"), "1 jovan": b("1 John", "1. Јованова"), "1 jov": b("1 John", "1. Јованова"),
  "2 jovanova": b("2 John", "2. Јованова"), "2 jovan": b("2 John", "2. Јованова"), "2 jov": b("2 John", "2. Јованова"),
  "3 jovanova": b("3 John", "3. Јованова"), "3 jovan": b("3 John", "3. Јованова"), "3 jov": b("3 John", "3. Јованова"),
  "judina": b("Jude", "Јудина"), "juda": b("Jude", "Јудина"), "otkrivenje": b("Revelation", "Откривење")
};

function isCommand(text, commands) { return commands.some((command) => text === command || text.startsWith(command + " ") || text.startsWith(command + "@")); }
function send(chatId, text, threadId) {
  const payload = { method: "sendMessage", chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (threadId !== undefined && threadId !== null) payload.message_thread_id = threadId;
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}
function esc(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
