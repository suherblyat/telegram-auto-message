export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Православни бот ради ☦️", { status: 200 });
    }

    const update = await request.json();

    if (!update.message || !update.message.text) {
      return new Response("OK", { status: 200 });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();

    let reply = "";

    if (text.startsWith("/start") || text.startsWith("/помоћ") || text.startsWith("/pomoc")) {
      reply = `☦️ Православни бот

Команде:

/правила - правила групе
/молитва - кратка молитва
/смири - порука за смиривање расправе
/извор - подсетник за изворе
/линкови - корисни православни линкови
/пост - информација о посту
/сутра - шта је сутра
/светитељ - светитељ дана

Још смо у првој верзији. Календар, пост и светитељи ће бити додати корак по корак.`;
    }

    else if (text.startsWith("/правила") || text.startsWith("/pravila")) {
      reply = `☦️ Правила групе

1. Без псовки, вређања и личних напада.
2. Критикуј аргумент, не човека.
3. За озбиљне тврдње о Цркви, историји и светитељима дај извор.
4. Без спама, провокација и непристојних слика.
5. Чувајмо мир, али не по цену истине.`;
    }

    else if (text.startsWith("/молитва") || text.startsWith("/molitva")) {
      reply = `☦️ Молитва

Господе Исусе Христе, Сине Божији, помилуј ме грешног.

Пресвета Богородице, спаси нас.`;
    }

    else if (text.startsWith("/смири") || text.startsWith("/smiri")) {
      reply = `Браћо, станимо мало.

Истина се не брани увредом. Ко хоће да настави, нека настави мирно, са доказом и без личног напада.`;
    }

    else if (text.startsWith("/извор") || text.startsWith("/izvor")) {
      reply = `☦️ Подсетник

Кад тврдимо нешто озбиљно о Цркви, светитељима, канонима или историји, дајмо извор.

Без извора лако паднемо у клевету, прелест или празну причу.`;
    }

    else if (text.startsWith("/линкови") || text.startsWith("/linkovi")) {
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

    else if (text.startsWith("/пост") || text.startsWith("/post")) {
      reply = `☦️ Пост

Ова команда је спремна, али још није повезана са календаром.

Следећи корак је да додамо податке по датумима, па ће бот говорити да ли је данас пост и који је тип поста.`;
    }

    else if (text.startsWith("/сутра") || text.startsWith("/sutra")) {
      reply = `☦️ Сутра

Ова команда је спремна, али још није повезана са календаром.

У следећој верзији ће приказивати светитеље, пост и читања за сутрашњи дан.`;
    }

    else if (text.startsWith("/светитељ") || text.startsWith("/svetitelj")) {
      reply = `☦️ Светитељ дана

Ова команда је спремна, али још није повезана са календаром.

Следеће додајемо базу светитеља по датумима.`;
    }

    if (reply) {
      await sendTelegramMessage(env.BOT_TOKEN, chatId, reply);
    }

    return new Response("OK", { status: 200 });
  }
};

async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      disable_web_page_preview: true
    })
  });
}

async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken) {
    console.log("BOT_TOKEN is missing");
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      disable_web_page_preview: true
    })
  });

  const result = await response.text();
  console.log("Telegram sendMessage response:", result);
}
