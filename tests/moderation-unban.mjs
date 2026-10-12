import assert from "node:assert/strict";
import bot from "../src/control-ban-router.js";

const GROUP_ID = -1001861714695;
const OWNER_ID = 2073293508;
const MOD_ID = 77;
const TARGET_ID = 123456789;

const env = {
  BOT_TOKEN: "test-token",
  BOT_USERNAME: "ced_podestnik_bot",
  OWNER_USER_ID: String(OWNER_ID),
  MOD_CHAT_ID: String(GROUP_ID),
  MOD_STATE: {
    async get(key) {
      return key === `mod:${GROUP_ID}:${MOD_ID}` ? "{}" : null;
    }
  }
};

let calls = [];
let memberStatus = "kicked";
let lookupError = null;
let unbanError = null;
globalThis.fetch = async (url, init) => {
  const method = String(url).split("/").at(-1);
  const body = JSON.parse(init.body);
  calls.push({ method, body });
  let result;
  if (method === "getChatMember") {
    result = lookupError
      ? { ok: false, description: lookupError }
      : { ok: true, result: { status: memberStatus } };
  } else if (method === "unbanChatMember") {
    result = unbanError
      ? { ok: false, description: unbanError }
      : { ok: true, result: true };
  } else if (method === "sendMessage") {
    result = { ok: true, result: {} };
  } else {
    throw new Error(`Unexpected Telegram API call: ${method}`);
  }
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
};

async function run(command, actorId = MOD_ID, chatType = "supergroup", replyId = null) {
  const message = {
    text: command,
    from: { id: actorId, first_name: "Moderator" },
    chat: chatType === "private" ? { id: actorId, type: "private" } : { id: GROUP_ID, type: "supergroup" },
    message_id: 22
  };
  if (replyId) message.reply_to_message = { message_id: 10, from: { id: replyId, first_name: "Target" } };
  const result = await bot.fetch(new Request("https://bot.example/", {
    method: "POST", body: JSON.stringify({ message })
  }), env, {});
  return result.json();
}

let result = await run(`/unban ${TARGET_ID}`);
assert.match(result.text, /Бан је скинут/);
assert.deepEqual(calls.map(c => c.method), ["getChatMember", "unbanChatMember", "sendMessage"]);
assert.equal(calls[1].body.chat_id, String(GROUP_ID));
assert.equal(calls[1].body.user_id, TARGET_ID);
assert.equal(calls[1].body.only_if_banned, true);
assert.equal(calls[2].body.chat_id, OWNER_ID);

calls = [];
result = await run("/unban", MOD_ID, "supergroup", TARGET_ID);
assert.match(result.text, /Бан је скинут/);
assert.equal(calls[1].body.user_id, TARGET_ID);

calls = [];
result = await run(`/unban ${TARGET_ID}`, 999);
assert.match(result.text, /Немаш дозволу/);
assert.equal(calls.length, 0);

calls = [];
result = await run("/unban");
assert.match(result.text, /User ID/);
assert.equal(calls.length, 0);

calls = [];
memberStatus = "member";
result = await run(`/unban ${TARGET_ID}`);
assert.match(result.text, /није банован/);
assert.deepEqual(calls.map(c => c.method), ["getChatMember"]);

calls = [];
memberStatus = "kicked";
lookupError = "bad chat";
result = await run(`/unban ${TARGET_ID}`);
assert.match(result.text, /bad chat/);
assert.deepEqual(calls.map(c => c.method), ["getChatMember"]);
lookupError = null;

calls = [];
unbanError = "not enough rights";
result = await run(`/unban ${TARGET_ID}`);
assert.match(result.text, /not enough rights/);
assert.deepEqual(calls.map(c => c.method), ["getChatMember", "unbanChatMember"]);
unbanError = null;

calls = [];
result = await run(`/unban ${TARGET_ID}`, OWNER_ID, "private");
assert.match(result.text, /Бан је скинут/);
assert.equal(calls[1].body.chat_id, String(GROUP_ID));
assert.equal(calls[2].body.chat_id, OWNER_ID);

calls = [];
result = await run(`/unban ${TARGET_ID}`, MOD_ID, "private");
assert.match(result.text, /Немаш дозволу/);
assert.equal(calls.length, 0);

console.log("PASS: /unban ID/reply, owner/mod access, no-op for active users, failures, and private owner command.");
