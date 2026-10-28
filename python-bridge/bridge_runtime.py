"""Small, dependency-free helpers for the Kodi bridge lifecycle."""
import errno
import os
from pathlib import Path
import threading
from threading import Lock


class ExponentialBackoff:
    """Return bounded exponential delays and reset after a successful connection."""

    def __init__(self, initial_delay=1.0, max_delay=60.0, multiplier=2.0):
        if initial_delay <= 0:
            raise ValueError("initial_delay must be greater than zero")
        if max_delay < initial_delay:
            raise ValueError("max_delay must be at least initial_delay")
        if multiplier < 1:
            raise ValueError("multiplier must be at least one")
        self.initial_delay = float(initial_delay)
        self.max_delay = float(max_delay)
        self.multiplier = float(multiplier)
        self._next_delay = self.initial_delay

    def next_delay(self):
        """Return the current delay, then advance the next delay up to the cap."""
        delay = self._next_delay
        self._next_delay = min(self.max_delay, delay * self.multiplier)
        return delay

    def reset(self):
        """Start the sequence again after a successful connection."""
        self._next_delay = self.initial_delay


class SubscriptionRegistry:
    """Own unsubscribe-capable Firestore watch handles for one bridge session.

    ``close`` is idempotent, empties the registry before invoking callbacks, and
    attempts every unsubscribe even when one callback raises. A handle registered
    after closure is immediately unsubscribed, which makes startup/teardown races
    safe. Create a fresh registry for each Kodi connection session.
    """

    def __init__(self):
        self._lock = Lock()
        self._subscriptions = []
        self._closed = False

    def add(self, subscription):
        """Track a watch handle; immediately unsubscribe if the registry is closed."""
        unsubscribe = getattr(subscription, "unsubscribe", None)
        if not callable(unsubscribe):
            raise TypeError("subscription must provide a callable unsubscribe()")
        with self._lock:
            if not self._closed:
                self._subscriptions.append(subscription)
                return subscription
        unsubscribe()
        return subscription

    def close(self):
        """Unsubscribe all tracked handles once and return any raised exceptions."""
        with self._lock:
            if self._closed:
                return []
            self._closed = True
            subscriptions, self._subscriptions = self._subscriptions, []

        errors = []
        for subscription in subscriptions:
            try:
                subscription.unsubscribe()
            except Exception as error:
                errors.append(error)
        return errors

    @property
    def closed(self):
        with self._lock:
            return self._closed

    def __len__(self):
        with self._lock:
            return len(self._subscriptions)


class InstanceLock:
    """Hold an OS-managed exclusive lock to keep one local bridge process alive.

    The lock file contains only a fixed byte required by Windows byte-range
    locking; it stores no credentials or runtime state. OS locks are released
    automatically when the process exits, so a stale file does not block startup.
    """

    _process_lock = threading.Lock()
    _held_paths = set()

    def __init__(self, path):
        self.path = Path(path).expanduser().resolve()
        self._key = os.path.normcase(str(self.path))
        self._fd = None

    def acquire(self):
        """Acquire without waiting; return False if another instance owns it."""
        if self._fd is not None:
            return True

        # flock and Windows range locks have OS-specific process semantics.
        # Also guard distinct instances/threads in this Python process.
        with self._process_lock:
            if self._key in self._held_paths:
                return False
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
            try:
                if os.name == "nt":
                    self._ensure_windows_lock_byte(fd)
                    import msvcrt
                    os.lseek(fd, 0, os.SEEK_SET)
                    try:
                        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
                    except OSError as error:
                        if error.errno in (errno.EACCES, errno.EDEADLK, errno.EAGAIN):
                            os.close(fd)
                            return False
                        raise
                else:
                    import fcntl
                    try:
                        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        os.close(fd)
                        return False
                self._held_paths.add(self._key)
                self._fd = fd
                return True
            except Exception:
                if self._fd is None:
                    try:
                        os.close(fd)
                    except OSError:
                        pass
                raise

    @staticmethod
    def _ensure_windows_lock_byte(fd):
        if os.fstat(fd).st_size == 0:
            os.lseek(fd, 0, os.SEEK_SET)
            os.write(fd, b"0")
            os.fsync(fd)

    def release(self):
        """Release the OS lock and close its file handle; safe to call repeatedly."""
        with self._process_lock:
            fd, self._fd = self._fd, None
            if fd is None:
                return
            try:
                if os.name == "nt":
                    import msvcrt
                    os.lseek(fd, 0, os.SEEK_SET)
                    msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(fd, fcntl.LOCK_UN)
            finally:
                os.close(fd)
                self._held_paths.discard(self._key)

    close = release

    def __enter__(self):
        if not self.acquire():
            raise RuntimeError(f"Another bridge instance already holds {self.path}")
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.release()
