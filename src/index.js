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

    if (isCommand(text, ["/start", "/help", "/pomoc", "/помоћ"])) {
      reply = `☦️ *Православни бот*

Команде:

*/помоћ* - приказује списак команди
*/правила* - правила групе
*/календар* - дневни црквени календар
*/пост* - да ли је данас пост и који је тип поста
*/сутра* - преглед за сутрашњи дан
*/недеља* - преглед наредних 7 дана
*/светитељ* - светитељ или празник дана
*/икона* - икона дана
*/свписмо* - дневно читање из Светог Писма
*/пролог* - Охридски пролог за данас
*/тропар* - тропар дана
*/кондак* - кондак дана
*/молитва* - кратка молитва
*/цитат* - насумичан православни цитат
*/линкови* - корисни православни линкови

Напомена: календарске команде су тренутно припремљене, а праве дневне податке додајемо у следећем кораку.`;
    }

    else if (isCommand(text, ["/pravila", "/правила"])) {
      reply = `☦️ Правила групе

1. Без псовки, вређања и личних напада.
2. Критикуј аргумент, не човека.
3. За озбиљне тврдње о Цркви, историји и светитељима дај извор.
4. Без спама, провокација и непристојних слика.
5. Чувајмо мир, али не по цену истине.`;
    }

    else if (isCommand(text, ["/kalendar", "/календар"])) {
      reply = `☦️ Календар

Ова команда је спремна, али још није повезана са дневним календаром.

Када додамо базу по датумима, овде ће бити:

Светитељ дана
Празник
Пост
Апостол
Јеванђеље
Тропар и кондак`;
    }

    else if (isCommand(text, ["/post", "/пост"])) {
      reply = `☦️ Пост

Ова команда је спремна, али још није повезана са календаром.

Када додамо податке по датумима, бот ће говорити да ли је данас пост и који је тип поста.`;
    }

    else if (isCommand(text, ["/sutra", "/сутра"])) {
      reply = `☦️ Сутра

Ова команда је спремна, али још није повезана са календаром.

У следећој верзији ће приказивати светитеље, пост и читања за сутрашњи дан.`;
    }

    else if (isCommand(text, ["/nedelja", "/недеља"])) {
      reply = `☦️ Недељни преглед

Ова команда је спремна, али још није повезана са календаром.

Када додамо базу, бот ће приказати преглед наредних 7 дана.`;
    }

    else if (isCommand(text, ["/svetitelj", "/светитељ"])) {
      reply = `☦️ Светитељ дана

Ова команда је спремна, али још није повезана са календаром.

Следеће додајемо базу светитеља по датумима.`;
    }

    else if (isCommand(text, ["/ikona", "/икона"])) {
      reply = `☦️ Икона дана

Ова команда је спремна.

Следећи корак је да додамо слике икона по датумима.`;
    }

    else if (isCommand(text, ["/svpismo", "/svpisмо", "/свписмо"])) {
      reply = `☦️ Свето Писмо

Дневна читања још нису повезана са календаром.

За сада можеш читати Свето Писмо овде:
https://www.svetopismo.info/`;
    }

    else if (isCommand(text, ["/prolog", "/пролог"])) {
      reply = `☦️ Охридски пролог

Данашњи Пролог још није повезан са ботом.

За сада можеш читати овде:
https://www.pravoslavnikalendar.rs/prolog/`;
    }

    else if (isCommand(text, ["/tropar", "/тропар"])) {
      reply = `☦️ Тропар дана

Ова команда је спремна, али још није повезана са базом тропара.`;
    }

    else if (isCommand(text, ["/kondak", "/кондак"])) {
      reply = `☦️ Кондак дана

Ова команда је спремна, али још није повезана са базом кондака.`;
    }

    else if (isCommand(text, ["/molitva", "/молитва"])) {
      reply = `☦️ Молитва

Господе Исусе Христе, Сине Божији, помилуј ме грешног.

Пресвета Богородице, спаси нас.`;
    }

    else if (isCommand(text, ["/citat", "/цитат"])) {
      const quotes = [
        "☦️ Ништа није јаче од човека који се моли.",
        "☦️ Стекни дух мира, и хиљаде око тебе ће се спасти.",
        "☦️ Без Господа ни преко прага, а са Господом и преко мора.",
        "☦️ Где има смирења, тамо има и благодати Божије.",
        "☦️ Боље је изгубити расправу него изгубити мир душе."
      ];

      reply = quotes[Math.floor(Math.random() * quotes.length)];
    }

    else if (isCommand(text, ["/linkovi", "/линкови"])) {
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

    if (!reply) {
      return new Response("OK", { status: 200 });
    }

    return new Response(
      JSON.stringify({
        method: "sendMessage",
        chat_id: chatId,
        text: reply,
        parse_mode: "Markdown",
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

function isCommand(text, commands) {
  return commands.some((command) =>
    text === command ||
    text.startsWith(command + "@") ||
    text.startsWith(command + " ")
  );
}
