import app from "./userid-router.js";
import { icons } from "./data/icons.js";
import { calendar2026 } from "./data/calendar-all.js";

// Commands only. Ordinary messages, edits, media and moderation commands are ignored.
export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("commands-only: moderation disabled");
    let update;
    try { update = await request.clone().json(); } catch { return ok(); }
    const message = update.message;
    if (!message?.text || message.from?.is_bot) return ok();
    const match = message.text.trim().match(/^\/([^\s@]+)(?:@([^\s]+))?(?:\s+([\s\S]*))?$/u);
    if (!match) return ok();
    if (match[2] && env.BOT_USERNAME && match[2].toLowerCase() !== env.BOT_USERNAME.replace(/^@/, "").toLowerCase()) return ok();
    const command = match[1].toLowerCase();
    const args = (match[3] || "").trim();
    if (["icons", "иконе"].includes(command) && (!args || /^\d+$/.test(args))) {
      const page = Number(args) || 1;
      const pages = Math.ceil(icons.length / 30);
      if (page < 1 || page > pages) return send(message, {method:"sendMessage",text:`Страница мора бити између 1 и ${pages}.`});
      const text = `☦️ <b>Иконе, страна ${page}/${pages}</b>` + "\n\nКористи <code>/ikona назив</code> или <code>/icons део-назива</code>.\n\n" +
        icons.slice((page - 1) * 30, page * 30).map(i => `<code>${esc(i.name)}</code>`).join("\n");
      return send(message, { method: "sendMessage", text: text + (page < pages ? `\n\nСледећа страна: /icons ${page + 1}` : "") });
    }
    if (["icons", "icon", "ikona", "икона", "иконе"].includes(command)) {
      let icon;
      if (args) {
        const query = norm(args);
        icon = icons.find(i => norm(i.name) === query) || icons.find(i => norm(i.name).includes(query));
      } else {
        const key = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Belgrade",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
        const day = calendar2026[key];
        if (day?.icon) icon = {name:day.title,url:rawUrl(day.icon)};
      }
      if (!icon) return send(message, {method:"sendMessage",text:args ? "Икона није пронађена. Списак: /icons" : "Икона дана још није додата. Изабери икону: /icons"});
      return send(message, {method:"sendPhoto",photo:icon.url,caption:esc(icon.name)});
    }
    if (["citanja", "читања", "dnevnacitanja", "дневначитања", "dnevna_citanja", "дневна_читања"].includes(command)) {
      const key = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Belgrade",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      const day = calendar2026[key];
      return send(message,{method:"sendMessage",text:day ? `📖 <b>Дневна читања</b>\n\nАпостол: ${esc(day.apostle || "Још није уписано")}\nЈеванђеље: ${esc(day.gospel || "Још није уписано")}` : "Читања за данас још нису уписана."});
    }
    const allowed = new Set(["start","help","pomoc","помоћ","komande","commands","команде","ping","test","kalendar","kalnedar","calendar","календар","post","fast","пост","sutra","сутра","nedelja","nedejla","nedelaj","недеља","недејла","tropar","тропар","kondak","кондак","prolog","пролог","svpismo","свписмо","sveto_pismo","свето_писмо","chatid","четид","cid","userid","user_id","ид","корисникид","botstat","botstats","usage","стат","статистика","replydebug","debugreply","reply_debug"]);
    if (!allowed.has(command)) return ok();
    // Normalize bot suffixes and Latin help alias before forwarding.
    update.message.text = `/${command === "pomoc" ? "help" : command}${args ? " " + args : ""}`;
    return app.fetch(new Request(request.url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(update)}),env,ctx);
  }
};
function ok() { return new Response("OK"); }
function send(message, payload) {
  const body = {...payload,chat_id:message.chat.id,parse_mode:"HTML"};
  if (message.message_thread_id != null) body.message_thread_id = message.message_thread_id;
  return new Response(JSON.stringify(body),{headers:{"Content-Type":"application/json"}});
}
function esc(s) { return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function rawUrl(s) { return s.replace(/^https:\/\/github.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(?:\?raw=true)?$/, "https://raw.githubusercontent.com/$1/$2/$3/$4"); }
function norm(s) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s]+/g,"-"); }
