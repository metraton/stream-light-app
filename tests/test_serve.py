"""Exercises serve.py's file server and live bridge over real loopback HTTP, without the keyboard hook."""

import json
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from types import SimpleNamespace

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
            self.bridge.set_live(True)
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


def drain(events):
    received = []
    while not events.empty():
        received.append(events.get_nowait())
    return received


def key_event(vk, scan):
    return SimpleNamespace(vkCode=vk, scanCode=scan, flags=0)


CAPS = key_event(serve.VK_CAPITAL, 0x3A)
LEFT_SHIFT = key_event(serve.VK_LSHIFT, 0x2A)
Q = key_event(ord('Q'), 0x10)
Z = key_event(ord('Z'), 0x2C)


class CapsLockLiveModeTest(unittest.TestCase):
    """Live mode follows Caps Lock, and Caps never acts as Shift; runs without installing the hook."""

    def setUp(self):
        self.bridge = serve.Bridge(lambda: [])
        self.events = self.bridge.subscribe()
        drain(self.events)

    def test_caps_keydown_flips_live_once_per_press_ignoring_autorepeat(self):
        hook = serve.KeyboardHook(self.bridge)
        injected_caps = SimpleNamespace(vkCode=serve.VK_CAPITAL, scanCode=0x3A, flags=serve.LLKHF_INJECTED)
        presses = [
            (CAPS, True), (CAPS, True), (CAPS, True), (CAPS, False),
            (CAPS, True), (CAPS, False),
            (injected_caps, True), (injected_caps, False),
        ]
        swallowed = [hook._swallow(event, is_down) for event, is_down in presses]

        self.assertEqual(swallowed, [False] * len(presses))
        self.assertEqual(drain(self.events), [
            ('live', {'live': True}),
            ('live', {'live': False}),
            ('live', {'live': True}),
        ])

    def test_live_mode_starts_from_the_seeded_caps_state(self):
        self.bridge.set_live(True)
        hook = serve.KeyboardHook(self.bridge)
        hook._swallow(CAPS, True)
        self.assertFalse(self.bridge.live)

    def test_caps_lock_passes_through_and_is_not_read_as_shift(self):
        hook = serve.KeyboardHook(self.bridge)
        self.bridge.set_bound(['KeyQ/none', 'KeyZ/shift'])

        self.assertFalse(hook._swallow(CAPS, True))
        self.assertFalse(hook._swallow(CAPS, False))
        self.assertTrue(self.bridge.live)
        self.assertTrue(hook._swallow(Q, True))
        self.assertTrue(hook._swallow(Q, False))
        self.assertFalse(hook._swallow(LEFT_SHIFT, True))
        self.assertTrue(hook._swallow(Z, True))

        relayed = [data for event, data in drain(self.events) if event == 'key']
        self.assertEqual([(k['code'], k['shiftKey']) for k in relayed], [('KeyQ', False), ('KeyZ', True)])

    def test_nothing_is_swallowed_with_caps_lock_off(self):
        hook = serve.KeyboardHook(self.bridge)
        self.bridge.set_bound(['KeyQ/none'])
        self.assertFalse(hook._swallow(Q, True))
        self.assertFalse(hook._swallow(Q, False))
        self.assertEqual(drain(self.events), [])


if __name__ == '__main__':
    unittest.main()
