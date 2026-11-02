"""Install the bounded queue-preservation repair on the exact stable logs.1 bridge.

This installer only edits the explicit local target; it never starts the bridge
or connects to Kodi or Firestore.
"""
import argparse
import ast
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
import tempfile


STABLE_LOGS_SHA256 = "c4d23f059eef606c68389b5266624ec9638d67ae158740caea8e29b8819ccf2c"
PATCH_VERSION = "2.3.1+logs.1"
INTENDED_FUNCTIONS = {"clear_all_data", "check_for_new_session", "_play_song_on_kodi"}


def _once(source, before, after):
    if source.count(before) != 1:
        raise ValueError(f"Unexpected stable logs.1 source: marker count for {before[:70]!r}")
    return source.replace(before, after, 1)


def _function_dump(source):
    return {
        node.name: ast.dump(node, include_attributes=False)
        for node in ast.parse(source).body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def verify_only_intended_functions_changed(before, after):
    old, new = _function_dump(before), _function_dump(after)
    changed = {name for name in old.keys() | new.keys() if old.get(name) != new.get(name)}
    if changed != INTENDED_FUNCTIONS:
        raise ValueError(f"Unexpected changed functions: {sorted(changed)}")


def _replace_function(source, name, replacement):
    tree = ast.parse(source)
    matches = [node for node in tree.body
               if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one top-level function {name}")
    node = matches[0]
    lines = source.splitlines(keepends=True)
    start = sum(len(line) for line in lines[:node.lineno - 1])
    end = sum(len(line) for line in lines[:node.end_lineno])
    return source[:start] + replacement.rstrip() + "\n\n" + source[end:]


_CHECK_FOR_NEW_SESSION = '''async def check_for_new_session():
    """Reset only when a valid marker proves a calendar rollover is due."""
    try:
        now = datetime.now()
        state_doc = db.collection('state').document('nowPlaying').get()
        state = state_doc.to_dict() if state_doc.exists else {}
        marker = state.get('lastResetDate')
        try:
            last_reset = datetime.fromisoformat(marker) if marker else None
        except (ValueError, TypeError):
            last_reset = None

        if last_reset is None:
            baseline = now.isoformat()
            current_session_start_ms = session_start_ms(now)
            db.collection('state').document('nowPlaying').set({
                'lastResetDate': baseline,
                'sessionStart': current_session_start_ms,
                'lastActive': int(time.time() * 1000),
            }, merge=True)
            SESSION_STATE['start'] = current_session_start_ms
            logger.warning("Falta o es inválido lastResetDate; se conserva la cola y se inicia una referencia")
            return

        if last_reset.tzinfo is not None:
            last_reset = last_reset.astimezone().replace(tzinfo=None)
        should_reset = (
            (now.date() > last_reset.date() and now.hour >= 2)
            or (now.date() == last_reset.date() and last_reset.hour < 2 <= now.hour)
        )
        current_session_start_ms = session_start_ms(now)
        if should_reset:
            logger.warning("Daily reset begins: old_marker=%s now=%s reason=valid_calendar_marker", marker, now.isoformat())
            if not await clear_all_data(current_session_start_ms):
                logger.warning("Limpieza incompleta; se reintentará sin marcar lastResetDate")
                return
            db.collection('state').document('nowPlaying').set({
                'lastResetDate': now.isoformat(),
                'lastActive': int(time.time() * 1000),
            }, merge=True)
            SESSION_STATE['start'] = current_session_start_ms
            SESSION_USER_IDS.clear()
            print(" [SISTEMA] ¡Base de datos reseteada para la nueva jornada!")
        else:
            SESSION_STATE['start'] = current_session_start_ms
            db.collection('state').document('nowPlaying').set(
                {'lastActive': int(time.time() * 1000)}, merge=True)
    except Exception as error:
        report_error("Error al comprobar sesión", error)
'''


def patched_source(original):
    if hashlib.sha256(original).hexdigest() != STABLE_LOGS_SHA256:
        raise ValueError("Target is not the verified stable 2.3.0+logs.1; no files changed")
    before = original.decode("utf-8").replace("\r\n", "\n")
    after = _once(before, 'BRIDGE_VERSION = "2.3.0+logs.1"',
                  f'BRIDGE_VERSION = "{PATCH_VERSION}"')
    after = _replace_function(after, "check_for_new_session", _CHECK_FOR_NEW_SESSION)

    # Do not certify a reset after any failed batch or session-state write.
    after = _once(after, '''        print(" [SISTEMA] ¡Base de datos reseteada para la nueva sesión!")
    except Exception as e:
        report_error("Error en limpieza total", e)
''', '''        print(" [SISTEMA] ¡Base de datos reseteada para la nueva sesión!")
        return True
    except Exception as e:
        report_error("Error en limpieza total", e)
        return False
''')

    # Playback/progress updates share the nowPlaying document with watchdog metadata.
    after = _once(after, '''        'lastActive': int(time.time() * 1000)
    })
    PROGRESS_STATE['file'] = filename
''', '''        'lastActive': int(time.time() * 1000)
    }, merge=True)
    PROGRESS_STATE['file'] = filename
''')
    # The pinned stable logs.1 source already uses merge=True for progress.
    # Assert its exact expected location and shape without changing unrelated main().
    main_node = next(node for node in ast.parse(after).body
                     if isinstance(node, ast.AsyncFunctionDef) and node.name == "main")
    progress_merge = any(
        isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "set"
        and any(keyword.arg == "merge" and isinstance(keyword.value, ast.Constant)
                and keyword.value.value is True for keyword in node.keywords)
        and node.args and isinstance(node.args[0], ast.Dict)
        and {key.value for key in node.args[0].keys if isinstance(key, ast.Constant)} >= {"songId", "lastActive"}
        for node in ast.walk(main_node)
    )
    if not progress_merge:
        raise ValueError("Stable logs.1 progress write must preserve nowPlaying fields")
    verify_only_intended_functions_changed(before, after)
    compile(after, "bridge.py", "exec")
    return after.encode("utf-8")


def _atomic_write(path, content):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".queue-fix-", delete=False) as stream:
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
    updated = patched_source(original)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup = target / f"bridge_before_queue_fix_{stamp}.py.bak"
    with backup.open("xb") as stream:
        stream.write(original)
    if hashlib.sha256(backup.read_bytes()).hexdigest() != STABLE_LOGS_SHA256:
        raise OSError("Backup verification failed; bridge unchanged")
    _atomic_write(bridge, updated)
    if bridge.read_bytes() != updated:
        raise OSError("Installed bridge read-back did not match")
    return backup


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="Folder containing the exact stable logs.1 bridge.py")
    args = parser.parse_args()
    print(f"Queue preservation patch {PATCH_VERSION} saved. Backup: {install(args.target)}")
    print("The running process is unchanged. Restart the bridge once on the bar PC to activate.")
