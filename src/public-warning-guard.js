import privateWorker from "./private-entry.js";

const BIBLE_TRANSLATION = "srkdekavski";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return privateWorker.fetch(request, env, ctx);
    }

    const clonedRequest = request.clone();

    let update;
    try {
      update = await clonedRequest.json();
    } catch {
      return privateWorker.fetch(request, env, ctx);
    }

    const message = update.message || update.edited_message;

    if (!message || message.from?.is_bot || !message.text) {
      return privateWorker.fetch(request, env, ctx);
    }

    const originalText = message.text.trim();
    const commandText = originalText.toLowerCase();

    if (isSvpismoCommand(commandText)) {
      const args = getCommandArgs(originalText);
      if (!args) {
        return privateWorker.fetch(request, env, ctx);
      }
      return handleBibleLookup({ message, args });
    }

    if (commandText.startsWith("/")) {
      return privateWorker.fetch(request, env, ctx);
    }

    const text = normalizeText(originalText);

    if (!hasHardProfanity(text) && shouldStayPrivate(text)) {
      await sendAdminOnlyReview({ env, message, originalText, reason: getPrivateReason(text) });
      return new Response("OK", { status: 200 });
    }

    return privateWorker.fetch(request, env, ctx);
  }
};

function isSvpismoCommand(text) {
  return ["/svpismo", "/свписмо"].some((command) =>
    text === command ||
    text.startsWith(command + " ") ||
    text.startsWith(command + "@")
  );
}

function getCommandArgs(originalText) {
  return originalText.replace(/^\/\S+\s*/u, "").trim();
}

async function handleBibleLookup({ message, args }) {
  const chatId = message.chat.id;
  const threadId = message.message_thread_id;
  const parsed = normalizeBibleReference(args);

  if (!parsed.ok) {
    return sendGroupMessage(
      chatId,
      "📖 <b>Свето Писмо</b>\n\nНе препознајем референцу. Пробај овако:\n<code>/свписмо Римљанима 2:14-15</code>\n<code>/svpismo Jovan 3:16</code>\n<code>/свписмо Мт 5:3-12</code>",
      threadId
    );
  }

  const result = await fetchBiblePassage(parsed.queryReference);

  if (!result.ok) {
    return sendGroupMessage(
      chatId,
      `📖 <b>Свето Писмо</b>\n\nНисам успео да нађем цитат. Разлог: ${escapeHtml(result.error || "непозната грешка")}`,
      threadId
    );
  }

  return sendGroupMessage(chatId, formatBiblePassage(parsed.displayReference, result.verses), threadId);
}

function normalizeBibleReference(input) {
  const raw = String(input || "").trim().replace(/\s+/g, " ");
  const normalized = normalizeBookInput(raw);

  const aliases = BOOK_ALIASES
    .slice()
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const item of aliases) {
    if (normalized === item.alias || normalized.startsWith(item.alias + " ")) {
      const rest = raw.slice(findOriginalBookLength(raw, item.alias)).trim();
      if (!/^\d+\s*:\s*\d+([\-,]\s*\d+)*$/u.test(rest)) {
        return { ok: false };
      }
      const cleanRest = rest.replace(/\s+/g, "").replace(/,/g, ",");
      return {
        ok: true,
        queryReference: `${item.queryName} ${cleanRest}`,
        displayReference: `${item.displayName} ${cleanRest}`
      };
    }
  }

  if (/^[1-3]?\s?[a-z]+\s+\d+\s*:\s*\d+/i.test(raw)) {
    return { ok: true, queryReference: raw, displayReference: raw };
  }

  return { ok: false };
}

function findOriginalBookLength(raw, normalizedAlias) {
  const words = raw.split(/\s+/);
  let built = "";
  for (let i = 0; i < words.length; i++) {
    built = `${built} ${words[i]}`.trim();
    if (normalizeBookInput(built) === normalizedAlias) {
      return built.length;
    }
  }
  return raw.length;
}

function normalizeBookInput(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/љ/g, "lj").replace(/њ/g, "nj").replace(/ђ/g, "dj").replace(/џ/g, "dz")
    .replace(/ј/g, "j").replace(/ч/g, "c").replace(/ћ/g, "c").replace(/ш/g, "s").replace(/ж/g, "z")
    .replace(/š/g, "s").replace(/č/g, "c").replace(/ć/g, "c").replace(/ž/g, "z").replace(/đ/g, "dj")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchBiblePassage(queryReference) {
  const url = `https://query.getbible.net/v2/${BIBLE_TRANSLATION}/${encodeURIComponent(queryReference)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "pravoslavni-telegram-bot"
      }
    });

    if (!response.ok) {
      return { ok: false, error: `GetBible HTTP ${response.status}` };
    }

    const data = await response.json();
    const verses = extractVerses(data);

    if (!verses.length) {
      return { ok: false, error: "нема стихова у одговору" };
    }

    return { ok: true, verses };
  } catch (error) {
    return { ok: false, error: error?.message || "GetBible request није успео" };
  }
}

function extractVerses(data) {
  const verses = [];

  function walk(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (typeof value !== "object") return;

    const text = value.text || value.verse_text || value.scripture;
    const verse = value.verse || value.verse_nr || value.verse_number || value.nr;
    const chapter = value.chapter || value.chapter_nr || value.chapter_number;

    if (text && verse !== undefined) {
      verses.push({
        chapter,
        verse,
        text: cleanBibleText(text)
      });
      return;
    }

    Object.values(value).forEach(walk);
  }

  walk(data);
  return verses;
}

function cleanBibleText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBiblePassage(reference, verses) {
  const lines = verses.slice(0, 30).map((v) => {
    const number = v.verse !== undefined ? `${v.verse}. ` : "";
    return `${number}${escapeHtml(v.text)}`;
  });

  const truncated = verses.length > 30 ? "\n\n<i>Приказано је првих 30 стихова.</i>" : "";

  return `📖 <b>${escapeHtml(reference)}</b>\n\n${lines.join("\n")}${truncated}\n\n<i>Превод: Даничић-Караџић, екавски.</i>`;
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

function shouldStayPrivate(text) {
  return (
    includesAny(text, THEOLOGY_SENSITIVE) ||
    includesAny(text, CHURCH_CRITICISM) ||
    includesAny(text, CLERGY_ACCUSATION) ||
    includesAny(text, HARD_INSULTS) ||
    includesAny(text, AGGRESSIVE_TONE) ||
    includesAny(text, MOCKING_PHRASES)
  );
}

function getPrivateReason(text) {
  const reasons = [];
  if (includesAny(text, THEOLOGY_SENSITIVE)) reasons.push("осетљива богословска тема");
  if (includesAny(text, CHURCH_CRITICISM)) reasons.push("критика Цркве/свештенства");
  if (includesAny(text, CLERGY_ACCUSATION)) reasons.push("оптужба на свештенство/епископе");
  if (includesAny(text, HARD_INSULTS)) reasons.push("лична увреда без тешке псовке");
  if (includesAny(text, AGGRESSIVE_TONE)) reasons.push("оштрији тон");
  if (includesAny(text, MOCKING_PHRASES)) reasons.push("могуће ругање/провокација");
  return reasons.join(", ") || "приватна админ провера";
}

function hasHardProfanity(text) {
  return includesAny(text, HARD_PROFANITY_ROOTS);
}

async function sendAdminOnlyReview({ env, message, originalText, reason }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return { ok: false };

  const report = `⚠️ <b>Приватна админ провера</b>\n\n` +
    `<b>Корисник:</b> ${escapeHtml(formatUser(message.from))}\n` +
    `<b>User ID:</b> ${escapeHtml(message.from?.id || "?")}\n` +
    `<b>Chat ID:</b> ${escapeHtml(message.chat?.id || "?")}\n` +
    `<b>Thread ID:</b> ${escapeHtml(message.message_thread_id || "нема")}\n` +
    `<b>Message ID:</b> ${escapeHtml(message.message_id || "?")}\n` +
    `<b>Ниво:</b> MEDIUM\n` +
    `<b>Акција:</b> admin_only_review\n` +
    `<b>Разлог:</b> ${escapeHtml(reason)}\n` +
    `<b>Предлог:</b> Не пишем јавно у групи. Провери ручно ако треба.\n\n` +
    `<b>Порука:</b>\n${escapeHtml(originalText.slice(0, 3000))}`;

  const payload = {
    chat_id: env.ADMIN_CHAT_ID,
    text: report,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };

  if (env.ADMIN_THREAD_ID) {
    payload.message_thread_id = Number(env.ADMIN_THREAD_ID);
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await response.json();
  } catch {
    return { ok: false };
  }
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/š/g, "s").replace(/č/g, "c").replace(/ć/g, "c").replace(/ž/g, "z").replace(/đ/g, "dj")
    .replace(/ђ/g, "дј")
    .replace(/[0]/g, "o").replace(/[1!]/g, "i").replace(/[3]/g, "e").replace(/[4@]/g, "a").replace(/[5$]/g, "s").replace(/[7]/g, "t")
    .replace(/[?.:,;()\[\]{}"'`´“”‘’_+=*~|\\/<>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function formatUser(user) {
  if (!user) return "Непознат";
  if (user.username) return `@${user.username}`;
  return `${user.first_name || ""} ${user.last_name || ""}`.trim() || String(user.id || "Непознат");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const BOOK_ALIASES = [
  { alias: "postanje", queryName: "Genesis", displayName: "Постање" },
  { alias: "1 mojsijeva", queryName: "Genesis", displayName: "Постање" },
  { alias: "izlazak", queryName: "Exodus", displayName: "Излазак" },
  { alias: "2 mojsijeva", queryName: "Exodus", displayName: "Излазак" },
  { alias: "levitska", queryName: "Leviticus", displayName: "Левитска" },
  { alias: "3 mojsijeva", queryName: "Leviticus", displayName: "Левитска" },
  { alias: "brojevi", queryName: "Numbers", displayName: "Бројеви" },
  { alias: "4 mojsijeva", queryName: "Numbers", displayName: "Бројеви" },
  { alias: "ponovljeni zakoni", queryName: "Deuteronomy", displayName: "Поновљени закони" },
  { alias: "5 mojsijeva", queryName: "Deuteronomy", displayName: "Поновљени закони" },
  { alias: "isus navin", queryName: "Joshua", displayName: "Исус Навин" },
  { alias: "sudije", queryName: "Judges", displayName: "Судије" },
  { alias: "ruta", queryName: "Ruth", displayName: "Рута" },
  { alias: "1 samuilova", queryName: "1 Samuel", displayName: "1. Самуилова" },
  { alias: "2 samuilova", queryName: "2 Samuel", displayName: "2. Самуилова" },
  { alias: "1 carevima", queryName: "1 Kings", displayName: "1. Царевима" },
  { alias: "2 carevima", queryName: "2 Kings", displayName: "2. Царевима" },
  { alias: "1 dnevnika", queryName: "1 Chronicles", displayName: "1. Дневника" },
  { alias: "2 dnevnika", queryName: "2 Chronicles", displayName: "2. Дневника" },
  { alias: "jezdra", queryName: "Ezra", displayName: "Јездра" },
  { alias: "nemija", queryName: "Nehemiah", displayName: "Немија" },
  { alias: "jestira", queryName: "Esther", displayName: "Јестира" },
  { alias: "jov", queryName: "Job", displayName: "Јов" },
  { alias: "psalmi", queryName: "Psalms", displayName: "Псалми" },
  { alias: "psalam", queryName: "Psalms", displayName: "Псалам" },
  { alias: "price", queryName: "Proverbs", displayName: "Приче" },
  { alias: "propovednik", queryName: "Ecclesiastes", displayName: "Проповедник" },
  { alias: "pesma nad pesmama", queryName: "Song of Solomon", displayName: "Песма над песмама" },
  { alias: "isaija", queryName: "Isaiah", displayName: "Исаија" },
  { alias: "jeremija", queryName: "Jeremiah", displayName: "Јеремија" },
  { alias: "plac jeremijin", queryName: "Lamentations", displayName: "Плач Јеремијин" },
  { alias: "jezekilj", queryName: "Ezekiel", displayName: "Језекиљ" },
  { alias: "danilo", queryName: "Daniel", displayName: "Данило" },
  { alias: "osija", queryName: "Hosea", displayName: "Осија" },
  { alias: "joil", queryName: "Joel", displayName: "Јоил" },
  { alias: "amos", queryName: "Amos", displayName: "Амос" },
  { alias: "avdija", queryName: "Obadiah", displayName: "Авдија" },
  { alias: "jona", queryName: "Jonah", displayName: "Јона" },
  { alias: "mihej", queryName: "Micah", displayName: "Михеј" },
  { alias: "naum", queryName: "Nahum", displayName: "Наум" },
  { alias: "avakum", queryName: "Habakkuk", displayName: "Авакум" },
  { alias: "sofonija", queryName: "Zephaniah", displayName: "Софонија" },
  { alias: "agej", queryName: "Haggai", displayName: "Агеј" },
  { alias: "zaharija", queryName: "Zechariah", displayName: "Захарија" },
  { alias: "malahija", queryName: "Malachi", displayName: "Малахија" },
  { alias: "matej", queryName: "Matthew", displayName: "Матеј" },
  { alias: "mt", queryName: "Matthew", displayName: "Матеј" },
  { alias: "marko", queryName: "Mark", displayName: "Марко" },
  { alias: "mk", queryName: "Mark", displayName: "Марко" },
  { alias: "luka", queryName: "Luke", displayName: "Лука" },
  { alias: "lk", queryName: "Luke", displayName: "Лука" },
  { alias: "jovan", queryName: "John", displayName: "Јован" },
  { alias: "jn", queryName: "John", displayName: "Јован" },
  { alias: "dela", queryName: "Acts", displayName: "Дела апостолска" },
  { alias: "dap", queryName: "Acts", displayName: "Дела апостолска" },
  { alias: "rimljanima", queryName: "Romans", displayName: "Римљанима" },
  { alias: "rim", queryName: "Romans", displayName: "Римљанима" },
  { alias: "1 korincanima", queryName: "1 Corinthians", displayName: "1. Коринћанима" },
  { alias: "1 kor", queryName: "1 Corinthians", displayName: "1. Коринћанима" },
  { alias: "2 korincanima", queryName: "2 Corinthians", displayName: "2. Коринћанима" },
  { alias: "2 kor", queryName: "2 Corinthians", displayName: "2. Коринћанима" },
  { alias: "galatima", queryName: "Galatians", displayName: "Галатима" },
  { alias: "efescima", queryName: "Ephesians", displayName: "Ефесцима" },
  { alias: "filibljanima", queryName: "Philippians", displayName: "Филибљанима" },
  { alias: "kolosanima", queryName: "Colossians", displayName: "Колошанима" },
  { alias: "1 solunjanima", queryName: "1 Thessalonians", displayName: "1. Солуњанима" },
  { alias: "2 solunjanima", queryName: "2 Thessalonians", displayName: "2. Солуњанима" },
  { alias: "1 timotiju", queryName: "1 Timothy", displayName: "1. Тимотију" },
  { alias: "2 timotiju", queryName: "2 Timothy", displayName: "2. Тимотију" },
  { alias: "titu", queryName: "Titus", displayName: "Титу" },
  { alias: "filimonu", queryName: "Philemon", displayName: "Филимону" },
  { alias: "jevrecima", queryName: "Hebrews", displayName: "Јеврејима" },
  { alias: "jakovljeva", queryName: "James", displayName: "Јаковљева" },
  { alias: "1 petrova", queryName: "1 Peter", displayName: "1. Петрова" },
  { alias: "2 petrova", queryName: "2 Peter", displayName: "2. Петрова" },
  { alias: "1 jovanova", queryName: "1 John", displayName: "1. Јованова" },
  { alias: "2 jovanova", queryName: "2 John", displayName: "2. Јованова" },
  { alias: "3 jovanova", queryName: "3 John", displayName: "3. Јованова" },
  { alias: "judina", queryName: "Jude", displayName: "Јудина" },
  { alias: "otkrivenje", queryName: "Revelation", displayName: "Откривење" }
];

const HARD_PROFANITY_ROOTS = [
  "јеб", "кур", "пиз", "пич", "говн", "срањ", "одјеб",
  "jeb", "kur", "piz", "pick", "govn", "sran", "odjeb"
];

const HARD_INSULTS = [
  "идиот", "дебил", "кретен", "ретард", "будало", "будала", "мајмуне", "мајмун", "глуп си", "глупа си", "стоко", "стока", "смеће", "олош", "морон", "имбецил",
  "idiot", "debil", "kreten", "retard", "budalo", "budala", "majmune", "majmun", "glup si", "glupa si", "stoko", "stoka", "smece", "olos", "moron", "imbecil"
];

const THEOLOGY_SENSITIVE = [
  "јерес", "jeres", "јеретик", "jeretik", "секта", "sekta", "унија", "unija", "унијат", "unijat", "filioque", "филиокве", "католик", "katolik", "папа", "papa", "ватикан", "vatikan", "протестант", "protestant", "ислам", "islam", "канон", "kanon", "догма", "dogma", "екумен", "ekumen", "раскол", "raskol", "новотар", "novotar"
];

const CHURCH_CRITICISM = [
  "црква је бизнис", "crkva je biznis", "све је то бизнис", "sve je to biznis", "црква узима паре", "crkva uzima pare", "лажу народ", "lazu narod", "варају народ", "varaju narod", "црква пере мозак", "crkva pere mozak", "поповска мафија", "popovska mafija", "религија је бајка", "religija je bajka", "православље је мит", "pravoslavlje je mit"
];

const CLERGY_ACCUSATION = [
  "попови су", "popovi su", "свештеници су", "svestenici su", "епископи су", "episkopi su", "владике су", "vladike su", "сви попови", "svi popovi", "сви свештеници", "svi svestenici", "све владике", "sve vladike"
];

const AGGRESSIVE_TONE = [
  "срам те", "sram te", "ћути", "cuti", "зачепи", "zacepi", "немаш појма", "nemas pojma", "лажеш", "lazes", "лажов", "lazov", "ко си ти", "ko si ti", "мрш", "mrs", "не лупај", "ne lupaj", "лупаш", "lupas", "провокатор", "provokator", "трол", "trol"
];

const MOCKING_PHRASES = [
  "хаха", "haha", "lol", "лол", "lmao", "смешно", "smesno", "глупост", "glupost", "бајка", "bajka", "мит", "mit", "измишљотина", "izmisljotina", "циркус", "cirkus", "затуцан", "zatucan"
];
