"""Serve stream-light-app on 127.0.0.1 and relay its shortcuts from any window.

Live mode follows the Caps Lock toggle, so the keyboard's Caps light shows it.
While live, a Windows low-level keyboard hook (WH_KEYBOARD_LL, no admin rights
needed) swallows every keystroke the page reports as bound and relays it to the
page as a Server-Sent Event on /events. Standard library only; Windows only.
"""

import argparse
import ctypes
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
from ctypes import wintypes
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = '127.0.0.1'
CHROME_PROFILE = Path.home() / '.stream-light-chrome'
CHROME_FLAGS = [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
]
KEEPALIVE_SECONDS = 15
CAPS_POLL_SECONDS = 0.1

WH_KEYBOARD_LL = 13
HC_ACTION = 0
WM_KEYDOWN = 0x0100
WM_SYSKEYDOWN = 0x0104
LLKHF_EXTENDED = 0x01
LLKHF_INJECTED = 0x10
MAPVK_VSC_TO_VK_EX = 3
# ToUnicodeEx flag (Windows 10 1607+): translate without consuming a pending
# dead key, so probing a keystroke never alters what the user types next.
TOUNICODE_KEEP_STATE = 0x4

VK_CAPITAL = 0x14
VK_SHIFT, VK_CONTROL, VK_MENU = 0x10, 0x11, 0x12
VK_LSHIFT, VK_RSHIFT = 0xA0, 0xA1
VK_LCONTROL, VK_RCONTROL = 0xA2, 0xA3
VK_LMENU, VK_RMENU = 0xA4, 0xA5
MODIFIER_VKS = {VK_LSHIFT, VK_RSHIFT, VK_LCONTROL, VK_RCONTROL, VK_LMENU, VK_RMENU}

# Modifier combinations a relayable keystroke may carry, as the keyboard state
# ToUnicodeEx needs to produce the character. AltGr is Ctrl+Alt to Windows.
# VK_CAPITAL is never set: Caps Lock is always on while live, and it must not
# change which shortcut a key resolves to (moods stay Shift-driven).
KEYSTATE_BY_MODIFIERS = {
    'none': (),
    'shift': (VK_SHIFT,),
    'altgr': (VK_CONTROL, VK_MENU),
}

# KeyboardEvent.code (W3C UI Events) by set-1 scan code for the non-extended
# main-block and numpad keys; arrows, Insert/Delete and the like are extended
# and never relayed.
SCAN_TO_CODE = {
    0x01: 'Escape', 0x0C: 'Minus', 0x0D: 'Equal', 0x0E: 'Backspace',
    0x0F: 'Tab', 0x1A: 'BracketLeft', 0x1B: 'BracketRight', 0x1C: 'Enter',
    0x27: 'Semicolon', 0x28: 'Quote', 0x29: 'Backquote', 0x2B: 'Backslash',
    0x33: 'Comma', 0x34: 'Period', 0x35: 'Slash', 0x37: 'NumpadMultiply',
    0x39: 'Space', 0x4A: 'NumpadSubtract', 0x4E: 'NumpadAdd',
    0x56: 'IntlBackslash',
}
SCAN_TO_CODE.update({0x02 + i: f'Digit{(i + 1) % 10}' for i in range(10)})
for first_scan, letters in ((0x10, 'QWERTYUIOP'), (0x1E, 'ASDFGHJKL'), (0x2C, 'ZXCVBNM')):
    SCAN_TO_CODE.update({first_scan + i: f'Key{letter}' for i, letter in enumerate(letters)})

CONTROL_KEY_NAMES = {'\x1b': 'Escape', '\b': 'Backspace', '\t': 'Tab', '\r': 'Enter'}

user32 = ctypes.WinDLL('user32', use_last_error=True)
kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)

LRESULT = ctypes.c_ssize_t
HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)


class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ('vkCode', wintypes.DWORD),
        ('scanCode', wintypes.DWORD),
        ('flags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_size_t),
    ]


user32.SetWindowsHookExW.argtypes = [ctypes.c_int, HOOKPROC, wintypes.HINSTANCE, wintypes.DWORD]
user32.SetWindowsHookExW.restype = ctypes.c_void_p
user32.CallNextHookEx.argtypes = [ctypes.c_void_p, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM]
user32.CallNextHookEx.restype = LRESULT
user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
user32.GetMessageW.restype = wintypes.BOOL
user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.GetWindowThreadProcessId.restype = wintypes.DWORD
user32.GetKeyboardLayout.argtypes = [wintypes.DWORD]
user32.GetKeyboardLayout.restype = ctypes.c_void_p
user32.GetKeyState.argtypes = [ctypes.c_int]
user32.GetKeyState.restype = ctypes.c_short
user32.MapVirtualKeyExW.argtypes = [wintypes.UINT, wintypes.UINT, ctypes.c_void_p]
user32.MapVirtualKeyExW.restype = wintypes.UINT
user32.ToUnicodeEx.argtypes = [
    wintypes.UINT, wintypes.UINT, ctypes.POINTER(ctypes.c_ubyte),
    wintypes.LPWSTR, ctypes.c_int, wintypes.UINT, ctypes.c_void_p,
]
user32.ToUnicodeEx.restype = ctypes.c_int
kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
kernel32.GetModuleHandleW.restype = wintypes.HMODULE


def caps_lock_on():
    """Returns the Caps Lock toggle state Windows reports, the one the keyboard light shows."""
    return bool(user32.GetKeyState(VK_CAPITAL) & 1)


def foreground_layout():
    """Returns the keyboard layout of the focused window, the one the user is typing with."""
    thread_id = user32.GetWindowThreadProcessId(user32.GetForegroundWindow(), None)
    return user32.GetKeyboardLayout(thread_id)


def describe_keystroke(scan, modifiers, layout):
    """Returns the keydown fields Chrome would report for a keystroke, or None if it yields no key."""
    code = SCAN_TO_CODE.get(scan)
    if code is None:
        return None
    keystate = (ctypes.c_ubyte * 256)()
    for vk in KEYSTATE_BY_MODIFIERS[modifiers]:
        keystate[vk] = 0x80
    vk = user32.MapVirtualKeyExW(scan, MAPVK_VSC_TO_VK_EX, layout)
    buffer = ctypes.create_unicode_buffer(8)
    length = user32.ToUnicodeEx(vk, scan, keystate, buffer, len(buffer), TOUNICODE_KEEP_STATE, layout)
    if length < 0:
        key = 'Dead'
    elif length == 0:
        return None
    else:
        text = buffer[:length]
        key = CONTROL_KEY_NAMES.get(text, text)
    return {
        'id': f'{code}/{modifiers}',
        'key': key,
        'code': code,
        'shiftKey': modifiers == 'shift',
        'ctrlKey': False,
        'altKey': False,
    }


def keystroke_candidates(layout):
    """Every keystroke the hook could relay, for the page to sort into bound and unbound."""
    candidates = (
        describe_keystroke(scan, modifiers, layout)
        for scan in SCAN_TO_CODE
        for modifiers in KEYSTATE_BY_MODIFIERS
    )
    return [keystroke for keystroke in candidates if keystroke is not None]


class Bridge:
    """Live-mode state shared by the keyboard hook thread and the HTTP handlers."""

    def __init__(self, list_candidates):
        self._list_candidates = list_candidates
        self._lock = threading.Lock()
        self._subscribers = []
        self._bound = frozenset()
        self.live = False

    def subscribe(self):
        """Registers a page; its queue starts with the live state and the candidate keystrokes."""
        events = queue.Queue()
        events.put(('live', {'live': self.live}))
        events.put(('candidates', self._list_candidates()))
        with self._lock:
            self._subscribers.append(events)
        return events

    def unsubscribe(self, events):
        with self._lock:
            self._subscribers.remove(events)

    def publish(self, event, data):
        with self._lock:
            subscribers = list(self._subscribers)
        for events in subscribers:
            events.put((event, data))

    def set_live(self, live):
        """Records the live state and tells the pages, only when it actually changes."""
        if live == self.live:
            return
        self.live = live
        self.publish('live', {'live': live})

    def set_bound(self, keystroke_ids):
        self._bound = frozenset(keystroke_ids)

    def is_bound(self, keystroke_id):
        return keystroke_id in self._bound


def follow_caps_lock(bridge, read_caps=caps_lock_on):
    """Keeps live mode equal to Caps Lock forever.

    Polling, rather than reacting to the Caps key in the hook, also catches Caps
    turned off by other means (the Windows "press Shift to turn off Caps Lock"
    setting) and reads the state after Windows has applied the toggle.
    """
    while True:
        bridge.set_live(read_caps())
        time.sleep(CAPS_POLL_SECONDS)


class KeyboardHook(threading.Thread):
    """Owns the WH_KEYBOARD_LL hook; Windows calls it on the thread that installed it."""

    def __init__(self, bridge):
        super().__init__(name='keyboard-hook', daemon=True)
        self._bridge = bridge
        self._held_modifiers = set()
        self._swallowed_scans = set()
        self._proc = HOOKPROC(self._on_key)
        self._installed = threading.Event()
        self.error = None

    def install(self):
        """Starts the hook thread and raises if Windows refused the hook."""
        self.start()
        self._installed.wait()
        if self.error:
            raise self.error

    def run(self):
        hook = user32.SetWindowsHookExW(WH_KEYBOARD_LL, self._proc, kernel32.GetModuleHandleW(None), 0)
        if not hook:
            self.error = ctypes.WinError(ctypes.get_last_error())
        self._installed.set()
        if not hook:
            return
        message = wintypes.MSG()
        while user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
            pass

    def _on_key(self, n_code, w_param, l_param):
        if n_code == HC_ACTION:
            event = ctypes.cast(l_param, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
            is_down = w_param in (WM_KEYDOWN, WM_SYSKEYDOWN)
            if not event.flags & LLKHF_INJECTED and self._swallow(event, is_down):
                return 1
        return user32.CallNextHookEx(None, n_code, w_param, l_param)

    def _swallow(self, event, is_down):
        """Decides whether a key event stops here; relays bound keydowns while live.

        Caps Lock itself always passes through: Windows must toggle it for the
        keyboard light and for follow_caps_lock to see the change.
        """
        vk, scan = event.vkCode, event.scanCode
        if vk in MODIFIER_VKS:
            if is_down:
                self._held_modifiers.add(vk)
            else:
                self._held_modifiers.discard(vk)
            return False
        if not is_down:
            if scan in self._swallowed_scans:
                self._swallowed_scans.discard(scan)
                return True
            return False
        modifiers = self._modifiers()
        if not self._bridge.live or event.flags & LLKHF_EXTENDED or modifiers is None:
            return False
        keystroke = describe_keystroke(scan, modifiers, foreground_layout())
        if keystroke is None or not self._bridge.is_bound(keystroke['id']):
            return False
        self._swallowed_scans.add(scan)
        self._bridge.publish('key', keystroke)
        return True

    def _modifiers(self):
        """Names the held modifier combination, or None for one the hook never relays (Ctrl, Alt)."""
        held = self._held_modifiers
        altgr = VK_RMENU in held
        shift = bool(held & {VK_LSHIFT, VK_RSHIFT})
        if VK_LMENU in held or (held & {VK_LCONTROL, VK_RCONTROL} and not altgr):
            return None
        if altgr:
            return None if shift else 'altgr'
        return 'shift' if shift else 'none'


class Handler(SimpleHTTPRequestHandler):
    """Serves the app's files plus the bridge endpoints /events and /bound."""

    def __init__(self, *args, bridge, **kwargs):
        self.bridge = bridge
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.path == '/events':
            self._stream_events()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != '/bound':
            self.send_error(404)
            return
        # Requiring JSON forces a CORS preflight on any cross-origin page, which
        # this server never answers, so only the app itself can set the bound keys.
        if self.headers.get_content_type() != 'application/json':
            self.send_error(415)
            return
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        try:
            keystroke_ids = json.loads(body)
        except ValueError:
            keystroke_ids = None
        if not isinstance(keystroke_ids, list) or not all(isinstance(i, str) for i in keystroke_ids):
            self.send_error(400)
            return
        self.bridge.set_bound(keystroke_ids)
        self.send_response(204)
        self.end_headers()

    def _stream_events(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        events = self.bridge.subscribe()
        try:
            while True:
                try:
                    event, data = events.get(timeout=KEEPALIVE_SECONDS)
                    frame = f'event: {event}\ndata: {json.dumps(data)}\n\n'
                except queue.Empty:
                    frame = ': keepalive\n\n'
                self.wfile.write(frame.encode())
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        finally:
            self.bridge.unsubscribe(events)


def make_server(bridge, port):
    """Builds the loopback-only HTTP server for the app files and the bridge."""
    handler = partial(Handler, bridge=bridge, directory=str(ROOT))
    return ThreadingHTTPServer((HOST, port), handler)


def find_chrome():
    candidates = [
        shutil.which('chrome'),
        Path(os.environ.get('PROGRAMFILES', r'C:\Program Files')) / 'Google/Chrome/Application/chrome.exe',
        Path(os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)')) / 'Google/Chrome/Application/chrome.exe',
        Path(os.environ.get('LOCALAPPDATA', '')) / 'Google/Chrome/Application/chrome.exe',
    ]
    return next((str(path) for path in candidates if path and Path(path).is_file()), None)


def launch_chrome(url):
    chrome = find_chrome()
    if chrome is None:
        sys.exit('chrome.exe not found; start the app window by hand or drop --chrome.')
    subprocess.Popen([chrome, f'--app={url}', f'--user-data-dir={CHROME_PROFILE}', *CHROME_FLAGS])


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--port', type=int, default=8080)
    parser.add_argument('--chrome', action='store_true', help='open the Chrome app window OBS captures')
    args = parser.parse_args()

    bridge = Bridge(lambda: keystroke_candidates(foreground_layout()))
    bridge.set_live(caps_lock_on())
    threading.Thread(target=follow_caps_lock, args=(bridge,), name='caps-lock', daemon=True).start()
    KeyboardHook(bridge).install()
    server = make_server(bridge, args.port)
    # localhost, not 127.0.0.1: the Chrome profile keeps camera permission and
    # presets per origin, and the existing ones belong to http://localhost:8080.
    url = f'http://localhost:{args.port}'
    state = 'ON' if bridge.live else 'OFF'
    print(f'Serving {ROOT} at {url} (bound to {HOST}). Caps Lock toggles live mode (now {state}); Ctrl+C stops.',
          flush=True)
    if args.chrome:
        launch_chrome(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
