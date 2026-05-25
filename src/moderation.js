export async function handleModeration({ message, env, chatId, threadId, sendGroupMessage }) {
    if (message.new_chat_members && env.MOD_STATE) {
    for (const member of message.new_chat_members) {
      if (!member?.id || member.is_bot) continue;

      const key = `warn:${chatId}:${member.id}`;
      await env.MOD_STATE.delete(key);

      await sendAdminNotice({
        env,
        message: { ...message, from: member },
        chatId,
        originalText: "Корисник је ушао у групу. Опомене су ресетоване.",
        title: "Reset опомена",
        severity: "LOW",
        reason: "Корисник је поново ушао у групу.",
        recommendation: "Број опомена је обрисан за овог корисника.",
        moderationAction: "reset_warnings"
      });
    }

    return null;
  }
  if (!message || !message.text) return null;
  if (message.from?.is_bot) return null;

  const originalText = message.text.trim();
  const text = normalizeText(originalText);

  if (!text || isCommand(text)) return null;

  const obvious = getObviousViolation(text, env);

  if (obvious) {
    const action = await registerWarning({ env, message, chatId, reason: obvious, originalText });

    await sendAdminNotice({
      env,
      message,
      chatId,
      originalText,
      title: action.title || "Јавна опомена",
      severity: action.severity || "HIGH",
      reason: obvious,
      recommendation: action.recommendation || "Бот је јавно опоменуо корисника без AI анализе, јер је прекршај очигледан.",
      warningCount: action.warningCount,
      moderationAction: action.action
    });

    if (action.action === "mute") {
      await muteUser({ env, chatId, userId: message.from.id, minutes: 10 });
      return sendGroupMessage(chatId, formatMuteWarning(obvious, action.warningCount), threadId);
    }

    if (action.action === "ban") {
      await banUser({ env, chatId, userId: message.from.id });
      return sendGroupMessage(chatId, formatBanWarning(obvious, action.warningCount), threadId);
    }

    return sendGroupMessage(chatId, formatPublicWarning(obvious, action.warningCount), threadId);
  }

  const risk = calculateRisk(text, message, env);

  if (risk.score < 4) return null;

  const aiResult = await analyzeWithAI({ text: originalText, risk, message, env });

  if (aiResult.decision !== "OK") {
    await sendAdminNotice({
      env,
      message,
      chatId,
      originalText,
      title: "AI модерација",
      severity: aiResult.severity || "MEDIUM",
      reason: aiResult.reason || risk.reasons.join(", "),
      recommendation: aiResult.recommendation || "Провери ручно.",
      risk
    });
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
    .replace(/ђ/g, "дј")
    .replace(/[0]/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[?.:,;()\[\]{}"'`´“”‘’_+=*~|\\/<>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getObviousViolation(text, env = {}) {
  const extraHardTerms = getEnvList(env.EXTRA_HARD_TERMS);
  const extraHardInsults = getEnvList(env.EXTRA_HARD_INSULTS);

  if (hasAny(text, HARD_PROFANITY) || hasAny(text, extraHardTerms)) return "псовка / простачки речник";
  if (hasAny(text, HARD_INSULTS) || hasAny(text, extraHardInsults)) return "лична увреда";
  if (hasAny(text, HARD_VULGARITY)) return "вулгаран или саблажњив говор";
  if (hasSpamLink(text)) return "спам линк";
  if (isCapsSpam(text)) return "caps spam";
  if (hasDirectBlasphemy(text)) return "ругање светињама";

  return null;
}

async function registerWarning({ env, message, chatId, reason, originalText }) {
  const userId = message.from?.id;
  if (!env.MOD_STATE || !userId) {
    return { warningCount: null, action: "warn", title: "Јавна опомена" };
  }

  const key = `warn:${chatId}:${userId}`;
  const existing = await env.MOD_STATE.get(key, "json");
  const warningCount = Number(existing?.count || 0) + 1;

  await env.MOD_STATE.put(key, JSON.stringify({
    count: warningCount,
    lastReason: reason,
    lastMessage: originalText.slice(0, 500),
    updatedAt: new Date().toISOString()
  }), { expirationTtl: 60 * 60 * 24 * 30 });

  if (warningCount >= 5) {
    return {
      warningCount,
      action: "ban",
      title: "Бан после више опомена",
      severity: "CRITICAL",
      recommendation: "Корисник је достигао 5 опомена. Бот покушава ban/kick."
    };
  }

  if (warningCount >= 3) {
    return {
      warningCount,
      action: "mute",
      title: "Mute после 3 опомене",
      severity: "HIGH",
      recommendation: "Корисник је достигао 3 опомене. Бот покушава mute на 10 минута."
    };
  }

  return {
    warningCount,
    action: "warn",
    title: "Јавна опомена",
    severity: "HIGH",
    recommendation: "Бот је јавно опоменуо корисника без AI анализе, јер је прекршај очигледан."
  };
}

async function muteUser({ env, chatId, userId, minutes }) {
  if (!env.BOT_TOKEN) return;

  const untilDate = Math.floor(Date.now() / 1000) + minutes * 60;

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/restrictChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate,
      permissions: {
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
        can_change_info: false,
        can_invite_users: false,
        can_pin_messages: false,
        can_manage_topics: false
      }
    })
  });
}

async function banUser({ env, chatId, userId }) {
  if (!env.BOT_TOKEN) return;

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/banChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      user_id: userId,
      revoke_messages: false
    })
  });
}

function calculateRisk(text, message, env = {}) {
  const reasons = [];
  let score = 0;

  const extraReviewTerms = getEnvList(env.EXTRA_REVIEW_TERMS);
  const sensitiveTheology = hasAny(text, THEOLOGY_SENSITIVE);
  const churchCriticism = hasAny(text, CHURCH_CRITICISM);
  const clergyAccusation = hasAny(text, CLERGY_ACCUSATION);
  const clergyMoneyAccusation = hasAny(text, CLERGY_TERMS) && hasAny(text, MONEY_ACCUSATION_TERMS);
  const sexualTopic = hasAny(text, SEXUAL_TOPIC);
  const moralDangerTopic = hasAny(text, MORAL_DANGER_TOPIC);
  const occultTopic = hasAny(text, OCCULT_TOPIC);
  const aggressiveTone = hasAny(text, AGGRESSIVE_TONE);
  const mockingTone = hasAny(text, MOCKING_PHRASES);
  const despairFearTone = hasAny(text, DESPAIR_FEAR_TONE);
  const politicalProvocation = hasAny(text, POLITICAL_PROVOCATION);
  const extraReviewHit = hasAny(text, extraReviewTerms);
  const longMessage = text.length > 700;

  score += addRisk(reasons, sensitiveTheology && aggressiveTone, 3, "осетљива богословска тема + оштар тон");
  score += addRisk(reasons, sensitiveTheology && mockingTone, 3, "осетљива богословска тема + могуће ругање");
  score += addRisk(reasons, sensitiveTheology && churchCriticism, 3, "осетљива богословска тема + критика Цркве");
  score += addRisk(reasons, sensitiveTheology && clergyAccusation, 3, "осетљива богословска тема + оптужба на свештенство");
  score += addRisk(reasons, sensitiveTheology && longMessage, 1, "дугачка порука о осетљивој богословској теми");

  score += addRisk(reasons, churchCriticism, 3, "могућа критика Цркве");
  score += addRisk(reasons, clergyAccusation, 3, "могућа оптужба на свештенство/епископе");
  score += addRisk(reasons, clergyMoneyAccusation, 4, "оптужба да свештенство краде/узима новац");
  score += addRisk(reasons, sexualTopic, 3, "осетљива морална тема");
  score += addRisk(reasons, moralDangerTopic, 2, "осетљива тема греха/зависности/саблазни");
  score += addRisk(reasons, occultTopic, 3, "окултна/демонска тема");
  score += addRisk(reasons, politicalProvocation, 2, "политичка или национална провокација");
  score += addRisk(reasons, aggressiveTone, 2, "оштрији тон");
  score += addRisk(reasons, mockingTone, 2, "могуће ругање/провокација");
  score += addRisk(reasons, despairFearTone, 2, "страх/паника/очајање");
  score += addRisk(reasons, extraReviewHit, 4, "поклапање са приватном review листом");
  score += addRisk(reasons, longMessage && (aggressiveTone || mockingTone || churchCriticism || clergyAccusation || clergyMoneyAccusation), 1, "дугачак оштрији rant");
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
10. Теме као блуд, абортус, зависности, насиље, окултизам и јереси нису забрањене ако се о њима говори ради покајања, поуке или тражења помоћи. Проблем је вулгарност, ругање, хвалисање грехом, напад или саблажњиво детаљисање.

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

async function sendAdminNotice({ env, message, chatId, originalText, title, severity, reason, recommendation, risk, warningCount, moderationAction }) {
  if (!env.BOT_TOKEN || !env.ADMIN_CHAT_ID) return;

  const user = message.from?.username
    ? `@${message.from.username}`
    : `${message.from?.first_name || "Непознат"} ${message.from?.last_name || ""}`.trim();

  const riskLine = risk
    ? `<b>Локални ризик:</b> ${escapeHtml(risk.score)}\n<b>Локални разлози:</b> ${escapeHtml(risk.reasons.join(", ") || "нема")}\n`
    : "";

  const countLine = warningCount !== undefined && warningCount !== null
    ? `<b>Број опомена:</b> ${escapeHtml(warningCount)}\n`
    : "";

  const actionLine = moderationAction
    ? `<b>Акција:</b> ${escapeHtml(moderationAction)}\n`
    : "";

  const report = `⚠️ <b>${escapeHtml(title)}</b>\n\n` +
    `<b>Корисник:</b> ${escapeHtml(user)}\n` +
    `<b>User ID:</b> ${escapeHtml(message.from?.id || "?")}\n` +
    `<b>Chat ID:</b> ${escapeHtml(chatId)}\n` +
    `<b>Ниво:</b> ${escapeHtml(severity || "MEDIUM")}\n` +
    countLine + actionLine + riskLine +
    `<b>Разлог:</b> ${escapeHtml(reason || "-")}\n` +
    `<b>Предлог:</b> ${escapeHtml(recommendation || "Провери ручно.")}\n\n` +
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

function formatPublicWarning(reason, warningCount) {
  const countText = warningCount ? `\n\nОпомена: ${warningCount}/3` : "";
  return `☦️ <b>Опомена</b>\n\nПазимо на речник и тон. Без псовки, увреда, спама и саблажњивог говора.${countText}\n\n<i>Разлог: ${escapeHtml(reason)}</i>`;
}

function formatMuteWarning(reason, warningCount) {
  return `☦️ <b>Корисник је ућуткан на 10 минута</b>\n\nРазлог: ${escapeHtml(reason)}\nОпомена: ${escapeHtml(warningCount)}/5`;
}

function formatBanWarning(reason, warningCount) {
  return `☦️ <b>Корисник је уклоњен из групе</b>\n\nРазлог: ${escapeHtml(reason)}\nОпомена: ${escapeHtml(warningCount)}`;
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function getEnvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function hasSpamLink(text) {
  const hasLink = /https?:\/\/|t\.me\/|telegram\.me\/|www\.|\.com|\.net|\.org|\.ru|\.xyz|\.top|\.click|\.shop|\.site/.test(text);
  const hasInvite = /joinchat|start=|ref=|promo|airdrop|crypto|casino|bet|bonus|telegram channel|zarada|brza zarada/.test(text);
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
  "govn", "говн", "sran", "срањ", "majku ti", "мајку ти", "mamu ti", "маму ти", "mater ti", "матер ти",
  "mrs u", "мрш у", "odjebi", "одјеби", "teraj se", "терај се"
];

const HARD_INSULTS = [
  "idiot", "идиот", "debil", "дебил", "kreten", "кретен", "retard", "ретард",
  "budalo", "будало", "budala", "будала", "majmune", "мајмуне", "majmun", "мајмун",
  "glup si", "глуп си", "glupa si", "глупа си", "glupane", "глупане", "glupaco", "глупачо",
  "stoko", "стоко", "stoka", "стока", "smece", "смеће", "olos", "олош",
  "jadnice", "јадниче", "jadnico", "јаднице", "moron", "морон", "imbecil", "имбецил", "klosar", "клошар"
];

const HARD_VULGARITY = [
  "porno link", "порно линк", "onlyfans", "gole slike", "голе слике", "nudes", "nude"
];

const CLERGY_TERMS = [
  "свештеник", "svestenik", "свештеници", "svestenici", "поп", "pop", "попови", "popovi",
  "епископ", "episkop", "епископи", "episkopi", "владика", "vladika", "владике", "vladike",
  "патријарх", "patrijarh", "свештенство", "svestenstvo"
];

const MONEY_ACCUSATION_TERMS = [
  "краде", "krade", "краду", "kradu", "лопов", "lopov", "лопови", "lopovi",
  "узима паре", "uzima pare", "узимају паре", "uzimaju pare", "само паре", "samo pare",
  "новац", "novac", "бизнис", "biznis", "мафија", "mafija", "наплаћују", "naplacuju"
];

const THEOLOGY_SENSITIVE = [
  "јерес", "jeres", "јеретик", "jeretik", "јеретици", "jeretici",
  "секта", "sekta", "секташ", "sektas", "секташи", "sektasi",
  "унија", "unija", "унијат", "unijat", "filioque", "филиокве",
  "католик", "katolik", "римокатолик", "rimokatolik", "папа", "papa", "ватикан", "vatikan",
  "протестант", "protestant", "ислам", "islam", "муслиман", "musliman",
  "канон", "kanon", "догма", "dogma", "екумен", "ekumen", "екуменизам", "ekumenizam",
  "раскол", "raskol", "старокалендар", "starokalendar", "новотар", "novotar",
  "сола скриптура", "sola scriptura", "предање", "predanje", "канон писма", "kanon pisma"
];

const CHURCH_CRITICISM = [
  "црква само", "crkva samo", "црква је бизнис", "crkva je biznis", "све је то бизнис", "sve je to biznis",
  "црква узима паре", "crkva uzima pare", "само узимају паре", "samo uzimaju pare",
  "лажу народ", "lazu narod", "варају народ", "varaju narod", "манипулишу народ", "manipulisu narod",
  "црква пере мозак", "crkva pere mozak", "поповска мафија", "popovska mafija",
  "религија је бајка", "religija je bajka", "православље је мит", "pravoslavlje je mit",
  "све религије су исте", "sve religije su iste", "нема истине у цркви", "nema istine u crkvi"
];

const CLERGY_ACCUSATION = [
  "попови су", "popovi su", "свештеници су", "svestenici su", "епископи су", "episkopi su",
  "владике су", "vladike su", "свештеник је", "svestenik je", "поп је", "pop je", "владика је", "vladika je",
  "купују џипове", "kupuju dzipove", "возе џипове", "voze dzipove", "наплаћују молитве", "naplacuju molitve",
  "сви попови", "svi popovi", "сви свештеници", "svi svestenici", "све владике", "sve vladike"
];

const SEXUAL_TOPIC = [
  "блуд", "blud", "разврат", "razvrat", "порно", "porno", "порнограф", "pornograf",
  "секс", "seks", "проститу", "prostitu", "абортус", "abortus", "прељуб", "preljub",
  "похота", "pohota", "страст", "strast", "содом", "sodom"
];

const MORAL_DANGER_TOPIC = [
  "дрога", "droga", "наркотик", "narkotik", "алкохолиз", "alkoholiz", "коцка", "kocka",
  "кладионица", "kladionica", "зависност", "zavisnost", "насиље", "nasilje", "мржња", "mrznja"
];

const OCCULT_TOPIC = [
  "врач", "vrac", "враџ", "vradz", "магија", "magija", "окулт", "okult",
  "тарот", "tarot", "астролог", "astrolog", "хороскоп", "horoskop", "сатан", "satan",
  "демон", "demon", "ђаво", "djavo", "ђавол", "djavol", "ритуал", "ritual"
];

const AGGRESSIVE_TONE = [
  "срам те", "sram te", "ћути", "cuti", "зачепи", "zacepi", "немаш појма", "nemas pojma",
  "лажеш", "lazes", "лажов", "lazov", "ко си ти", "ko si ti", "мрш", "mrs",
  "не лупај", "ne lupaj", "лупаш", "lupas", "појма немаш", "pojma nemas",
  "не сери", "ne seri", "провокатор", "provokator", "трол", "trol"
];

const MOCKING_PHRASES = [
  "хаха", "haha", "lol", "лол", "lmao", "смешно", "smesno", "пресмешно", "presmesno",
  "глупост", "glupost", "бајка", "bajka", "мит", "mit", "измишљотина", "izmisljotina",
  "циркус", "cirkus", "будалаштина", "budalastina", "секташи", "sektasi",
  "затуцан", "zatucan", "средњи век", "srednji vek"
];

const BLASPHEMY_TARGETS = [
  "господ", "gospod", "исус", "isus", "христ", "hrist", "бог", "bog",
  "богородиц", "bogorodic", "пресвета", "presveta", "светитељ", "svetitelj", "свети", "sveti",
  "икон", "ikon", "литурги", "liturgi", "причешћ", "pricesc", "евхарист", "evharist",
  "крст", "krst", "јеванђељ", "jevandjelj", "свето писмо", "sveto pismo",
  "свете тајне", "svete tajne", "храм", "hram", "манастир", "manastir", "мошти", "mosti"
];

const DESPAIR_FEAR_TONE = [
  "све је пропало", "sve je propalo", "нема наде", "nema nade", "готово је", "gotovo je",
  "сви су против нас", "svi su protiv nas", "сви су издајници", "svi su izdajnici",
  "антихрист", "antihrist", "жиг звери", "zig zveri", "крај света", "kraj sveta"
];

const POLITICAL_PROVOCATION = [
  "издајници", "izdajnici", "усташ", "ustas", "четник", "cetnik", "комуњар", "komunjar",
  "наци", "naci", "фашист", "fasist", "треба их", "treba ih", "све их", "sve ih"
];
