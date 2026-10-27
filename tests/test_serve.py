import json
import sys
import threading
import unittest
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import serve  # noqa: E402


class ServeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve.make_server("127.0.0.1", 0, quiet=True)  # porta livre
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=5) as resp:
            return resp.status, resp.headers, resp.read()

    def test_index(self):
        status, headers, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", headers["Content-Type"])
        self.assertIn(b"importmap", body)

    def test_js_module_mime(self):
        for path in ("/src/main.js", "/vendor/three/build/three.module.js"):
            _, headers, _ = self.get(path)
            self.assertTrue(headers["Content-Type"].startswith("text/javascript"), path)

    def test_catalog_json(self):
        _, headers, body = self.get("/data/whiskies.json")
        self.assertIn("application/json", headers["Content-Type"])
        self.assertEqual(len(json.loads(body)["produtos"]), 10)

    def test_hdr_and_no_cache(self):
        _, headers, _ = self.get("/assets/hdri/brown_photostudio_02_1k.hdr")
        self.assertEqual(headers["Content-Type"], "application/octet-stream")
        self.assertEqual(headers["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
