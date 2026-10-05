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
from call_service.empty_policy import EmptyPolicy

ACCOUNT_ID = 8630511026
GROUP_ID = -1001861714695
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
    watcher = None
    try:
        if not await client.is_user_authorized():
            raise SystemExit('Сесија није пријављена.')
        me = await client.get_me()
        if me.bot or me.id != ACCOUNT_ID:
            raise SystemExit('Погрешан налог: потребан је Бот На Макс.')
        await client.get_dialogs()
        group = await client.get_entity(GROUP_ID)
        if not isinstance(group, types.Channel) or not group.megagroup:
            raise SystemExit('Потребна је супергрупа.')
        own = await client.get_permissions(group, me)
        if not (own.is_creator or (own.is_admin and getattr(group.admin_rights, 'manage_call', False))):
            raise SystemExit('Налогу је потребна дозвола Manage video chats.')
        lock = asyncio.Lock()
        policy = EmptyPolicy()

        async def active_call():
            full = await client(functions.channels.GetFullChannelRequest(group))
            return full.full_chat.call

        async def call_info(call):
            result = await client(functions.phone.GetGroupCallRequest(call=call, limit=1))
            return result.call

        @client.on(events.NewMessage(chats=GROUP_ID, pattern=r'(?i)^/call(?:@ced_podestnik_bot)?\s*$'))
        async def command(event):
            sender = await event.get_sender()
            if not isinstance(sender, types.User) or sender.bot:
                return
            try:
                rights = await client.get_permissions(group, sender)
                if not (rights.is_creator or rights.is_admin):
                    return
                async with lock:
                    if await active_call():
                        await event.reply('Позив је већ активан.')
                        return
                    await client(functions.phone.CreateGroupCallRequest(peer=group, random_id=secrets.randbits(31)))
                    policy.reset()
                    await event.reply('✅ Позив је покренут. Аутоматски се гаси када остане празан.')
            except errors.RPCError as exc:
                await event.reply('Telegram грешка: ' + type(exc).__name__)
            except Exception as exc:
                LOG.warning('Command failed: %s', type(exc).__name__)

        async def monitor():
            while True:
                delay = 10
                try:
                    async with lock:
                        active = await active_call()
                        if not active:
                            policy.reset()
                        else:
                            info = await call_info(active)
                            # Never terminate scheduled calls or rely on partial participant pages.
                            if isinstance(info, types.GroupCallDiscarded) or getattr(info, 'schedule_date', None):
                                policy.reset()
                            elif policy.observe(active.id, getattr(info, 'participants_count', None), time.monotonic()):
                                current = await active_call()
                                if current and current.id == active.id:
                                    latest = await call_info(current)
                                    if getattr(latest, 'participants_count', None) == 0 and not getattr(latest, 'schedule_date', None):
                                        await client(functions.phone.DiscardGroupCallRequest(call=current))
                                        LOG.info('Empty call ended automatically')
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

        watcher = asyncio.create_task(monitor())
        LOG.info('Ready: /call only; automatic empty-call shutdown; no media connection')
        await client.run_until_disconnected()
    finally:
        if watcher:
            watcher.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await watcher
        await client.disconnect()

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
