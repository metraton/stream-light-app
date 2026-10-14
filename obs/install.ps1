<#
.SYNOPSIS
Installs the stream-light and stream-light-hq OBS profiles, the stream-light-scenes collection, the Aitum
Vertical settings and the Stream Health dock for this Windows user, merging into what is already installed.

.DESCRIPTION
Refuses while OBS is running and backs up the OBS settings folder first. Every write is a merge (rules in
ObsMerge.psm1): the script sets only the keys and objects it owns -- video, encoders and their bitrates, audio
sample rate and track bitrate, reconnect and dynamic bitrate, Replay Buffer on, Browser Source hardware
acceleration off, the Stream Health dock, the dock layout when the repo layout changed, the repo's sources in the
collection and the Aitum Vertical canvas and stream encoder -- and leaves everything else as OBS or the user wrote
it: the YouTube sign-in, service.json, [Panels] CookieId, the Instagram server and key, Replay Buffer length and
size, hotkeys, file paths and user-added sources.
Profiles and the collection are found by the name inside them, not by folder or file name, which OBS chooses.
A profile this run creates takes the sign-in ([Auth], [YouTube], [YouTube - *], service.json and a copy of the
browser cookie jar the YouTube docks use) of an installed stream-light profile that is signed in; it is copied
between installed profiles only, never into the repo.

.PARAMETER ReelDir
Folder where Aitum Vertical saves the backtrack clips; created when missing.

.PARAMETER ObsDir
The OBS settings folder; tests point it at a copy.
#>
[CmdletBinding()]
param(
    [ValidateSet('nvidia', 'intel')]
    [string]$Variant,
    [string]$ReelDir = (Join-Path $env:USERPROFILE 'Videos\reel-raw'),
    [string]$ObsDir = (Join-Path $env:APPDATA 'obs-studio')
)

# Profile name -> YouTube video bitrate (kbps). stream-light is the standard; stream-light-hq is for a good link.
$Profiles = [ordered]@{ 'stream-light' = 4500; 'stream-light-hq' = 8000 }
$CollectionName = 'stream-light-scenes'

$ErrorActionPreference = 'Stop'

# The v value must equal BUILD in monitor/index.html: OBS serves a stale cached index.html otherwise.
$StreamHealthUrl = 'http://localhost:8080/monitor/?v=2026-10-14.1'

Import-Module (Join-Path $PSScriptRoot 'ObsMerge.psm1') -Force

$repo = Split-Path -Parent $PSScriptRoot
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

if (Test-Path -LiteralPath $ObsDir) {
    $backup = "$ObsDir.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
    Copy-Item -LiteralPath $ObsDir -Destination $backup -Recurse
    Write-Output "Backup: $backup"
}

$commonDir = Join-Path $repo 'obs\profile\stream-light'
$variantDir = Join-Path $repo "obs\profile\encoders\$Variant"
$templateLines = [IO.File]::ReadAllLines((Join-Path $commonDir 'basic.ini'))
$repoDockState = Get-IniValue $templateLines 'YouTube - RTMP' 'DockState'
if (-not $repoDockState) { throw 'DockState not found in the repo profile.' }
$overrides = Read-IniSections ([IO.File]::ReadAllLines((Join-Path $variantDir 'basic-overrides.ini')))
$streamEncoder = Read-Json (Join-Path $variantDir 'streamEncoder.json')
$recordEncoder = Read-Json (Join-Path $variantDir 'recordEncoder.json')
$serviceExample = [IO.File]::ReadAllText((Join-Path $commonDir 'service.example.json'))

$userIniPath = Join-Path $ObsDir 'user.ini'
$userIni = if (Test-Path -LiteralPath $userIniPath) { [IO.File]::ReadAllLines($userIniPath) } else { @() }

$profilesDir = Join-Path $ObsDir 'basic\profiles'
New-Item -ItemType Directory -Force -Path $profilesDir | Out-Null
$installed = [ordered]@{}
foreach ($dir in Get-ChildItem -LiteralPath $profilesDir -Directory) { $installed[$dir.Name] = Read-ProfileFiles $dir.FullName }
$activeDir = Get-IniValue $userIni 'Basic' 'ProfileDir'
$donor = Select-SignInDonor $installed @($Profiles.Keys) $activeDir
$cookiesDir = Join-Path $ObsDir 'plugin_config\obs-browser\obs_profile_cookies'
$donorCookieId = if ($donor) { Get-IniValue ($donor['basic.ini'] -split "`r?`n") 'Panels' 'CookieId' } else { $null }

$profileDirs = [ordered]@{}
foreach ($profileName in $Profiles.Keys) {
    $dirName = Find-ProfileDir $installed $profileName $activeDir
    if (-not $dirName) { $dirName = $profileName }
    $profileDirs[$profileName] = $dirName
    $profileDir = Join-Path $profilesDir $dirName
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
    $existing = Read-ProfileFiles $profileDir
    $cookieId = $null
    if (-not $existing.ContainsKey('basic.ini') -and $donorCookieId) {
        $cookieId = '{0:X16}' -f [BitConverter]::ToUInt64([guid]::NewGuid().ToByteArray(), 0)
        $donorJar = Join-Path $cookiesDir $donorCookieId
        if (Test-Path -LiteralPath $donorJar) { Copy-Item -LiteralPath $donorJar -Destination (Join-Path $cookiesDir $cookieId) -Recurse }
    }
    $files = Merge-ProfileFiles -ProfileName $profileName -Bitrate $Profiles[$profileName] -Existing $existing `
        -TemplateLines $templateLines -Overrides $overrides -StreamEncoder $streamEncoder -RecordEncoder $recordEncoder `
        -ServiceExample $serviceExample -Donor $donor -DockState $repoDockState -CookieId $cookieId
    foreach ($name in $files.Keys) {
        [IO.File]::WriteAllText((Join-Path $profileDir $name), $files[$name], $utf8NoBom)
    }
    $installed[$dirName] = Read-ProfileFiles $profileDir
    if (-not $existing.ContainsKey('basic.ini') -and $donor) {
        Write-Output "Copied the YouTube sign-in into the new profile $profileName."
    }
}

$activeName = $Profiles.Keys | Where-Object { $profileDirs[$_] -eq $activeDir } | Select-Object -First 1
if (-not $activeName) { $activeName = 'stream-light' }
$activeLines = $installed[$profileDirs[$activeName]]['basic.ini'] -split "`r?`n"

$scenesDir = Join-Path $ObsDir 'basic\scenes'
New-Item -ItemType Directory -Force -Path $scenesDir | Out-Null
$collections = @{}
foreach ($file in Get-ChildItem -LiteralPath $scenesDir -Filter '*.json' -File) {
    $collections[$file.Name] = (Read-Json $file.FullName).name
}
$collectionFile = Find-SceneCollectionFile $collections $CollectionName (Get-IniValue $userIni 'Basic' 'SceneCollectionFile')
if (-not $collectionFile) { $collectionFile = "$CollectionName.json" }
$scenesPath = Join-Path $scenesDir $collectionFile
$installedScenes = if (Test-Path -LiteralPath $scenesPath) { Read-Json $scenesPath } else { $null }
$scenes = Merge-SceneCollection $installedScenes (Read-Json (Join-Path $repo "obs\scenes\$CollectionName.json"))
[IO.File]::WriteAllText($scenesPath, (ConvertTo-Json -InputObject $scenes -Depth 50), $utf8NoBom)

$userIni = Merge-UserIni -Lines $userIni -StreamHealthUrl $StreamHealthUrl -ProfileName $activeName `
    -ProfileDir $profileDirs[$activeName] -CollectionName $CollectionName -CollectionFile $collectionFile `
    -DockState (Get-ProfileDockState $activeLines)
[IO.File]::WriteAllLines($userIniPath, $userIni, $utf8NoBom)

$globalIniPath = Join-Path $ObsDir 'global.ini'
$globalIni = if (Test-Path -LiteralPath $globalIniPath) { [IO.File]::ReadAllLines($globalIniPath) } else { @() }
$globalIni = Set-IniValues $globalIni 'General' ([ordered]@{ BrowserHWAccel = 'false' })
[IO.File]::WriteAllLines($globalIniPath, $globalIni, $utf8NoBom)

$verticalRepo = Join-Path $repo 'obs\vertical'
$verticalPath = Join-Path $ObsDir 'plugin_config\vertical-canvas\config.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $verticalPath), $ReelDir | Out-Null
$existingVertical = if (Test-Path -LiteralPath $verticalPath) { Read-Json $verticalPath } else { $null }
$vertical = Merge-VerticalConfig $existingVertical (Read-Json (Join-Path $verticalRepo 'canvas.json')) `
    (Read-Json (Join-Path $verticalRepo "encoders\$Variant.json")) $ReelDir
[IO.File]::WriteAllText($verticalPath, (ConvertTo-Json -InputObject $vertical -Depth 30), $utf8NoBom)

Write-Output "Merged profiles $($Profiles.Keys -join ', ') ($Variant encoders, active $activeName in $($profileDirs[$activeName])), collection $CollectionName ($collectionFile), the Aitum Vertical settings (backtrack to $ReelDir) and the Stream Health dock."
