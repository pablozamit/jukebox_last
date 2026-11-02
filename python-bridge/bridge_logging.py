"""Small, dependency-free logging setup for the jukebox bridge."""
from __future__ import annotations

import faulthandler
import logging
import os
import re
import sys
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path


class _TeeLogStream:
    """Keep the console stream intact while logging complete printed lines."""
    def __init__(self, original, logger, level):
        self._original, self._logger, self._level = original, logger, level
        self._pending = ""
        self._lock = threading.RLock()
        self._local = threading.local()

    def write(self, text):
        if not isinstance(text, str):
            text = str(text)
        with self._lock:
            self._original.write(text)
            if getattr(self._local, "logging", False):
                return len(text)
            self._pending += text
            while "\n" in self._pending:
                line, self._pending = self._pending.split("\n", 1)
                if line.strip():
                    self._log(line.rstrip("\r"))
        return len(text)

    def flush(self):
        with self._lock:
            self._original.flush()
            if self._pending.strip():
                self._log(self._pending.rstrip("\r"))
            self._pending = ""

    def _log(self, line):
        self._local.logging = True
        try:
            try:
                self._logger.log(self._level, "%s", line, extra={"_from_print_tee": True})
            except Exception:
                # The original stream already received the text; logging failure
                # must not recursively route its own diagnostic back here.
                pass
        finally:
            self._local.logging = False

    def close(self):
        self.flush()

    def isatty(self):
        return self._original.isatty()

    def fileno(self):
        return self._original.fileno()

    @property
    def encoding(self):
        return getattr(self._original, "encoding", "utf-8")


class _RedactingFormatter(logging.Formatter):
    _credential_url = re.compile(r"(?i)\b((?:https?|wss?)://)[^/@\s:]+:[^/@\s]+@")

    def format(self, record):
        rendered = super().format(record)
        return self._credential_url.sub(r"\1[REDACTED]@", rendered)


def configure_logging(base_dir, version):
    """Configure durable logs before importing bridge dependencies.

    BRIDGE_LOG_DIR may redirect logs; the default is beside bridge.py.
    BRIDGE_LOG_MAX_BYTES and BRIDGE_LOG_BACKUP_COUNT allow bounded test sizing.
    """
    base_dir = Path(base_dir).expanduser().resolve()
    log_dir = Path(os.environ.get("BRIDGE_LOG_DIR", str(base_dir))).expanduser().resolve()
    log_dir.mkdir(parents=True, exist_ok=True)
    max_bytes = max(1024, int(os.environ.get("BRIDGE_LOG_MAX_BYTES", "2000000")))
    backups = max(1, int(os.environ.get("BRIDGE_LOG_BACKUP_COUNT", "5")))
    root = logging.getLogger()
    for handler in root.handlers[:]:
        root.removeHandler(handler)
        try:
            handler.close()
        except Exception:
            pass
    root.setLevel(logging.INFO)
    formatter = _RedactingFormatter(
        "%(asctime)sZ [%(levelname)s] [pid=%(process)d] [v%(bridge_version)s] [%(threadName)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    formatter.converter = time.gmtime
    defaults = {"bridge_version": str(version)}
    general = RotatingFileHandler(log_dir / "bridge.log", maxBytes=max_bytes,
                                  backupCount=backups, encoding="utf-8")
    general.setLevel(logging.INFO)
    general.setFormatter(formatter)
    general.addFilter(_VersionFilter(defaults))
    errors = RotatingFileHandler(log_dir / "bridge_errors.log", maxBytes=max_bytes,
                                 backupCount=backups, encoding="utf-8")
    errors.setLevel(logging.WARNING)
    errors.setFormatter(formatter)
    errors.addFilter(_VersionFilter(defaults))
    root.addHandler(general)
    root.addHandler(errors)
    original_stdout, original_stderr = sys.stdout, sys.stderr
    console_out = logging.StreamHandler(original_stdout)
    console_out.setLevel(logging.INFO)
    console_out.addFilter(_ConsoleLevelFilter(logging.WARNING, below=True))
    console_out.addFilter(_NotTeeFilter())
    console_out.addFilter(_VersionFilter(defaults))
    console_out.setFormatter(formatter)
    console_err = logging.StreamHandler(original_stderr)
    console_err.setLevel(logging.WARNING)
    console_err.addFilter(_NotTeeFilter())
    console_err.addFilter(_VersionFilter(defaults))
    console_err.setFormatter(formatter)
    root.addHandler(console_out)
    root.addHandler(console_err)
    logger = logging.getLogger("jukebox-bridge")
    # Avoid duplicate lines when logger is also observed by embedding apps.
    logger.propagate = True
    sys.stdout = _TeeLogStream(original_stdout, logger, logging.INFO)
    sys.stderr = _TeeLogStream(original_stderr, logger, logging.WARNING)
    sys.excepthook = _sys_excepthook
    threading.excepthook = _thread_excepthook
    fault_path = log_dir / "bridge_crash.log"
    fault_file = open(fault_path, "a", encoding="utf-8")
    logger._bridge_fault_file = fault_file
    try:
        faulthandler.enable(file=fault_file)
    except Exception:
        fault_file.close()
    logger.info("Bridge startup: log_dir=%s script=%s cwd=%s pid=%s version=%s",
                log_dir, base_dir / "bridge.py", Path.cwd(), os.getpid(), version)
    _start_diagnostic_snapshots(logger, log_dir, version)
    return logger


def _start_diagnostic_snapshots(logger, log_dir, version):
    """Refresh a closed diagnostic text file for external folder sync tools."""
    try:
        from bridge_diagnostics import write_snapshot

        def refresh():
            try:
                write_snapshot(log_dir, version, pid=os.getpid())
            except Exception as error:
                logger.warning("Could not refresh closed diagnostic snapshot: %s", error)

        refresh()

        def worker():
            refresh_event = threading.Event()
            while not refresh_event.wait(60):
                refresh()

        thread = threading.Thread(target=worker, name="bridge-diagnostic-snapshot", daemon=True)
        thread.start()
        logger._bridge_diagnostic_thread = thread
    except Exception as error:
        logger.warning("Diagnostic snapshot support unavailable: %s", error)


class _VersionFilter(logging.Filter):
    def __init__(self, defaults):
        super().__init__()
        self._version = defaults["bridge_version"]

    def filter(self, record):
        if not hasattr(record, "bridge_version"):
            record.bridge_version = self._version
        return True


class _NotTeeFilter(logging.Filter):
    def filter(self, record):
        return not getattr(record, "_from_print_tee", False)


class _ConsoleLevelFilter(logging.Filter):
    def __init__(self, threshold, below=False):
        super().__init__()
        self.threshold, self.below = threshold, below

    def filter(self, record):
        return record.levelno < self.threshold if self.below else record.levelno >= self.threshold


def report_error(logger, context, error):
    """Log the supplied exception and its own traceback, even outside except."""
    tb = error.__traceback__ if isinstance(error, BaseException) else None
    if isinstance(error, BaseException):
        logger.error("%s: %s", context, error,
                     exc_info=(type(error), error, tb) if tb else None)
    else:
        logger.error("%s: %s", context, error)


def _sys_excepthook(exc_type, exc, tb):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc, tb)
        return
    logging.getLogger("jukebox-bridge").critical(
        "Uncaught exception; bridge may have stopped", exc_info=(exc_type, exc, tb))


def _thread_excepthook(args):
    logging.getLogger("jukebox-bridge").error(
        "Uncaught exception in thread %s", getattr(args.thread, "name", "?"),
        exc_info=(args.exc_type, args.exc_value, args.exc_traceback))


def asyncio_exception_handler(loop, context):
    exc = context.get("exception")
    logging.getLogger("jukebox-bridge").error(
        "Asyncio error: %s", context.get("message", ""),
        exc_info=(type(exc), exc, exc.__traceback__) if exc else None)


def log_kodi_notification(logger, data, requested_song=None):
    """Log a small allowlisted summary of playback-related Kodi notifications."""
    try:
        if not isinstance(data, dict):
            return
        method = data.get("method")
        if method not in ("Player.OnPlay", "Player.OnAVStart", "Player.OnAVStarted", "Player.OnStop"):
            return
        params = data.get("params")
        params = params if isinstance(params, dict) else {}
        event_data = params.get("data")
        event_data = event_data if isinstance(event_data, dict) else {}
        item = event_data.get("item")
        item = item if isinstance(item, dict) else {}
        file_path = item.get("file")
        observed_file = os.path.basename(file_path) if isinstance(file_path, str) else "unknown"
        player = event_data.get("player")
        player = player if isinstance(player, dict) else {}
        player_id = player.get("playerid")
        if not isinstance(player_id, (int, str)):
            player_id = "unknown"
        if not isinstance(requested_song, str):
            requested_song = "unknown"
        logger.info("Kodi notification: method=%s observed_file=%s player_id=%s requested_song=%s",
                    method, observed_file, player_id, requested_song)
    except Exception:
        # Diagnostic logging must never change how notifications are handled.
        return

