"""Logging-only subprocess tests; never import bridge.py or service dependencies."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


MODULE_DIR = Path(__file__).resolve().parents[1]


class ErrorLoggingTests(unittest.TestCase):
    def run_probe(self, code, directory, extra_env=None):
        env = os.environ.copy()
        env["PYTHONPATH"] = str(MODULE_DIR)
        env["BRIDGE_LOG_DIR"] = str(Path(directory) / "logs")
        env.update(extra_env or {})
        return subprocess.run([sys.executable, "-c", code], cwd=directory,
                              env=env, capture_output=True, text=True)

    def test_stdout_stderr_exceptions_import_failure_and_safe_redaction(self):
        code = r'''
import asyncio, logging, threading
from bridge_logging import configure_logging, report_error, asyncio_exception_handler, log_kodi_notification
logger = configure_logging(__import__('pathlib').Path.cwd(), 'test')
print('out-fragment', end=''); print('-continued')
import sys
sys.stderr.write('err-frag'); sys.stderr.write('-continued\ntrailing-error')
try:
    raise ValueError('normal-sentinel')
except Exception as error:
    report_error(logger, 'normal-context', error)
try:
    import module_that_does_not_exist_for_logging_probe
except ImportError as error:
    report_error(logger, 'import-failure', error)
def thread_failure(): raise RuntimeError('thread-sentinel')
t = threading.Thread(target=thread_failure); t.start(); t.join()
async def exercise():
    asyncio_exception_handler(asyncio.get_running_loop(), {'message':'async-sentinel', 'exception':ValueError('async-exception-sentinel')})
asyncio.run(exercise())
logger.error('url contains https://kodi:supersecret@127.0.0.1/jsonrpc')
logger.error('url contains wss://kodi:othersecret@localhost/socket')
log_kodi_notification(logger, {'method':'Player.OnPlay', 'params':{'data':{'item':{'file':'/media/song.mp4'}, 'player':{'playerid':1}}}}, 'requested.mp4')
log_kodi_notification(logger, {'method':'Player.OnAVStart', 'params':'malformed'}, 'requested.mp4')
log_kodi_notification(logger, {'method':'Player.OnStop'}, None)
error_file = next(h for h in logging.getLogger().handlers if getattr(h, 'baseFilename', '').endswith('bridge_errors.log'))
def broken_rotation(record): raise OSError('simulated rotation failure')
error_file.emit = broken_rotation
sys.stderr.write('rotation-failure-still-alive\n')
sys.stdout.flush(); sys.stderr.flush(); logging.shutdown()
'''
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_probe(code, directory)
            self.assertEqual(result.returncode, 0, result.stderr)
            logs = Path(directory) / "logs"
            general = (logs / "bridge.log").read_text(encoding="utf-8")
            errors = (logs / "bridge_errors.log").read_text(encoding="utf-8")
            for sentinel in ("out-fragment-continued", "err-frag-continued", "trailing-error",
                             "normal-sentinel", "import-failure", "thread-sentinel",
                             "async-sentinel", "async-exception-sentinel", "cwd=", "script=",
                             "observed_file=song.mp4", "requested_song=requested.mp4",
                             "observed_file=unknown"):
                self.assertIn(sentinel, general)
            for sentinel in ("normal-sentinel", "Traceback", "thread-sentinel", "async-sentinel"):
                self.assertIn(sentinel, errors)
            self.assertNotIn("supersecret", general + errors)
            self.assertNotIn("othersecret", general + errors)
            self.assertIn("[REDACTED]", general + errors)
            self.assertIn("rotation-failure-still-alive", result.stderr)
            self.assertTrue((logs / "bridge_crash.log").exists())
            self.assertTrue((logs / "bridge_diagnostico.txt").exists())

    def test_rotation_with_small_files_and_redirected_absolute_directory(self):
        code = r'''
from pathlib import Path
from bridge_logging import configure_logging
import logging
logger = configure_logging(Path.cwd(), 'rotate')
for i in range(120):
    logger.warning('rotation-sentinel-%03d-%s', i, 'X' * 50)
logging.shutdown()
'''
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_probe(code, directory, {
                "BRIDGE_LOG_MAX_BYTES": "1024", "BRIDGE_LOG_BACKUP_COUNT": "2"})
            self.assertEqual(result.returncode, 0, result.stderr)
            logs = Path(directory) / "logs"
            error_files = list(logs.glob("bridge_errors.log*"))
            self.assertGreaterEqual(len(error_files), 2)
            self.assertLessEqual(len(error_files), 3)
            self.assertTrue(any("rotation-sentinel-119" in p.read_text(encoding="utf-8")
                                for p in error_files))

    def test_bridge_integrates_logging_before_third_party_imports_and_keeps_alias(self):
        source = (MODULE_DIR / "bridge.py").read_text(encoding="utf-8")
        self.assertLess(source.index("configure_logging("), source.index("from dotenv import load_dotenv"))
        self.assertLess(source.index("configure_logging("), source.index("import firebase_admin"))
        self.assertIn("def _asyncio_exception_handler(loop, context):", source)
        self.assertIn("asyncio_exception_handler(loop, context)", source)


if __name__ == "__main__":
    unittest.main()
