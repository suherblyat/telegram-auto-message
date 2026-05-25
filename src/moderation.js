export async function handleModeration({ message, env, chatId, threadId, sendGroupMessage }) {
  if (!message || !message.text) return null;
  if (message.from?.is_bot) return null;

  const originalText = message.text.trim();
  const text = normalizeText(originalText);

  if (!text || isCommand(text)) return null;

  const obvious = getObviousViolation(text);

  if (obvious) {
    return sendGroupMessage(
      chatId,
      formatPublicWarning(obvious),
      threadId
    );
  }

  const risk = calculateRisk(text, message);

  if (risk.score < 4) return null;

  const aiResult = await analyzeWithAI({ text: originalText, risk, message, env });

  if (aiResult.decision !== "OK") {
    await sendAdminReport({ env, message, chatId, originalText, risk, aiResult });
  }

  return null;
}

function isCommand(text) {
  return text.startsWith("/");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/š/g, "s")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/ž/g, "z")
    .replace(/đ/g, "dj")
    .replace(/[!?.:,;()\[\]{}"'`´“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getObviousViolation(text) {
  if (hasAny(text, HARD_PROFANITY)) return "псовка / простачки речник";
  if (hasAny(text, HARD_INSULTS)) return "лична увреда";
  if (hasSpamLink(text)) return "спам линк";
  if (isCapsSpam(text)) return "caps spam";
  if (hasDirectBlasphemy(text)) return "ругање светињама";

  return null;
}

function calculateRisk(text, message) {
  const reasons = [];
  let score = 0;

  const sensitiveTheology = hasAny(text, THEOLOGY_SENSITIVE);
  const churchCriticism = hasAny(text, CHURCH_CRITICISM);
  const sexualTopic = hasAny(text, SEXUAL_TOPIC);
  const aggressiveTone = hasAny(text, AGGRESSIVE_TONE);
  const mockingTone = hasAny(text, MOCKING_PHRASES);
  const longMessage = text.length > 700;

  // Важно: саме речи као „јерес“, „секта“, „католик“, „папа“ НЕ дижу ризик.
  // Дижу ризик само ако су спојене са агресијом, ругањем, нападом или дугачким rant-ом.
  score += addRisk(reasons, sensitiveTheology && aggressiveTone, 3, "осетљива богословска тема + оштар тон");
  score += addRisk(reasons, sensitiveTheology && mockingTone, 3, "осетљива богословска тема + могуће ругање");
  score += addRisk(reasons, sensitiveTheology && churchCriticism, 3, "осетљива богословска тема + критика Цркве/свештенства");
  score += addRisk(reasons, sensitiveTheology && longMessage, 1, "дугачка порука о осетљивој богословској теми");

  score += addRisk(reasons, churchCriticism, 3, "могућа критика Цркве/свештенства");
  score += addRisk(reasons, sexualTopic, 3, "осетљива морална тема");
  score += addRisk(reasons, aggressiveTone, 2, "оштрији тон");
  score += addRisk(reasons, mockingTone, 2, "могуће ругање/провокација");
  score += addRisk(reasons, longMessage && (aggressiveTone || mockingTone || churchCriticism), 1, "дугачак оштрији rant");
  score += addRisk(reasons, hasManyQuestionMarks(text) && (aggressiveTone || mockingTone), 1, "провокативан стил питања");

  if (message.forward_from || message.forward_from_chat) {
    score += 1;
    reasons.push("прослеђена порука");
  }

  return { score, reasons };
}

function addRisk(reasons, condition, points, reason) {
  if (!condition) return 0;
  reasons.push(reason);
  return points;
}

async function analyzeWithAI({ text, risk, message, env }) {
  if (!env.AI) {
    return {
      decision: "ADMIN_REVIEW",
      severity: risk.score >= 7 ? "HIGH" : "MEDIUM",
      reason: "AI binding није подешен, али локални филтер је означио поруку.",
      recommendation: "Провери ручно."
    };
  }

  try {
    const prompt = `Ти си православни AI модератор Telegram групе. Не пишеш кориснику и не пишеш у групу. Само помажеш админу да процени поруку.

Правила групе:
1. Без псовки, вређања и личних напада.
2. Критикуј аргумент, не човека.
3. За озбиљне тврдње о Цркви, историји, светитељима, канонима и богословљу потребан је извор.
4. Без спама, троловања и провокација.
5. Без вулгарног, развратног, богохулног или саблажњивог садржаја.
6. О тешким гресима говори се трезвено, не саблажњиво.
7. Без ругања Господу, Пресветој Богородици, светитељима, Светом Писму, Светим Тајнама, иконама, храму и православној вери.
8. Не гуши искрена питања. Ако човек пита нормално, врати OK.
9. Само помињање речи као јерес, секта, католик, протестант, папа, ислам није прекршај.

Локални ризик: ${risk.score}/10
Локални разлози: ${risk.reasons.join(", ") || "нема"}
Корисник: ${message.from?.username ? "@" + message.from.username : message.from?.first_name || "непознат"}

Порука:
"""
${text.slice(0, 2000)}
"""

Врати само JSON без markdown-а:
{
  "decision": "OK" | "ADMIN_REVIEW",
  "severity": "LOW" | "MEDIUM" | "HIGH",
  "reason": "кратак разлог на српском ћирилицом",
  "recommendation": "кратка препорука админу"
}`;

    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: "Одговараш само валидним JSON-ом." },
        { role: "user", content: prompt }
      ]
    });

    const raw = result.response || result.text || "";
    return safeJson(raw) || {
      decision: "ADMIN_REVIEW",
      severity: risk.score >= 7 ? "HIGH" : "MEDIUM",
      reason: "AI није вратио чист JSON, али порука је сумњива.",
      recommendation: "Провери ручно."
    };
  } catch (error) {
    return {
      decision: "ADMIN_REVIEW",
      severity: risk.score >= 7 ? "HIGH" : "MEDIUM",
      reason: "AI анализа није успела, али локални филтер је означио поруку.",
      recommendation: "Провери ручно."
    };
  }
}

async function sendAdminReport({ env, message, chatId, originalText, risk, aiResult }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return;

  const user = message.from?.username
    ? `@${message.from.username}`
    : `${message.from?.first_name || "Непознат"} ${message.from?.last_name || ""}`.trim();

  const report = `⚠️ <b>AI модерација</b>\n\n` +
    `<b>Корисник:</b> ${escapeHtml(user)}\n` +
    `<b>User ID:</b> ${escapeHtml(message.from?.id || "?")}\n` +
    `<b>Chat ID:</b> ${escapeHtml(chatId)}\n` +
    `<b>Ризик:</b> ${escapeHtml(aiResult.severity || "MEDIUM")} / ${risk.score}\n` +
    `<b>Локални разлози:</b> ${escapeHtml(risk.reasons.join(", ") || "нема")}\n` +
    `<b>AI разлог:</b> ${escapeHtml(aiResult.reason || "-")}\n` +
    `<b>Предлог:</b> ${escapeHtml(aiResult.recommendation || "Провери ручно.")}\n\n` +
    `<b>Порука:</b>\n${escapeHtml(originalText.slice(0, 3000))}`;

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.ADMIN_CHAT_ID,
      text: report,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
}

function formatPublicWarning(reason) {
  return `☦️ <b>Опомена</b>\n\nПазимо на речник и тон. Без псовки, увреда, спама и саблажњивог говора.\n\n<i>Разлог: ${escapeHtml(reason)}</i>`;
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function hasSpamLink(text) {
  const hasLink = /https?:\/\/|t\.me\/|telegram\.me\/|www\.|\.com|\.net|\.org|\.ru|\.xyz|\.top/.test(text);
  const hasInvite = /joinchat|start=|ref=|promo|airdrop|crypto|casino|bet|bonus/.test(text);
  return hasLink && hasInvite;
}

function isCapsSpam(text) {
  const letters = text.replace(/[^A-ZА-ЯЉЊЂЋЏŠĐČĆŽ]/g, "");
  return text.length > 40 && letters.length / text.length > 0.6;
}

function hasManyQuestionMarks(text) {
  return (text.match(/\?/g) || []).length >= 4;
}

function hasDirectBlasphemy(text) {
  return hasAny(text, BLASPHEMY_TARGETS) && hasAny(text, MOCKING_PHRASES);
}

function safeJson(raw) {
  try {
    const cleaned = String(raw || "").replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const HARD_PROFANITY = [
  "jeb", "јеб", "jbg", "јбг", "kur", "кур", "piz", "пиз", "pick", "пич",
  "govn", "говн", "sran", "срањ", "majku ti", "мајку ти", "mamu ti", "маму ти"
];

const HARD_INSULTS = [
  "idiot", "идиот", "debil", "дебил", "retard", "ретард", "budalo", "будало",
  "majmune", "мајмуне", "glup si", "глуп си", "stoko", "стоко", "smece", "смеће"
];

const THEOLOGY_SENSITIVE = [
  "јерес", "jeres", "јеретик", "jeretik", "секта", "sekta", "унија", "unija",
  "католик", "katolik", "папа", "papa", "протестант", "protestant", "ислам", "islam",
  "канон", "kanon", "догма", "dogma", "екумен", "ekumen"
];

const CHURCH_CRITICISM = [
  "црква само", "crkva samo", "попови", "popovi", "свештеници су", "svestenici su",
  "епископи су", "episkopi su", "патријарх", "patrijarh", "све је то бизнис", "sve je to biznis",
  "узимају паре", "uzimaju pare", "лажу народ", "lazu narod", "варају народ", "varaju narod"
];

const SEXUAL_TOPIC = [
  "блуд", "blud", "разврат", "razvrat", "порно", "porno", "секс", "seks",
  "силова", "silova", "проститу", "prostitu", "абортус", "abortus"
];

const AGGRESSIVE_TONE = [
  "срам те", "sram te", "ћути", "cuti", "немаш појма", "nemas pojma", "лажеш", "lazes",
  "болестан си", "bolestan si", "ко си ти", "ko si ti", "мрш", "mrs"
];

const MOCKING_PHRASES = [
  "хаха", "haha", "lol", "лол", "смешно", "smesno", "глупост", "glupost",
  "бајка", "bajka", "мит", "mit", "измишљотина", "izmisljotina", "циркус", "cirkus"
];

const BLASPHEMY_TARGETS = [
  "господ", "gospod", "христ", "hrist", "богородиц", "bogorodic", "светитељ", "svetitelj",
  "икон", "ikon", "литурги", "liturgi", "причешћ", "pricesc", "крст", "krst", "јеванђељ", "jevandjelj"
];
