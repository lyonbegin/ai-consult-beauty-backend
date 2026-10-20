import logging
import os
import time

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("beauty-worker")

interval = int(os.getenv("WORKER_INTERVAL_SECONDS", "300"))

if __name__ == "__main__":
    log.info("beauty worker started; interval=%ss", interval)
    while True:
        log.info("worker heartbeat; collectors will be attached after baseline deployment")
        time.sleep(interval)
