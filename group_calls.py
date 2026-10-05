"""Run beside bot_na_maks.session: py group_calls.py (Telethon 1.x)."""
import asyncio
import os
import secrets
from getpass import getpass
from pathlib import Path

from telethon import TelegramClient, events, errors, functions, types

ACCOUNT_ID = 8630511026
GROUP_ID = -1001861714695
SESSION = Path(__file__).resolve().with_name("bot_na_maks.session")


async def main():
    if not SESSION.exists():
        raise SystemExit("Стави group_calls.py поред bot_na_maks.session.")
    api_id = int(os.environ.get("TELEGRAM_API_ID") or input("API ID: "))
    api_hash = os.environ.get("TELEGRAM_API_HASH") or getpass("API hash: ")
    client = TelegramClient(str(SESSION), api_id, api_hash, flood_sleep_threshold=0)
    await client.connect()
    try:
        if not await client.is_user_authorized():
            raise SystemExit("Сесија није пријављена. Поново покрени login.py.")
        me = await client.get_me()
        if me.bot or me.id != ACCOUNT_ID:
            raise SystemExit("Погрешан налог. Потребан је Бот На Макс.")
        # Populate the local entity cache without sending messages.
        await client.get_dialogs()
        group = await client.get_entity(GROUP_ID)
        if not isinstance(group, types.Channel) or not group.megagroup:
            raise SystemExit("Потребна је супергрупа.")
        rights = await client.get_permissions(group, me)
        if not (rights.is_creator or (rights.is_admin and getattr(group.admin_rights, "manage_call", False))):
            raise SystemExit("Дај налогу Бот На Макс admin дозволу Manage video chats.")
        lock = asyncio.Lock()

        @client.on(events.NewMessage(chats=GROUP_ID, pattern=r"(?i)^/(call|end)(?:@(ced_podestnik_bot))?\s*$"))
        async def command(event):
            sender = await event.get_sender()
            # Anonymous admins and channel senders have no verified user identity.
            if not isinstance(sender, types.User) or sender.bot:
                return
            try:
                permissions = await client.get_permissions(group, sender)
                if not (permissions.is_creator or permissions.is_admin):
                    return
                async with lock:
                    full = await client(functions.channels.GetFullChannelRequest(group))
                    active = full.full_chat.call
                    action = event.pattern_match.group(1).lower()
                    if action == "call":
                        if active:
                            await event.reply("Позив је већ активан.")
                            return
                        await client(functions.phone.CreateGroupCallRequest(
                            peer=group, random_id=secrets.randbits(31)
                        ))
                        await event.reply("✅ Групни позив је покренут.")
                    else:
                        if not active:
                            await event.reply("Нема активног позива.")
                            return
                        await client(functions.phone.DiscardGroupCallRequest(call=active))
                        await event.reply("✅ Групни позив је завршен.")
            except errors.FloodWaitError as exc:
                await event.reply(f"Telegram тражи паузу: {exc.seconds} секунди.")
            except errors.RPCError as exc:
                await event.reply(f"Позив није промењен. Telegram грешка: {type(exc).__name__}")
            except Exception as exc:
                print("Command failed:", type(exc).__name__, flush=True)

        print("Спремно: /call и /end у главној групи, само за админе.", flush=True)
        print("Остави овај терминал отворен. Ctrl+C за заустављање.", flush=True)
        await client.run_until_disconnected()
    finally:
        await client.disconnect()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print("Програм је стао:", type(exc).__name__, str(exc))
        input("Enter за затварање...")
