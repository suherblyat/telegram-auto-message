import app from "./calendar-format-router.js";

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
    const original = message.text.trim();
    const lower = original.toLowerCase();

    if (isCmd(lower, ["/resetopomene", "/ресетопомене", "/resetwarn", "/opomene0"])) {
      return resetWarnings({ env, message, chatId, threadId, original });
    }

    if (!lower.startsWith("/") && shouldBypassOldModeration(original)) {
      return new Response("OK", { status: 200 });
    }

    return app.fetch(request, env, ctx);
  }
};

async function resetWarnings({ env, message, chatId, threadId, original }) {
  if (!senderAllowed(env, message.from?.id)) {
    return send(chatId, "⛔ Ниси на листи admin ID-јева за ову команду.", threadId);
  }

  const targetId = getTargetId(message, original);
  if (!targetId) {
    return send(chatId, "⚠️ Користи reply или User ID. Пример: <code>/resetopomene 5227965029</code>", threadId);
  }

  if (!env.MOD_STATE) return send(chatId, "⚠️ MOD_STATE KV binding није подешен.", threadId);

  await env.MOD_STATE.delete(`warn:${chatId}:${targetId}`);
  return send(chatId, `✅ Опомене су ресетоване за User ID: <code>${esc(targetId)}</code>`, threadId);
}

function senderAllowed(env, userId) {
  const allowed = String(env.ADMIN_USER_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!allowed.length) return true;
  return allowed.includes(String(userId));
}

function getTargetId(message, original) {
  if (message.reply_to_message?.from?.id) return String(message.reply_to_message.from.id);
  const args = original.replace(/^\/\S+\s*/u, "").trim();
  const m = args.match(/\d{5,}/);
  return m ? m[0] : "";
}

function shouldBypassOldModeration(value) {
  const t = latin(value);

  if (hasSeriousProfanity(t)) return false;
  if (t.includes("kurziv")) return true;

  const theological = has(t, [
    "isus", "hrist", "gospod", "bog", "sveti", "svetog", "svetome", "svetinja",
    "crkva", "manastir", "ikona", "liturgija", "pricesce", "jevandjelje", "svestenik",
    "episkop", "vladika", "patrijarh", "kanon", "sabor", "jeres", "jeretik",
    "raskol", "raskolnik", "novotar", "ziloti", "zilot", "katolik", "papa", "vatikan",
    "protestant", "islam", "dogma", "blagodat", "predanje", "post", "molitva"
  ]);

  if (!theological) return false;

  const debateOrNeutral = has(t, [
    "nije tacno", "nije istina", "ne slazem", "pogresno", "greska", "glupost",
    "objasni", "dokaz", "izvor", "citat", "pravilo", "kanon", "sabor", "verzija",
    "ime", "hebrej", "grcki", "latinski", "znacenje", "tumacenje", "pitanje",
    "mislim", "kazem", "tvrdi", "stav", "rasprava", "debata", "novotarije", "raskolnici"
  ]);

  if (debateOrNeutral) return true;

  const longTheologicalMessage = t.length > 120;
  if (longTheologicalMessage) return true;

  return false;
}

function hasSeriousProfanity(t) {
  const badRoots = ["jeb", "piz", "pick", "govn", "sran", "odjeb"];
  if (has(t, badRoots)) return true;

  const roughKRoot = /(^|\s)kur[a-z]{0,6}(\s|$)/.test(t);
  if (roughKRoot && !t.includes("kurziv")) return true;

  return false;
}

function latin(v) {
  const map = {"а":"a","б":"b","в":"v","г":"g","д":"d","ђ":"dj","е":"e","ж":"z","з":"z","и":"i","ј":"j","к":"k","л":"l","љ":"lj","м":"m","н":"n","њ":"nj","о":"o","п":"p","р":"r","с":"s","т":"t","ћ":"c","у":"u","ф":"f","х":"h","ц":"c","ч":"c","џ":"dz","ш":"s","š":"s","č":"c","ć":"c","ž":"z","đ":"dj"};
  return Array.from(String(v || "").toLowerCase()).map((c) => map[c] || c).join("").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function has(t, arr) { return arr.some((x) => t.includes(x)); }
function isCmd(t, arr) { return arr.some((c) => t === c || t.startsWith(c + " ") || t.startsWith(c + "@")); }
function send(chatId, text, threadId) {
  const payload = { method: "sendMessage", chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (threadId !== undefined && threadId !== null) payload.message_thread_id = threadId;
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}
function esc(v) { return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
