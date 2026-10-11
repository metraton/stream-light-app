"""Exercises serve.py's file server and live bridge over real loopback HTTP, without the keyboard hook."""

import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import serve  # noqa: E402

CANDIDATE = {'id': 'KeyQ/none', 'key': 'q', 'code': 'KeyQ', 'shiftKey': False, 'ctrlKey': False, 'altKey': False}


def read_event(stream):
    """Reads one SSE frame and returns (event, data), skipping keepalive comments."""
    fields = {}
    while True:
        line = stream.readline().decode().rstrip('\n')
        if line.startswith(':'):
            continue
        if not line and fields:
            return fields['event'], json.loads(fields['data'])
        if line:
            name, _, value = line.partition(': ')
            fields[name] = value


class ServeTest(unittest.TestCase):
    def setUp(self):
        self.bridge = serve.Bridge(lambda: [CANDIDATE])
        self.server = serve.make_server(self.bridge, 0)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.base = f'http://127.0.0.1:{self.server.server_address[1]}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def test_listens_on_loopback_only(self):
        self.assertEqual(self.server.server_address[0], '127.0.0.1')

    def test_serves_index_html(self):
        with urllib.request.urlopen(f'{self.base}/index.html', timeout=5) as response:
            body = response.read()
        print(f'\n  GET /index.html -> {response.status} {response.headers["Content-Type"]}, {len(body)} bytes')
        self.assertEqual(response.status, 200)
        self.assertIn(b'<title>Stream Light</title>', body)

    def test_bridge_delivers_relayed_key_to_client(self):
        with urllib.request.urlopen(f'{self.base}/events', timeout=5) as stream:
            received = [read_event(stream), read_event(stream)]
            self.bridge.toggle_live()
            self.bridge.publish('key', CANDIDATE)
            received += [read_event(stream), read_event(stream)]
        for event, data in received:
            print(f'\n  client received event={event} data={json.dumps(data)}', end='')
        self.assertEqual(received, [
            ('live', {'live': False}),
            ('candidates', [CANDIDATE]),
            ('live', {'live': True}),
            ('key', CANDIDATE),
        ])

    def test_bound_keys_accept_only_json(self):
        def post(content_type, body):
            request = urllib.request.Request(
                f'{self.base}/bound', data=body, headers={'Content-Type': content_type}, method='POST')
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    return response.status
            except urllib.error.HTTPError as error:
                return error.code

        self.assertEqual(post('text/plain', b'["KeyQ/none"]'), 415)
        self.assertFalse(self.bridge.is_bound('KeyQ/none'))
        self.assertEqual(post('application/json', b'{"not": "a list"}'), 400)
        self.assertEqual(post('application/json', b'["KeyQ/none"]'), 204)
        self.assertTrue(self.bridge.is_bound('KeyQ/none'))


if __name__ == '__main__':
    unittest.main()
