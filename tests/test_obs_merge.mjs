// Runs obs/ObsMerge.psm1 (the merge obs/install.ps1 applies) on fixtures holding a
// signed-in profile with fake tokens and a collection with user-added sources, and
// checks the installer updates only what it owns.
// Run: node --test tests/test_obs_merge.mjs   (needs Windows PowerShell)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const harness = join(repo, 'tests', 'fixtures', 'obs', 'run-merge.ps1');
const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness], { encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr);
const result = JSON.parse(run.stdout);

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
    assert.equal(merged.Audio.SampleRate, '44100');
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
    assert.equal(fresh.Panels, undefined, 'the cookie jar id is OBS-generated per profile');
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
