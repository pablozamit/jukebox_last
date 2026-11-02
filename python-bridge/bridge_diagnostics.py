"""Closed, bounded log snapshot for syncing; never connects to Firebase or Kodi."""
from datetime import datetime, timezone
from pathlib import Path
import os
import re
import tempfile


def _recent_text(path, limit=24_000):
    with path.open("rb") as stream:
        size = stream.seek(0, os.SEEK_END)
        stream.seek(max(0, size - limit))
        if size > limit:
            stream.readline()  # Discard a potentially split UTF-8 line.
        return stream.read(limit).decode("utf-8", errors="replace")


def write_snapshot(log_dir, version, *, pid=None):
    """Publish an atomic closed copy; its timestamp proves export, not playback."""
    directory = Path(log_dir).resolve()
    exported = datetime.now(timezone.utc).isoformat()
    sections = [
        "JUKEBOX - DIAGNOSTICO (horas UTC)",
        f"Exportado: {exported}",
        f"Version: {version} | PID: {pid if pid is not None else os.getpid()}",
        f"Directorio de logs: {directory}",
        "Una orden aceptada por Kodi no demuestra reproduccion ni audio audible.",
    ]
    for name in ("bridge.log", "bridge_errors.log", "bridge_crash.log"):
        path = directory / name
        sections.append(f"\n--- {name} ---")
        try:
            modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
            sections.append(f"Archivo actualizado: {modified.isoformat()}")
            sections.append(_recent_text(path))
        except FileNotFoundError:
            sections.append("No existe en este directorio.")
    content = "\n".join(sections)
    # Historical logs may predate the redacting logger.
    content = re.sub(r"(?i)\b((?:https?|wss?)://)[^/@\s]+@", r"\1[REDACTED]@", content)
    target = directory / "bridge_diagnostico.txt"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory,
                                         prefix=".bridge-diagnostic-", suffix=".tmp",
                                         delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
        os.replace(temporary, target)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return target


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    print(write_snapshot(args.log_dir, "exportacion-manual"))
