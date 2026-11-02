from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bridge_diagnostics import write_snapshot


class DiagnosticsTests(unittest.TestCase):
    def test_snapshot_is_bounded_and_contains_freshness_without_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "bridge.log").write_text("old-line\n" * 100_000 + "latest-song\n", encoding="utf-8")
            (root / "bridge_errors.log").write_text("ws://kodi:secret@localhost:9090/jsonrpc", encoding="utf-8")
            result = write_snapshot(root, "test", pid=123)
            text = result.read_text(encoding="utf-8")
            self.assertIn("latest-song", text)
            self.assertIn("Exportado:", text)
            self.assertIn("Archivo actualizado:", text)
            self.assertIn("PID: 123", text)
            self.assertIn("ws://[REDACTED]@localhost", text)
            self.assertNotIn("secret", text)
            self.assertLess(result.stat().st_size, 74_000)
            self.assertEqual(list(root.glob("*.tmp")), [])

    def test_failed_replace_preserves_previous_report_and_removes_temporary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            result = write_snapshot(root, "before")
            previous = result.read_bytes()
            with patch("bridge_diagnostics.os.replace", side_effect=PermissionError("sync locked")):
                with self.assertRaises(PermissionError):
                    write_snapshot(root, "after")
            self.assertEqual(result.read_bytes(), previous)
            self.assertEqual(list(root.glob("*.tmp")), [])
