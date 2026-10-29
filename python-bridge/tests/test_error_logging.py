"""Logging-only subprocess: never loads credentials, Firestore or Kodi."""
import ast
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

class ErrorLoggingTests(unittest.TestCase):
    def test_actual_logging_block_captures_normal_thread_and_asyncio_errors(self):
        source = (Path(__file__).resolve().parents[1] / 'bridge.py').read_text()
        # Only select the actual startup logging statements before Firebase startup.
        tree = ast.parse(source)
        selected = []
        for node in tree.body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'logger' for t in node.targets):
                selected.append(node)
            elif selected:
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == 'flush_social_outbox':
                    break
                selected.append(node)
        code = 'import asyncio, logging, sys, threading, faulthandler\nfrom logging.handlers import RotatingFileHandler\nBRIDGE_VERSION="test-candidate"\n'
        code += ast.unparse(ast.Module(body=selected, type_ignores=[]))
        code += '''
try:
    raise ValueError('normal-sentinel')
except Exception as error:
    report_error('normal-context', error)
def thread_failure():
    raise RuntimeError('thread-sentinel')
t = threading.Thread(target=thread_failure); t.start(); t.join()
async def exercise():
    loop=asyncio.get_running_loop(); loop.set_exception_handler(_asyncio_exception_handler)
    loop.call_exception_handler({'message':'async-sentinel', 'exception':ValueError('async-exception-sentinel')})
asyncio.run(exercise())
logging.shutdown()
'''
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, '-c', code], cwd=directory, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            text=(Path(directory)/'bridge_errors.log').read_text()
            for sentinel in ['normal-sentinel','thread-sentinel','async-sentinel','async-exception-sentinel','Traceback','[vtest-candidate]']:
                self.assertIn(sentinel,text)
            self.assertTrue((Path(directory)/'bridge_crash.log').exists())
