"""On-demand range summaries. Message content is held in memory only."""
import asyncio
import base64
import json
import logging
import os
import re
import time
from collections import OrderedDict
from datetime import datetime
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from telethon import events, errors, types

LOG = logging.getLogger(__name__)
PATTERN = r'(?i)^/(?:sumiraj|сумирај|summarize)(?:@ced_podestnik_bot)?(?:\s.*)?$'
HELP = 'Одговори на почетну поруку са /sumiraj или /сумирај. Читам од те поруке до команде, само у истој теми. Поруке не архивирам.'
CHUNK_SIZE = 14000

def topic_id(message, forum):
    if not forum:
        return 0
    if isinstance(getattr(message, 'action', None), types.MessageActionTopicCreate):
        return message.id
    header = getattr(message, 'reply_to', None)
    if header and getattr(header, 'forum_topic', False):
        return header.reply_to_top_id or header.reply_to_msg_id or 1
    return 1  # General topic

def pack(parts, maximum=CHUNK_SIZE):
    """Preserve every character, including individually oversized messages."""
    current = ''
    for part in parts:
        for offset in range(0, len(part), maximum):
            piece = part[offset:offset+maximum]
            if current and len(current) + len(piece) + 1 > maximum:
                yield current
                current = ''
            current += ('\n' if current else '') + piece
    if current:
        yield current

async def range_messages(client, group, start, command):
    forum = bool(getattr(group, 'forum', False))
    topic = topic_id(command, forum)
    if topic_id(start, forum) != topic or start.id >= command.id:
        raise ValueError('Почетна порука мора бити ранија порука у истој теми.')
    yield start
    # Only request the selected ID range. Topic-specific history for forum topics;
    # General uses the bounded group range with an explicit topic filter.
    options = dict(limit=None, min_id=start.id, max_id=command.id, reverse=True, wait_time=1)
    if forum and topic != 1:
        options['reply_to'] = topic
    async for message in client.iter_messages(group, **options):
        if start.id < message.id < command.id and topic_id(message, forum) == topic:
            yield message

class Summarizer:
    def __init__(self):
        self.key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(os.environ['SUMMARY_SIGNING_KEY']))
        self.url = os.environ['SUMMARY_ENDPOINT']
        if not self.url.startswith('https://'):
            raise ValueError('HTTPS required')
        self.busy = False
        self.quotas = {}
        self.seen = set()

    def infer_sync(self, mode, text):
        body = json.dumps(dict(mode=mode, text=text), ensure_ascii=False).encode()
        stamp = str(int(time.time()))
        signature = base64.b64encode(self.key.sign(stamp.encode()+b'\n'+body)).decode()
        req = Request(self.url, data=body, headers={'Content-Type':'application/json',
                      'X-Summary-Time':stamp, 'X-Summary-Signature':signature})
        with urlopen(req, timeout=100) as response:
            result = json.load(response)
        return result['text']

    async def infer(self, mode, text):
        return await asyncio.to_thread(self.infer_sync, mode, text)

    async def summarize(self, client, group, start, command):
        notes, pending = [], []
        chars = count = media_count = 0
        has_text = False
        first_date = last_date = None
        recent = OrderedDict()
        async for message in range_messages(client, group, start, command):
            if getattr(message, 'action', None):
                continue
            text = message.message or ''
            # Include every ordinary message; omit bot command invocations.
            if text.startswith('/'):
                continue
            sender = await message.get_sender()
            name = ' '.join(filter(None, [getattr(sender,'first_name',None), getattr(sender,'last_name',None)]))
            name = name or getattr(sender, 'title', None) or str(message.sender_id or 'Учесник')
            kind = next((k for k in ['voice','video_note','video','audio','photo','sticker','document'] if getattr(message,k,None)), None)
            header = message.reply_to
            reply_id = getattr(header, 'reply_to_msg_id', None)
            record = dict(id=message.id, name=name, speakerId=str(message.sender_id), text=text, media=kind,
                          replyTo=recent.get(reply_id) or ({'id':reply_id} if reply_id else None))
            # Reply quotations are context, never attributed to this speaker.
            recent[message.id] = dict(id=message.id, name=name, text=text[:800], shortened=len(text)>800)
            if len(recent)>1000:
                recent.popitem(last=False)
            count += 1
            media_count += bool(kind)
            has_text = has_text or bool(text.strip())
            first_date = first_date or message.date
            last_date = message.date
            encoded = json.dumps(record, ensure_ascii=False)
            for piece in pack([encoded]):
                if pending and chars+len(piece)+1>CHUNK_SIZE:
                    notes.append(await self.infer('chunk', '\n'.join(pending)))
                    pending, chars = [], 0
                pending.append(piece)
                chars += len(piece)+1
        if not count or not has_text:
            return 'У изабраном распону нема текстуалног садржаја за сажимање. Гласовне поруке и слике нису анализиране.'
        if not notes:
            summary = await self.infer('final', '\n'.join(pending))
        else:
            if pending:
                notes.append(await self.infer('chunk', '\n'.join(pending)))
            while len('\n'.join(notes))>CHUNK_SIZE:
                batches = list(pack(notes))
                notes = [await self.infer('merge', batch) for batch in batches]
            summary = await self.infer('final', '\n'.join(notes))
        zone = ZoneInfo('Europe/Belgrade')
        date = lambda value: value.astimezone(zone).strftime('%d.%m. %H:%M')
        coverage = f'Обухват: {count} порука, {date(first_date)}–{date(last_date)} (Београд). Од изабране поруке до /sumiraj, само ова тема. Доступне поруке су прочитане на захтев, без архивирања.'
        if media_count:
            coverage += f' Медијских порука: {media_count}; њихов садржај није анализиран, само пратећи текст.'
        return '📝 Сажетак разговора\n\n'+summary+'\n\n'+coverage

    async def handle(self, event, client, groups):
        if event.out or event.chat_id not in groups:
            return
        sender = await event.get_sender()
        if getattr(sender, 'bot', False):
            return
        command = event.message
        group = groups[event.chat_id]
        topic = topic_id(command, bool(group.forum))
        request = (event.chat_id, command.id)
        if request in self.seen:
            return
        # Do not replay queued commands after restarts.
        if time.time()-command.date.timestamp()>120:
            return
        start = await event.get_reply_message()
        args = re.sub(r'^/\S+', '', event.raw_text).strip().lower()
        if not start or (getattr(start,'action',None) and isinstance(start.action, types.MessageActionTopicCreate)) or args not in ('','odovde','одовде','odavde','одавде'):
            await event.reply(HELP, parse_mode=None)
            return
        if topic_id(start, bool(group.forum)) != topic:
            await event.reply('Почетна порука мора бити у истој теми.', parse_mode=None)
            return
        key = (event.chat_id, topic)
        today = datetime.now(ZoneInfo('Europe/Belgrade')).date()
        day, count, last = self.quotas.get(key, (today,0,0))
        if day != today:
            count = 0
        if self.busy or time.monotonic()-last<120 or count>=30:
            await event.reply('Сажимање је заузето или је достигнут лимит. Размак је два минута, највише 30 захтева дневно по теми.', parse_mode=None)
            return
        self.busy = True
        self.seen.add(request)
        self.quotas[key] = (today,count+1,time.monotonic())
        if len(self.seen)>2000:
            self.seen = {request}
        progress = None
        try:
            progress = await event.reply('Читам изабрани распон у овој теми. Дужи разговор обрађујем у деловима…', parse_mode=None)
            result = await asyncio.wait_for(self.summarize(client,group,start,command),900)
            # Telegram's UTF-16 limit: split conservatively and never discard output.
            parts = list(pack([result], maximum=1900))
            await progress.edit(parts[0], parse_mode=None)
            for part in parts[1:]:
                await event.reply(part, parse_mode=None)
            LOG.info('Summary completed: chat=%s topic=%s from=%s before=%s',event.chat_id,topic,start.id,command.id)
        except Exception as exc:
            LOG.warning('Summary failed: %s',type(exc).__name__)
            if isinstance(exc, errors.FloodWaitError):
                error = f'Telegram тражи паузу од {exc.seconds} секунди. Сажетак није завршен; покушај након паузе.'
            elif isinstance(exc, ValueError):
                error = str(exc)
            else:
                error = 'Нисам успео да обрадим цео распон. Непотпун сажетак није послат. Покушај поново или изабери краћи распон.'
            if progress:
                await progress.edit(error,parse_mode=None)
        finally:
            self.busy = False

def install_summary(client, groups):
    if not os.environ.get('SUMMARY_SIGNING_KEY') or not os.environ.get('SUMMARY_ENDPOINT'):
        LOG.warning('On-demand summary not configured')
        return
    service = Summarizer()
    @client.on(events.NewMessage(chats=list(groups), pattern=PATTERN))
    async def command(event):
        await service.handle(event,client,groups)
    LOG.info('On-demand summary handler installed; no message archive')
