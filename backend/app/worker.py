"""Reminder worker. Run alongside the API:  python -m app.worker

Every interval it sends reminders to users whose reminder time has passed and who haven't
met today's goal. Safe to run several copies: each user is claimed atomically.
"""

import logging
import time

from .config import settings
from .db import SessionLocal, init_db, utcnow
from .push import send_expo_push
from .service import run_reminder_tick

log = logging.getLogger("bitbybit.worker")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    init_db(reset_on_change=settings.reset_db_on_schema_change)
    log.info("reminder worker started, interval=%ss", settings.worker_interval_seconds)
    while True:
        started = time.monotonic()
        try:
            with SessionLocal() as db:
                stats = run_reminder_tick(db, utcnow(), send_expo_push)
            if stats["claimed"]:
                log.info("tick: %s", stats)
        except Exception:
            log.exception("reminder tick failed")
        time.sleep(max(0.0, settings.worker_interval_seconds - (time.monotonic() - started)))


if __name__ == "__main__":
    main()
