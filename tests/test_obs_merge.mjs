// Runs obs/ObsMerge.psm1 on fixtures holding a signed-in profile with fake tokens and a
// collection with user-added sources, then runs obs/install.ps1 twice on a copy of a
// settings folder shaped like a real OBS 32 install (profile folder "streamlight",
// collection file streamlightscenes.json, Aitum output "IG"), and checks the installer
// updates only what it owns and never loses a sign-in or a stream key.
// Run: node --test tests/test_obs_merge.mjs   (needs Windows PowerShell, also through WSL interop; OBS closed)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const harness = join(repo, 'tests', 'fixtures', 'obs', 'run-merge.ps1');
const wslPowerShell = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const viaWsl = process.platform === 'linux' && existsSync(wslPowerShell);
const harnessPath = viaWsl ? spawnSync('wslpath', ['-w', harness], { encoding: 'utf8' }).stdout.trim() : harness;
const run = spawnSync(viaWsl ? wslPowerShell : 'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harnessPath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
assert.equal(run.status, 0, run.stderr);
const result = JSON.parse(run.stdout);

const laptop = path => readFileSync(join(repo, 'tests', 'fixtures', 'obs', 'laptop', path), 'utf8');
const repoIni = readFileSync(join(repo, 'obs', 'profile', 'stream-light', 'basic.ini'), 'utf8');

function ini(text) {
    const sections = {};
    let current = null;
    for (const line of text.split(/\r?\n/)) {
        const header = line.match(/^\[(.+)\]\s*$/);
        if (header) sections[current = header[1]] ??= {};
        else if (current && line.includes('=')) sections[current][line.slice(0, line.indexOf('='))] = line.slice(line.indexOf('=') + 1);
    }
    return sections;
}

function sectionLines(text, name) {
    const lines = text.split(/\r?\n/);
    const start = lines.indexOf(`[${name}]`);
    assert.ok(start >= 0, `[${name}] is present`);
    const end = lines.findIndex((line, index) => index > start && /^\[.+\]\s*$/.test(line));
    return lines.slice(start, end < 0 ? undefined : end).filter(line => line !== '');
}

const profileDirs = snapshot => Object.fromEntries(Object.keys(snapshot)
    .filter(path => /^basic\/profiles\/[^/]+\/basic\.ini$/.test(path))
    .map(path => [ini(snapshot[path]).General.Name, path.split('/')[2]]));
const outputs = snapshot => JSON.parse(snapshot['plugin_config/vertical-canvas/config.json']).canvas[0].stream_outputs;
const installs = { installed: result.installed, reinstalled: result.reinstalled };

test('an installed profile keeps its sign-in, paths, hotkeys and replay length', () => {
    const merged = ini(result.existing['basic.ini']);
    assert.deepEqual(merged.YouTube, {
        RefreshToken: 'FAKE-REFRESH-TOKEN', Token: 'FAKE-ACCESS-TOKEN', ExpireTime: '1700000000',
        ScopeVer: '1', ChannelName: 'Fake Channel',
    });
    assert.deepEqual(merged.Auth, { Type: 'YouTube - RTMPS' });
    assert.deepEqual(merged['YouTube - RTMPS'], { DockState: 'FAKE-USER-LAYOUT' });
    assert.equal(merged['YouTube - RTMP'], undefined, 'no template auth section is added');
    assert.deepEqual(merged.Panels, { CookieId: 'FAKECOOKIEID0001' });
    assert.match(merged.Hotkeys.ReplayBuffer, /OBS_KEY_F9/);
    assert.equal(merged.AdvOut.RecFilePath, 'D:\\Videos\\obs');
    assert.equal(merged.AdvOut.RecRBTime, '45');
    assert.equal(merged.AdvOut.RecRBSize, '1024');
});

test('an installed profile gets the managed values', () => {
    const merged = ini(result.existing['basic.ini']);
    assert.equal(merged.General.Name, 'stream-light-hq');
    assert.equal(merged.Output.Mode, 'Advanced');
    assert.equal(merged.Output.Reconnect, 'true');
    assert.equal(merged.Output.DynamicBitrate, 'true');
    assert.equal(merged.AdvOut.Encoder, 'obs_nvenc_h264_tex');
    assert.equal(merged.AdvOut.Track1Bitrate, '320');
    assert.equal(merged.AdvOut.RecRB, 'true');
    assert.equal(merged.Audio.SampleRate, '48000');
    assert.equal(merged.Video.OutputCY, '1080');
    const stream = JSON.parse(result.existing['streamEncoder.json']);
    assert.equal(stream.bitrate, 8000);
    assert.equal(stream.rate_control, 'CBR');
    assert.equal(stream.user_field, 'kept');
});

test('an installed service.json is never rewritten', () => {
    assert.equal(result.existing['service.json'], undefined);
});

test('a new profile takes the sign-in and service.json of a signed-in profile', () => {
    const fresh = ini(result.fresh['basic.ini']);
    assert.equal(fresh.YouTube.RefreshToken, 'FAKE-REFRESH-TOKEN');
    assert.deepEqual(fresh.Auth, { Type: 'YouTube - RTMPS' });
    assert.deepEqual(fresh['YouTube - RTMPS'], { DockState: 'FAKE-USER-LAYOUT' });
    assert.equal(fresh.Panels, undefined, 'no cookie jar id unless the caller copied the jar');
    assert.equal(fresh.AdvOut.RecRBTime, '20');
    assert.match(result.fresh['service.json'], /FAKE-STREAM-KEY/);
});

test('a new profile with no signed-in donor gets the template and the empty service example', () => {
    const blank = ini(result.blank['basic.ini']);
    assert.equal(blank.YouTube, undefined);
    assert.ok(blank['YouTube - RTMP'].DockState);
    assert.doesNotMatch(result.blank['service.json'], /FAKE/);
});

test('the collection keeps user-added sources and items and updates the repo sources', () => {
    const repoScenes = JSON.parse(readFileSync(join(repo, 'obs', 'scenes', 'stream-light-scenes.json'), 'utf8'));
    const byName = name => result.scenes.sources.find(source => source.name === name);
    const repoBrowser = repoScenes.sources.find(source => source.name === 'Browser');
    assert.deepEqual(byName('My Webcam').settings, { video_device_id: 'fake-camera' });
    assert.ok(byName('Webcam Scene'));
    assert.deepEqual(byName('Browser').settings, repoBrowser.settings);
    assert.equal(byName('Browser').uuid, repoBrowser.uuid);
    assert.deepEqual(byName('Browser').hotkeys, { 'libobs.mute': [{ key: 'OBS_KEY_F8' }] });
    assert.equal(result.scenes.sources.filter(source => source.name === 'Browser').length, 1);
    const sceneItems = byName('Scene').settings.items.map(item => item.name);
    const repoItems = repoScenes.sources.find(source => source.name === 'Scene').settings.items.map(item => item.name);
    assert.deepEqual(sceneItems, [...repoItems, 'My Webcam']);
    assert.deepEqual(result.scenes.transitions.map(transition => transition.name), ['My Fade']);
    assert.deepEqual(result.scenes.scene_order.map(entry => entry.name), ['Webcam Scene', 'Scene']);
});

for (const [label, snapshot] of Object.entries(installs)) {
    test(`laptop layout, ${label}: the YouTube sign-in, the YouTube key and the Instagram key are untouched`, () => {
        const profile = 'basic/profiles/streamlight/';
        assert.equal(snapshot[`${profile}service.json`], laptop(`${profile}service.json`));
        for (const section of ['YouTube', 'Auth', 'Panels']) {
            assert.deepEqual(sectionLines(snapshot[`${profile}basic.ini`], section), sectionLines(laptop(`${profile}basic.ini`), section));
        }
        const fixtureOutputs = JSON.parse(laptop('plugin_config/vertical-canvas/config.json')).canvas[0].stream_outputs;
        assert.deepEqual(outputs(snapshot), fixtureOutputs);
    });

    test(`laptop layout, ${label}: no duplicate profile, collection or output, and user.ini keeps the signed-in ones`, () => {
        assert.deepEqual(profileDirs(snapshot), { 'stream-light': 'streamlight', 'stream-light-hq': 'stream-light-hq' });
        assert.deepEqual(Object.keys(snapshot).filter(path => path.startsWith('basic/scenes/')), ['basic/scenes/streamlightscenes.json']);
        assert.equal(outputs(snapshot).length, 1);
        const user = ini(snapshot['user.ini']);
        assert.equal(user.Basic.Profile, 'stream-light');
        assert.equal(user.Basic.ProfileDir, 'streamlight');
        assert.equal(user.Basic.SceneCollection, 'stream-light-scenes');
        assert.equal(user.Basic.SceneCollectionFile, 'streamlightscenes.json');
        assert.equal(ini(snapshot[`basic/profiles/${user.Basic.ProfileDir}/basic.ini`]).YouTube.RefreshToken, 'FAKE-REFRESH-TOKEN');
        const docks = JSON.parse(user.BasicWindow.ExtraBrowserDocks);
        assert.deepEqual(docks.map(dock => [dock.title, dock.uuid]), [['Stream Health', '107481b5771f4662a2d319af83c41729']]);
    });

    test(`laptop layout, ${label}: the new hq profile inherits the sign-in and a copy of the cookie jar`, () => {
        const hq = 'basic/profiles/stream-light-hq/';
        const donorIni = laptop('basic/profiles/streamlight/basic.ini');
        for (const section of ['YouTube', 'Auth']) {
            assert.deepEqual(sectionLines(snapshot[`${hq}basic.ini`], section), sectionLines(donorIni, section));
        }
        assert.equal(snapshot[`${hq}service.json`], laptop('basic/profiles/streamlight/service.json'));
        const cookieId = ini(snapshot[`${hq}basic.ini`]).Panels.CookieId;
        assert.match(cookieId, /^[0-9A-F]{16}$/);
        assert.notEqual(cookieId, 'FAKECOOKIE000001');
        assert.equal(snapshot[`plugin_config/obs-browser/obs_profile_cookies/${cookieId}/Cookies`],
            laptop('plugin_config/obs-browser/obs_profile_cookies/FAKECOOKIE000001/Cookies'));
    });
}

test('laptop layout: a reinstall keeps the hq cookie jar id', () => {
    const id = snapshot => ini(snapshot['basic/profiles/stream-light-hq/basic.ini']).Panels.CookieId;
    assert.equal(id(result.reinstalled), id(result.installed));
});

test('laptop layout: the profiles get the managed values and the variant encoder', () => {
    const light = ini(result.installed['basic/profiles/streamlight/basic.ini']);
    assert.equal(light.Audio.SampleRate, '48000');
    assert.equal(light.AdvOut.Encoder, 'obs_qsv11_v2');
    assert.equal(light.AdvOut.RecFilePath, 'C:\\\\Users\\\\fake\\\\Videos');
    assert.equal(JSON.parse(result.installed['basic/profiles/streamlight/streamEncoder.json']).bitrate, 4500);
    assert.equal(JSON.parse(result.installed['basic/profiles/stream-light-hq/streamEncoder.json']).bitrate, 8000);
});

test('laptop layout: the repo dock layout replaces an old one once, and a layout arranged in OBS later survives', () => {
    const repoLayout = ini(repoIni)['YouTube - RTMP'].DockState;
    const first = result.installed;
    assert.equal(ini(first['basic/profiles/streamlight/basic.ini'])['YouTube - RTMP'].DockState, repoLayout);
    assert.equal(ini(first['user.ini']).BasicWindow.DockState, repoLayout);
    const second = result.reinstalled;
    assert.equal(ini(second['basic/profiles/streamlight/basic.ini'])['YouTube - RTMP'].DockState, 'FAKE-REARRANGED');
    assert.equal(ini(second['user.ini']).BasicWindow.DockState, 'FAKE-REARRANGED');
});

test('laptop layout: the Aitum canvas and its stream encoder come from the repo and the variant', () => {
    const canvas = JSON.parse(result.installed['plugin_config/vertical-canvas/config.json']).canvas[0];
    assert.equal(canvas.width, 1080);
    assert.equal(canvas.height, 1920);
    assert.equal(canvas.backtrack_seconds, 120);
    assert.deepEqual(canvas.backtrack_hotkeys, { 'ReplayBuffer.Save': [{ key: 'OBS_KEY_SLASH' }] });
    assert.equal(canvas.stream_advanced_settings, true);
    assert.equal(canvas.stream_encoder, 'obs_qsv11_v2');
    assert.equal(canvas.stream_encoder_settings.bitrate, 3000);
});

test('laptop layout: the collection gains the rekordbox capture matched by executable and the vertical transform', () => {
    const scenes = JSON.parse(result.installed['basic/scenes/streamlightscenes.json']);
    const capture = scenes.sources.find(source => source.id === 'wasapi_process_output_capture');
    assert.match(capture.settings.window, /:rekordbox\.exe$/);
    assert.equal(capture.settings.priority, 2, 'WINDOW_PRIORITY_EXE');
    assert.equal(scenes.DesktopAudioDevice1, undefined);
    const vertical = scenes.sources.find(source => source.name === 'Vertical Scene').settings.items[0];
    assert.deepEqual([vertical.rot, vertical.pos, vertical.scale.x], [270, { x: 0, y: 1920 }, 1]);
});
