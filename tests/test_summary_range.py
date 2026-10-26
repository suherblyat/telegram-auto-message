import asyncio
import sys
import types as module_types
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace as NS

# Pure range/aggregation tests, with no Telegram login or network.
try:
    import telethon
except ImportError:
    fake = module_types.ModuleType('telethon')
    fake.events = NS()
    fake.errors = NS(FloodWaitError=type('FloodWaitError',(Exception,),{}))
    fake.types = NS(MessageActionTopicCreate=type('MessageActionTopicCreate',(),{}))
    sys.modules['telethon'] = fake
from call_service.summarize import range_messages, pack, Summarizer, topic_id

def msg(i,topic=7,text='Тест порука'):
    class Message(NS):
        async def get_sender(self):
            return NS(first_name='Учесник',last_name='',bot=False)
    return Message(id=i, reply_to=NS(forum_topic=True,reply_to_top_id=topic,reply_to_msg_id=topic),
                   action=None,message=text,media=None,sender_id=42,date=datetime.now(timezone.utc))

class Client:
    def __init__(self,rows): self.rows=rows
    async def iter_messages(self,group,**kwargs):
        self.options=kwargs
        for row in self.rows: yield row

class RangeTest(unittest.IsolatedAsyncioTestCase):
    async def test_bounds_topics_and_start(self):
        client=Client([msg(9),msg(10),msg(11),msg(12,8),msg(13),msg(14)])
        rows=[m.id async for m in range_messages(client,NS(forum=True),msg(10),msg(14))]
        self.assertEqual(rows,[10,11,13])
        self.assertEqual(client.options['reply_to'],7)
        self.assertEqual(client.options['min_id'],10)
        self.assertIsNone(client.options['limit'])
    async def test_cross_topic_rejected(self):
        with self.assertRaises(ValueError):
            [m async for m in range_messages(Client([]),NS(forum=True),msg(10,8),msg(14))]
    async def test_more_than_500_and_7days_no_truncation(self):
        service=object.__new__(Summarizer)
        calls=[]
        async def infer(mode,text):
            calls.append((mode,text))
            return 'Белешке.'
        service.infer=infer
        start=msg(10,text='FIRST_SENTINEL')
        start.date=datetime(2020,1,1,tzinfo=timezone.utc)
        rows=[msg(i,text=f'ROW_{i} '+('реч '*80)) for i in range(11,811)]
        rows[-1].message='LAST_SENTINEL'
        result=await service.summarize(Client(rows),NS(forum=True),start,msg(900))
        source='\n'.join(t for mode,t in calls if mode=='chunk')
        self.assertIn('FIRST_SENTINEL',source)
        self.assertIn('LAST_SENTINEL',source)
        self.assertIn('801 порука',result)
        for i in range(11,810): self.assertIn(f'ROW_{i} ',source)
        self.assertTrue(all(len(t)<=14000 for _,t in calls))
    def test_general_and_nonforum(self):
        m=msg(1);m.reply_to=None
        self.assertEqual(topic_id(m,True),1)
        self.assertEqual(topic_id(m,False),0)
    def test_oversized_text_preserved(self):
        text='a'*40000
        self.assertEqual(''.join(pack([text])),text)

if __name__=='__main__': unittest.main()
