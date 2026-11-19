from __future__ import annotations

import logging
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

from django.conf import settings

logger = logging.getLogger(__name__)


class CommandAlreadyRunningError(Exception):
    """Raised when an instance of the command is already running."""
    pass


@contextmanager
def command_lock(name: str) -> Generator[None, None, None]:
    """
    Cross-platform non-blocking file lock context manager.
    Prevents overlapping or concurrent executions of the same management command.
    Works on Windows (msvcrt) and Linux/Unix (fcntl).
    Kernel automatically releases lock if process terminates or crashes.
    """
    if settings.configured:
        base_dir = getattr(settings, "BASE_DIR", ".")
    else:
        base_dir = Path(__file__).resolve().parent.parent
    lock_dir = Path(base_dir) / "logs"
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_file_path = lock_dir / f"{name}.lock"

    # Open in read-write mode without truncating immediately
    lock_file = open(lock_file_path, "a+")
    is_locked = False

    try:
        if sys.platform == "win32":
            import msvcrt
            try:
                lock_file.seek(0)
                # Lock 1 byte at the start of the file
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
                is_locked = True
            except (OSError, PermissionError):
                raise CommandAlreadyRunningError(
                    f"Command '{name}' is already running in another process."
                )
        else:
            import fcntl
            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                is_locked = True
            except (OSError, BlockingIOError):
                raise CommandAlreadyRunningError(
                    f"Command '{name}' is already running in another process."
                )

        lock_file.seek(0)
        lock_file.truncate()
        lock_file.write(f"PID: {os.getpid()}\n")
        lock_file.flush()

        yield

    finally:
        if is_locked:
            try:
                if sys.platform == "win32":
                    import msvcrt
                    lock_file.seek(0)
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            except Exception:
                pass
        try:
            lock_file.close()
        except Exception:
            pass
