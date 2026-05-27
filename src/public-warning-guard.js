import privateWorker from "./private-entry.js";

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
