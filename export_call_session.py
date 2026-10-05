"""Run beside the local session. Paste output ONLY into server secret variables."""
from pathlib import Path
from telethon.sessions import SQLiteSession, StringSession
path = Path(__file__).resolve().with_name('bot_na_maks.session')
if not path.exists():
    raise SystemExit('Стави ову скрипту поред bot_na_maks.session.')
session = SQLiteSession(str(path))
try:
    if not session.auth_key:
        raise SystemExit('Нема сачуване пријаве.')
    print('Сачувај следећи ред као TELEGRAM_SESSION у Railway Variables:')
    print(StringSession.save(session))
    print('Не шаљи овај ред у чат и не стављај га у GitHub.')
finally:
    session.close()
