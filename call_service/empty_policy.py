class EmptyPolicy:
    """Require observed emptiness; unknown counts never authorize termination."""
    def __init__(self, grace=120, empty_timeout=30):
        self.grace = grace
        self.empty_timeout = empty_timeout
        self.call_id = None
        self.first_seen = None
        self.empty_since = None
        self.had_participants = False

    def reset(self):
        self.call_id = self.first_seen = self.empty_since = None
        self.had_participants = False

    def observe(self, call_id, count, now):
        if self.call_id != call_id:
            self.reset()
            self.call_id, self.first_seen = call_id, now
        if count is None or count < 0:
            self.empty_since = None
            return False
        if count > 0:
            self.had_participants = True
            self.empty_since = None
            return False
        if not self.had_participants and now - self.first_seen < self.grace:
            self.empty_since = None
            return False
        if self.empty_since is None:
            self.empty_since = now
        return now - self.empty_since >= self.empty_timeout
