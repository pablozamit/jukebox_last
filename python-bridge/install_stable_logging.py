"""Apply logging-only instrumentation to the verified stable 2.3.0 bridge.

Never starts the bridge, contacts a service, or changes playback/queue logic.
"""
import argparse
import ast
import copy
import hashlib
from pathlib import Path
import tempfile
import os
from datetime import datetime, timezone


STABLE_SHA256 = "2554161641bb3cf6800fa2731d71df3b0f715b6efa4b0521d6691c8ecf86882b"
PATCH_VERSION = "2.3.0+logs.1"


def _once(source, before, after):
    if source.count(before) != 1:
        raise ValueError(f"Unexpected stable source: marker count for {before[:70]!r}")
    return source.replace(before, after, 1)


class _WithoutLogging(ast.NodeTransformer):
    def visit_Expr(self, node):
        value = node.value
        if isinstance(value, ast.Call):
            if isinstance(value.func, ast.Attribute) and isinstance(value.func.value, ast.Name):
                if value.func.value.id == "logger":
                    return None
            if isinstance(value.func, ast.Name) and value.func.id == "log_kodi_notification":
                return None
        return self.generic_visit(node)


def verify_business_functions_unchanged(before, after):
    excluded = {"report_error", "_sys_excepthook", "_thread_excepthook", "_asyncio_exception_handler"}
    def functions(source):
        return {
            node.name: ast.dump(_WithoutLogging().visit(copy.deepcopy(node)), include_attributes=False)
            for node in ast.parse(source).body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name not in excluded
        }
    if functions(before) != functions(after):
        raise ValueError("Playback/business function changed; refusing logging patch")


def patched_source(original):
    if hashlib.sha256(original).hexdigest() != STABLE_SHA256:
        raise ValueError("Target is not the verified stable 2.3.0; no files changed")
    before = original.decode("utf-8").replace("\r\n", "\n")
    after = _once(before, 'BRIDGE_VERSION = "2.3.0"\n', "")
    after = _once(after, "from dotenv import load_dotenv\n", f'''BRIDGE_VERSION = "{PATCH_VERSION}"
from bridge_logging import configure_logging, report_error as _report_error, asyncio_exception_handler, log_kodi_notification
logger = configure_logging(Path(__file__).resolve().parent, BRIDGE_VERSION)

from dotenv import load_dotenv
''')
    start = after.index('logger = logging.getLogger("jukebox-bridge")')
    end = after.index("def session_start_ms(", start)
    after = after[:start] + '''def report_error(context, error):
    _report_error(logger, context, error)

def _asyncio_exception_handler(loop, context):
    asyncio_exception_handler(loop, context)

''' + after[end:]
    after = _once(after, "        if should_reset:\n", '''        if should_reset:
            logger.warning("Daily reset begins: old_marker=%s now=%s reason=stable_calendar_or_missing_marker",
                           last_reset_date_str, now.isoformat())
''')
    after = _once(after, "    loop = asyncio.get_running_loop()\n", '''    logger.info("Kodi Player.Open request: song=%s command_id=%s", filename, command_id)
    loop = asyncio.get_running_loop()
''')
    after = _once(after, '''    finally:
        pending_kodi_requests.pop(command_id, None)
''', '''        logger.info("Kodi Player.Open command acknowledged (not playback confirmation): song=%s command_id=%s",
                    filename, command_id)
    finally:
        pending_kodi_requests.pop(command_id, None)
''')
    after = _once(after, "    await reset_song_and_tokens(filename)\n", '''    logger.info("Queue cleanup and token return requested: song=%s trigger=Player.Open_ACK", filename)
    await reset_song_and_tokens(filename)
''')
    after = _once(after, '    logger.info("REPRODUCIENDO: %s", clean_title(filename))',
                  '    logger.info("Kodi ACK processed; playback not verified: %s", clean_title(filename))')
    after = _once(after, "            data = json.loads(await ws.recv())\n", '''            data = json.loads(await ws.recv())
            log_kodi_notification(logger, data, current_playing_file[0])
''')
    verify_business_functions_unchanged(before, after)
    compile(after, "bridge.py", "exec")
    return after.encode("utf-8")


def _atomic_write(path, content):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".logging-patch-", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def install(target):
    target = Path(target).resolve()
    bridge = target / "bridge.py"
    original = bridge.read_bytes()
    updated = patched_source(original)  # Validate everything before any write.
    modules = {name: (Path(__file__).resolve().parent / name).read_bytes()
               for name in ("bridge_logging.py", "bridge_diagnostics.py")}
    for name, content in modules.items():
        compile(content, name, "exec")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = target / f"bridge_before_logging_{stamp}.py.bak"
    with backup.open("xb") as stream:
        stream.write(original)
    if hashlib.sha256(backup.read_bytes()).hexdigest() != STABLE_SHA256:
        raise OSError("Backup verification failed; bridge unchanged")
    for name, content in modules.items():
        _atomic_write(target / name, content)
    _atomic_write(bridge, updated)
    if bridge.read_bytes() != updated:
        raise OSError("Installed bridge read-back did not match")
    return backup


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="Folder containing the exact stable bridge.py")
    args = parser.parse_args()
    print(f"Logging patch {PATCH_VERSION} saved. Backup: {install(args.target)}")
    print("The running process is unchanged. Restart the bridge once on the bar PC to activate.")
