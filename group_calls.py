"""Always-on group calls. Server credentials are environment variables."""
import asyncio
import contextlib
import logging
import os
import secrets
import time
from getpass import getpass
from pathlib import Path

from telethon import TelegramClient, events, errors, functions, types
from telethon.sessions import StringSession
from pytgcalls import PyTgCalls
from pytgcalls.types import GroupCallConfig
from pytgcalls.exceptions import NotInCallError, NoActiveGroupCall
from call_service.empty_policy import EmptyPolicy

ACCOUNT_ID = 8630511026
GROUP_REFS = (-1001861714695, "@resursiced")
LOG = logging.getLogger('group_calls')

async def main():
    server_session = os.environ.get('TELEGRAM_SESSION', '').strip()
    api_id = int(os.environ.get('TELEGRAM_API_ID') or input('API ID: '))
    api_hash = os.environ.get('TELEGRAM_API_HASH') or getpass('API hash: ')
    if server_session:
        session = StringSession(server_session)
    else:
        path = Path(__file__).resolve().with_name('bot_na_maks.session')
        if not path.exists():
            raise SystemExit('Недостаје TELEGRAM_SESSION или bot_na_maks.session.')
        session = str(path)
    client = TelegramClient(session, api_id, api_hash, flood_sleep_threshold=0)
    await client.connect()
    watchers = []
    holders = {}
    calls = None
    try:
        if not await client.is_user_authorized():
            raise SystemExit('Сесија није пријављена.')
        me = await client.get_me()
        if me.bot or me.id != ACCOUNT_ID:
            raise SystemExit('Погрешан налог: потребан је Бот На Макс.')
        await client.get_dialogs()
        groups = {}
        locks = {}
        policies = {}
        for ref in GROUP_REFS:
            group = await client.get_entity(ref)
            if not isinstance(group, types.Channel) or not group.megagroup:
                raise SystemExit(f'Потребна је супергрупа: {ref}')
            own = await client.get_permissions(group, me)
            if not (own.is_creator or (own.is_admin and getattr(group.admin_rights, 'manage_call', False))):
                raise SystemExit(f'Налогу је потребна дозвола Manage video chats: {ref}')
            chat_id = -1000000000000 - group.id
            groups[chat_id] = group
            locks[chat_id] = asyncio.Lock()
            policies[chat_id] = EmptyPolicy()
            LOG.info('Group ready: %s (%s)', ref, chat_id)

        calls = PyTgCalls(client)
        await calls.start()

        async def active_call(group):
            full = await client(functions.channels.GetFullChannelRequest(group))
            return full.full_chat.call

        async def call_info(call):
            result = await client(functions.phone.GetGroupCallRequest(call=call, limit=1))
            return result.call

        async def hold_call(chat_id, call):
            # No stream means no microphone, camera, speaker or recording source.
            await asyncio.wait_for(calls.play(chat_id, None,
                GroupCallConfig(join_as=await client.get_input_entity(me), auto_start=False)), 45)
            holders[chat_id] = (call.id, time.monotonic() + 600)
            await calls.mute(chat_id)
            LOG.info('Silent holder joined: group=%s call=%s', chat_id, call.id)

        async def release_holder(chat_id):
            try:
                await calls.leave_call(chat_id, close=False)
            except (NotInCallError, NoActiveGroupCall):
                pass
            holders.pop(chat_id, None)
            LOG.info('Silent holder left: group=%s', chat_id)

        @client.on(events.NewMessage(chats=list(groups), pattern=r'(?i)^/call(?:@ced_podestnik_bot)?\s*$'))
        async def command(event):
            group = groups[event.chat_id]
            lock = locks[event.chat_id]
            policy = policies[event.chat_id]
            try:
                sender = await event.get_sender()
                # Telegram represents anonymous admins as the group itself.
                anonymous_admin = (isinstance(sender, types.Channel)
                                   and sender.id == group.id
                                   and isinstance(event.message.from_id, types.PeerChannel)
                                   and event.message.from_id.channel_id == group.id)
                if not anonymous_admin:
                    if not isinstance(sender, types.User) or sender.bot:
                        LOG.info('Command ignored: unsupported sender in %s', event.chat_id)
                        return
                    rights = await client.get_permissions(group, sender)
                    if not (rights.is_creator or rights.is_admin):
                        LOG.info('Command ignored: non-admin in %s', event.chat_id)
                        return
                LOG.info('Call command accepted in %s; anonymous=%s; topic=%s',
                         event.chat_id, anonymous_admin,
                         getattr(event.message.reply_to, 'reply_to_top_id', None))
                async with lock:
                    existing = await active_call(group)
                    if existing:
                        info = await call_info(existing)
                        if not isinstance(info, types.GroupCallDiscarded):
                            if getattr(info, 'schedule_date', None):
                                await client(functions.phone.StartScheduledGroupCallRequest(call=existing))
                                policy.reset()
                                await hold_call(event.chat_id, existing)
                                await event.reply('✅ Заказани позив је сада покренут за целу ову групу.')
                            else:
                                count = getattr(info, 'participants_count', 0)
                                if count == 0 and event.chat_id not in holders:
                                    await hold_call(event.chat_id, existing)
                                    await event.reply('✅ Ушао сам у празан позив. Чекам без звука до 10 минута и излазим када неко уђе.')
                                else:
                                    await event.reply(f'Позив постоји у овој групи. Учесника: {count}. Отвори профил групе и изабери придруживање видео-чату.')
                            LOG.info('Existing call in %s: id=%s participants=%s scheduled=%s',
                                     event.chat_id, existing.id,
                                     getattr(info, 'participants_count', None),
                                     getattr(info, 'schedule_date', None))
                            return
                    await client(functions.phone.CreateGroupCallRequest(peer=group, random_id=secrets.randbits(31)))
                    policy.reset()
                    created = await active_call(group)
                    if created:
                        await hold_call(event.chat_id, created)
                    await event.reply('✅ Позив је покренут. Чекам без звука до 10 минута и излазим када неко уђе.')
            except errors.RPCError as exc:
                await event.reply('Telegram грешка: ' + type(exc).__name__)
            except Exception as exc:
                LOG.warning('Command failed: %s', type(exc).__name__)
                await event.reply('Позив је затражен, али повезивање није потврђено: ' + type(exc).__name__)

        async def monitor(group, lock, policy):
            chat_id = -1000000000000 - group.id
            while True:
                delay = 5
                try:
                    async with lock:
                        active = await active_call(group)
                        if not active:
                            if chat_id in holders:
                                await release_holder(chat_id)
                            policy.reset()
                        else:
                            info = await call_info(active)
                            holder = holders.get(chat_id)
                            if holder:
                                count = getattr(info, 'participants_count', None)
                                if holder[0] != active.id or isinstance(info, types.GroupCallDiscarded):
                                    await release_holder(chat_id)
                                    policy.reset()
                                elif (count is not None and count > 1) or time.monotonic() >= holder[1]:
                                    await release_holder(chat_id)
                                    # Holder presence must not count as a real participant.
                                    policy.reset()
                                    policy.call_id = active.id
                                    policy.first_seen = time.monotonic()
                                    policy.had_participants = True
                                    info = await call_info(active)
                                else:
                                    await asyncio.sleep(delay)
                                    continue
                            # Never terminate scheduled calls or rely on partial participant pages.
                            if isinstance(info, types.GroupCallDiscarded) or getattr(info, 'schedule_date', None):
                                policy.reset()
                            elif policy.observe(active.id, getattr(info, 'participants_count', None), time.monotonic()):
                                current = await active_call(group)
                                if current and current.id == active.id:
                                    latest = await call_info(current)
                                    if getattr(latest, 'participants_count', None) == 0 and not getattr(latest, 'schedule_date', None):
                                        await client(functions.phone.DiscardGroupCallRequest(call=current))
                                        LOG.info('Empty call ended automatically: %s', group.id)
                                        policy.reset()
                                    else:
                                        policy.observe(active.id, getattr(latest, 'participants_count', None), time.monotonic())
                                else:
                                    policy.reset()
                except errors.FloodWaitError as exc:
                    policy.empty_since = None
                    delay = max(10, exc.seconds + 1)
                except Exception as exc:
                    # A failed observation must not count toward confirmed empty time.
                    policy.empty_since = None
                    LOG.warning('Call check failed: %s', type(exc).__name__)
                await asyncio.sleep(delay)

        watchers = [asyncio.create_task(monitor(group, locks[chat_id], policies[chat_id]))
                    for chat_id, group in groups.items()]
        LOG.info('Ready: /call only; silent holder up to 600s; automatic empty-call shutdown')
        await client.run_until_disconnected()
    finally:
        for watcher in watchers:
            watcher.cancel()
        for watcher in watchers:
            with contextlib.suppress(asyncio.CancelledError):
                await watcher
        if calls:
            for chat_id in list(holders):
                with contextlib.suppress(Exception):
                    await calls.leave_call(chat_id, close=False)
        await client.disconnect()

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
