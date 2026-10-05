import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from call_service.empty_policy import EmptyPolicy

class PolicyTests(unittest.TestCase):
    def test_initial_grace_and_empty_window(self):
        p = EmptyPolicy()
        for t in (0, 10, 110, 120, 140): self.assertFalse(p.observe(1, 0, t))
        self.assertTrue(p.observe(1, 0, 150))
    def test_last_person_leaves(self):
        p = EmptyPolicy()
        self.assertFalse(p.observe(1, 2, 0))
        self.assertFalse(p.observe(1, 0, 10))
        self.assertTrue(p.observe(1, 0, 40))
    def test_returning_person_resets_window(self):
        p = EmptyPolicy()
        for count, t in ((1,0),(0,10),(1,35),(0,40),(0,60)):
            self.assertFalse(p.observe(1,count,t))
        self.assertTrue(p.observe(1,0,70))
    def test_new_call_and_unknown_count(self):
        p = EmptyPolicy()
        p.observe(1,1,0);p.observe(1,0,10)
        self.assertFalse(p.observe(1,None,40))
        self.assertFalse(p.observe(1,0,50))
        self.assertFalse(p.observe(2,0,100))
        self.assertFalse(p.observe(2,0,200))

if __name__ == '__main__': unittest.main()
