<#
.SYNOPSIS
Installs the stream-light and stream-light-hq OBS profiles, the stream-light-scenes collection, the Aitum
Vertical settings and the Stream Health dock for this Windows user, merging into what is already installed.

.DESCRIPTION
Refuses while OBS is running and backs up %APPDATA%\obs-studio first. Every write is a merge (rules in
ObsMerge.psm1): the script sets only the keys and objects it owns -- video, encoders and their bitrates, audio
sample rate and track bitrate, reconnect and dynamic bitrate, Replay Buffer on, Browser Source hardware
acceleration off, the Stream Health dock, the repo's sources in the collection and the Aitum Vertical canvas and
Instagram fields -- and leaves everything else as OBS or the user wrote it: the YouTube sign-in, service.json,
[Panels] CookieId, Replay Buffer length and size, hotkeys, file paths and user-added sources.
A profile this run creates takes the sign-in ([Auth], [YouTube], [YouTube - *] and service.json) of another
installed stream-light profile that is signed in; it is copied between installed profiles only, never into the
repo.

.PARAMETER ReelDir
Folder where Aitum Vertical saves the backtrack clips; created when missing.
#>
[CmdletBinding()]
param(
    [ValidateSet('nvidia', 'intel')]
    [string]$Variant,
    [string]$ReelDir = (Join-Path $env:USERPROFILE 'Videos\reel-raw')
)

# Profile name -> YouTube video bitrate (kbps). stream-light is the standard; stream-light-hq is for a good link.
$Profiles = [ordered]@{ 'stream-light' = 4500; 'stream-light-hq' = 8000 }

$ErrorActionPreference = 'Stop'

# The v value must equal BUILD in monitor/index.html: OBS serves a stale cached index.html otherwise.
$StreamHealthUrl = 'http://localhost:8080/monitor/?v=2026-10-13.4'

Import-Module (Join-Path $PSScriptRoot 'ObsMerge.psm1') -Force

$repo = Split-Path -Parent $PSScriptRoot
$obsDir = Join-Path $env:APPDATA 'obs-studio'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Json {
    param([string]$Path)
    return [IO.File]::ReadAllText($Path) | ConvertFrom-Json
}

function Read-ProfileFiles {
    <# Returns file name -> text for the files the merge reads in a profile directory. #>
    param([string]$ProfileDir)
    $files = @{}
    foreach ($name in 'basic.ini', 'service.json', 'streamEncoder.json', 'recordEncoder.json') {
        $path = Join-Path $ProfileDir $name
        if (Test-Path -LiteralPath $path) { $files[$name] = [IO.File]::ReadAllText($path) }
    }
    return $files
}

if (Get-Process obs64 -ErrorAction SilentlyContinue) {
    throw 'OBS is running. Close it and run this script again.'
}

if (-not $Variant) {
    $gpuNames = @(Get-CimInstance Win32_VideoController | ForEach-Object Name)
    $Variant = if ($gpuNames -match 'NVIDIA') { 'nvidia' } else { 'intel' }
    Write-Output "Detected GPU: $($gpuNames -join ', ') -> $Variant encoders"
}

if (Test-Path -LiteralPath $obsDir) {
    $backup = "$obsDir.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item -LiteralPath $obsDir -Destination $backup -Recurse
    Write-Output "Backup: $backup"
}

$commonDir = Join-Path $repo 'obs\profile\stream-light'
$variantDir = Join-Path $repo "obs\profile\encoders\$Variant"
$templateLines = [IO.File]::ReadAllLines((Join-Path $commonDir 'basic.ini'))
$overrides = Read-IniSections ([IO.File]::ReadAllLines((Join-Path $variantDir 'basic-overrides.ini')))
$streamEncoder = Read-Json (Join-Path $variantDir 'streamEncoder.json')
$recordEncoder = Read-Json (Join-Path $variantDir 'recordEncoder.json')
$serviceExample = [IO.File]::ReadAllText((Join-Path $commonDir 'service.example.json'))

$profilesDir = Join-Path $obsDir 'basic\profiles'
$donor = $null
if (Test-Path -LiteralPath $profilesDir) {
    $donor = Get-ChildItem -LiteralPath $profilesDir -Directory |
        Where-Object { $_.Name -match '^stream-light(-[a-z0-9]+)?$' } |
        ForEach-Object { Read-ProfileFiles $_.FullName } |
        Where-Object { $_.ContainsKey('service.json') -and $_.ContainsKey('basic.ini') -and
            (Get-IniValue ($_['basic.ini'] -split "`r?`n") 'YouTube' 'RefreshToken') } |
        Select-Object -First 1
}
foreach ($profileName in $Profiles.Keys) {
    $profileDir = Join-Path $profilesDir $profileName
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
    $existing = Read-ProfileFiles $profileDir
    $files = Merge-ProfileFiles -ProfileName $profileName -Bitrate $Profiles[$profileName] -Existing $existing `
        -TemplateLines $templateLines -Overrides $overrides -StreamEncoder $streamEncoder -RecordEncoder $recordEncoder `
        -ServiceExample $serviceExample -Donor $donor
    foreach ($name in $files.Keys) {
        [IO.File]::WriteAllText((Join-Path $profileDir $name), $files[$name], $utf8NoBom)
    }
    if (-not $existing.ContainsKey('basic.ini') -and $donor) {
        Write-Output "Copied the YouTube sign-in into the new profile $profileName."
    }
}

$scenesDir = Join-Path $obsDir 'basic\scenes'
New-Item -ItemType Directory -Force -Path $scenesDir | Out-Null
$scenesPath = Join-Path $scenesDir 'stream-light-scenes.json'
$installedScenes = if (Test-Path -LiteralPath $scenesPath) { Read-Json $scenesPath } else { $null }
$scenes = Merge-SceneCollection $installedScenes (Read-Json (Join-Path $repo 'obs\scenes\stream-light-scenes.json'))
[IO.File]::WriteAllText($scenesPath, (ConvertTo-Json -InputObject $scenes -Depth 50), $utf8NoBom)

$userIniPath = Join-Path $obsDir 'user.ini'
$userIni = if (Test-Path -LiteralPath $userIniPath) { [IO.File]::ReadAllLines($userIniPath) } else { @() }
$existingDocks = Get-IniValue $userIni 'BasicWindow' 'ExtraBrowserDocks'
$docks = @()
if ($existingDocks) { $docks = @((ConvertFrom-Json $existingDocks) | Where-Object { $_ }) }
$streamHealth = $docks | Where-Object { $_.title -eq 'Stream Health' } | Select-Object -First 1
$uuid = if ($streamHealth) { $streamHealth.uuid } else { [guid]::NewGuid().ToString() }
$docks = @($docks | Where-Object { $_.title -ne 'Stream Health' }) +
    [pscustomobject]@{ uuid = $uuid; title = 'Stream Health'; url = $StreamHealthUrl }
$windowValues = [ordered]@{ ExtraBrowserDocks = (ConvertTo-Json -InputObject $docks -Compress) }
# The repo dock layout places the Stream Health dock; it is applied only when that dock is new or no layout
# exists yet, so a layout arranged in OBS survives a reinstall.
if (-not $streamHealth -or -not (Get-IniValue $userIni 'BasicWindow' 'DockState')) {
    $dockState = Get-IniValue $templateLines 'YouTube - RTMP' 'DockState'
    if (-not $dockState) { throw 'DockState not found in the repo profile.' }
    $windowValues['DockState'] = $dockState
}
$userIni = Set-IniValues $userIni 'BasicWindow' $windowValues
if ((Get-IniValue $userIni 'Basic' 'ProfileDir') -notmatch '^stream-light(-[a-z0-9]+)?$') {
    $userIni = Set-IniValues $userIni 'Basic' ([ordered]@{ Profile = 'stream-light'; ProfileDir = 'stream-light' })
}
$userIni = Set-IniValues $userIni 'Basic' ([ordered]@{
        SceneCollection     = 'stream-light-scenes'
        SceneCollectionFile = 'stream-light-scenes.json'
    })
[IO.File]::WriteAllLines($userIniPath, $userIni, $utf8NoBom)

$globalIniPath = Join-Path $obsDir 'global.ini'
$globalIni = if (Test-Path -LiteralPath $globalIniPath) { [IO.File]::ReadAllLines($globalIniPath) } else { @() }
$globalIni = Set-IniValues $globalIni 'General' ([ordered]@{ BrowserHWAccel = 'false' })
[IO.File]::WriteAllLines($globalIniPath, $globalIni, $utf8NoBom)

# Aitum Vertical keeps one global config.json; the Instagram output is found by name so its server and key,
# typed in the plugin's UI, stay untouched.
$verticalRepo = Join-Path $repo 'obs\vertical'
$verticalTemplate = Read-Json (Join-Path $verticalRepo 'canvas.json')
$verticalEncoder = Read-Json (Join-Path $verticalRepo "encoders\$Variant.json")
$verticalPath = Join-Path $obsDir 'plugin_config\vertical-canvas\config.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $verticalPath), $ReelDir | Out-Null
$vertical = if (Test-Path -LiteralPath $verticalPath) { Read-Json $verticalPath } else { [pscustomobject]@{ canvas = @([pscustomobject]@{}) } }
foreach ($canvas in @($vertical.canvas)) {
    Merge-JsonProperties $canvas $verticalTemplate.canvas | Out-Null
    $canvas | Add-Member -NotePropertyName backtrack_path -NotePropertyValue $ReelDir -Force
    $outputs = @($canvas.stream_outputs | Where-Object { $_ })
    $instagram = $outputs | Where-Object { $_.name -eq $verticalTemplate.instagram_output.name } | Select-Object -First 1
    if (-not $instagram) {
        $instagram = [pscustomobject]@{}
        $outputs += $instagram
    }
    Merge-JsonProperties $instagram $verticalTemplate.instagram_output | Out-Null
    Merge-JsonProperties $instagram $verticalEncoder | Out-Null
    $canvas | Add-Member -NotePropertyName stream_outputs -NotePropertyValue $outputs -Force
}
[IO.File]::WriteAllText($verticalPath, (ConvertTo-Json -InputObject $vertical -Depth 30), $utf8NoBom)

Write-Output "Merged profiles $($Profiles.Keys -join ', ') ($Variant encoders), collection stream-light-scenes, the Aitum Vertical settings (backtrack to $ReelDir) and the Stream Health dock."
