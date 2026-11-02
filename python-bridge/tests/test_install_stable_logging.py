from pathlib import Path
import tempfile
import unittest

from install_stable_logging import install, verify_business_functions_unchanged


class StableLoggingInstallerTests(unittest.TestCase):
    def test_unknown_bridge_is_rejected_without_writing_anything(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = b"print('some other bridge')\n"
            (root / "bridge.py").write_bytes(original)
            with self.assertRaisesRegex(ValueError, "not the verified stable"):
                install(root)
            self.assertEqual((root / "bridge.py").read_bytes(), original)
            self.assertEqual([p.name for p in root.iterdir()], ["bridge.py"])

    def test_business_guard_accepts_only_logging_additions_and_rejects_changed_action(self):
        original = "def play():\n    return 'play'\n"
        verify_business_functions_unchanged(original, "def play():\n    logger.info('request')\n    return 'play'\n")
        with self.assertRaisesRegex(ValueError, "function changed"):
            verify_business_functions_unchanged(original, "def play():\n    return 'delete_queue'\n")
