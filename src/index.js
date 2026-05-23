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

    let reply = "";

    if (
      text.startsWith("/start") ||
      text.startsWith("/help") ||
      text.startsWith("/pomoc") ||
      text.startsWith("/помоћ")
    ) {
      reply = `☦️ Православни бот

Команде:

/pravila - правила групе
/molitva - кратка молитва
/smiri - смиривање расправе
/izvor - подсетник за изворе
/linkovi - корисни православни линкови
/post - информација о посту
/sutra - шта је сутра
/svetitelj - светитељ дана

Ћириличне команде ћемо касније средити, за сада користи латиницу ради Telegram група.`;
    }

    else if (text.startsWith("/pravila") || text.startsWith("/правила")) {
      reply = `☦️ Правила групе

1. Без псовки, вређања и личних напада.
2. Критикуј аргумент, не човека.
3. За озбиљне тврдње о Цркви, историји и светитељима дај извор.
4. Без спама, провокација и непристојних слика.
5. Чувајмо мир, али не по цену истине.`;
    }

    else if (text.startsWith("/molitva") || text.startsWith("/молитва")) {
      reply = `☦️ Молитва

Господе Исусе Христе, Сине Божији, помилуј ме грешног.

Пресвета Богородице, спаси нас.`;
    }

    else if (text.startsWith("/smiri") || text.startsWith("/смири")) {
      reply = `Браћо, станимо мало.

Истина се не брани увредом. Ко хоће да настави, нека настави мирно, са доказом и без личног напада.`;
    }

    else if (text.startsWith("/izvor") || text.startsWith("/извор")) {
      reply = `☦️ Подсетник

Кад тврдимо нешто озбиљно о Цркви, светитељима, канонима или историји, дајмо извор.

Без извора лако паднемо у клевету, прелест или празну причу.`;
    }

    else if (text.startsWith("/linkovi") || text.startsWith("/линкови")) {
      reply = `☦️ Корисни линкови

Охридски пролог:
https://www.pravoslavnikalendar.rs/prolog/

Свето Писмо:
https://www.svetopismo.info/

Светосавље:
https://svetosavlje.org/

СПЦ:
https://spc.rs/`;
    }

    else if (text.startsWith("/post") || text.startsWith("/пост")) {
      reply = `☦️ Пост

Ова команда је спремна, али још није повезана са календаром.

Следећи корак је да додамо податке по датумима.`;
    }

    else if (text.startsWith("/sutra") || text.startsWith("/сутра")) {
      reply = `☦️ Сутра

Ова команда је спремна, али још није повезана са календаром.

У следећој верзији ће приказивати светитеље, пост и читања за сутрашњи дан.`;
    }

    else if (text.startsWith("/svetitelj") || text.startsWith("/светитељ")) {
      reply = `☦️ Светитељ дана

Ова команда је спремна, али још није повезана са календаром.

Следеће додајемо базу светитеља по датумима.`;
    }

    if (!reply) {
      return new Response("OK", { status: 200 });
    }

    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: reply,
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
};
