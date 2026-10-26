# On-demand topic summaries

Reply to the first ordinary message with `/sumiraj` or `/сумирај` (optional
`@ced_podestnik_bot` suffix). The alternate account replies with the result.
The inclusive start is the replied-to message; the exclusive end is the command
message ID. Messages arriving while inference runs are not included.

The existing Telethon client reads only this bounded range and filters the same
forum topic. It does not open a second Telegram session. The starting message
must be accessible and belong to the command's topic. Deleted or inaccessible
messages cannot be recovered. General-topic requests filter the bounded group
range; other forum topics use the topic history API.

Message text is processed in memory, in chronological 14,000-character chunks.
All chunks contribute to a hierarchical summary. There is no 500-message or
seven-day cutoff. A 15-minute execution timeout and Telegram/API failures abort
the request with an explicit error, without presenting a partial summary as
complete. Voice, image and other media content is not transcribed or analyzed;
only captions and text are available. Replies retain author and message context.

Only the two configured groups are supported. One summary job runs at a time;
each topic has a two-minute cooldown and 30 requests per Belgrade calendar day.
Quota and duplicate metadata are in memory and reset on service restart.

`SUMMARY_MODE=on_demand` disables new Worker history writes. Old archive records
from the previous implementation expire through their existing seven-day alarm.
Message text is not written to application files, databases, or logs by the new
implementation. Telegram messages and the posted result remain on Telegram;
Cloudflare Workers AI processes the supplied text.

Railway variables: TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION,
SUMMARY_ENDPOINT, SUMMARY_SIGNING_KEY (base64 raw Ed25519 private key).
Worker variable SUMMARY_BRIDGE_PUBLIC_KEY contains only the public verification
key. The endpoint verifies a signed timestamp and exact request body. Requests
expire after 90 seconds. Signing keys and Telegram sessions must never be
committed to source control.

Railway must have one replica and zero deployment overlap. The new process
waits 45 seconds before connecting to Telegram so the old container can drain;
SIGTERM disconnects the client. No healthcheck may depend on Telegram being
connected before old-container teardown. Never run a local copy with the same
session concurrently. A separate deployment requires its own Telegram login.

Validation: `npm test`; `PYTHONPATH=. python -m unittest discover -s tests -p
test_summary_range.py`. The Python suite covers 801 messages spanning more than
seven days, both range endpoints, cross-topic rejection, General topic handling,
chunk preservation, and all messages reaching inference. The Docker build runs
these tests against the installed Telethon version.
