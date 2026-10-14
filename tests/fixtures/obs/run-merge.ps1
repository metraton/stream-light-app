<#
Runs the ObsMerge.psm1 merges on the fixtures beside this file and the repo templates, and prints the results as
one JSON object for tests\test_obs_merge.mjs. Writes only under a scratch directory it removes.
#>
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).ProviderPath
Import-Module (Join-Path $repo 'obs\ObsMerge.psm1') -Force

function Read-Files {
    param([string]$Dir)
    $files = @{}
    foreach ($item in Get-ChildItem -LiteralPath $Dir -File) { $files[$item.Name] = [IO.File]::ReadAllText($item.FullName) }
    return $files
}

$variantDir = Join-Path $repo 'obs\profile\encoders\nvidia'
$common = @{
    ProfileName    = 'stream-light-hq'
    Bitrate        = 8000
    TemplateLines  = [IO.File]::ReadAllLines((Join-Path $repo 'obs\profile\stream-light\basic.ini'))
    Overrides      = Read-IniSections ([IO.File]::ReadAllLines((Join-Path $variantDir 'basic-overrides.ini')))
    StreamEncoder  = [IO.File]::ReadAllText((Join-Path $variantDir 'streamEncoder.json')) | ConvertFrom-Json
    RecordEncoder  = [IO.File]::ReadAllText((Join-Path $variantDir 'recordEncoder.json')) | ConvertFrom-Json
    ServiceExample = [IO.File]::ReadAllText((Join-Path $repo 'obs\profile\stream-light\service.example.json'))
}
$installed = Read-Files (Join-Path $PSScriptRoot 'installed')

$result = [ordered]@{
    existing = Merge-ProfileFiles @common -Existing $installed -Donor $null
    fresh    = Merge-ProfileFiles @common -Existing @{} -Donor $installed
    blank    = Merge-ProfileFiles @common -Existing @{} -Donor $null
    scenes   = Merge-SceneCollection ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'installed-scenes.json')) | ConvertFrom-Json) `
    ([IO.File]::ReadAllText((Join-Path $repo 'obs\scenes\stream-light-scenes.json')) | ConvertFrom-Json)
}

# The real installer, run twice on a copy of the laptop-shaped settings folder in a scratch directory that is
# removed afterwards; each snapshot maps relative path -> text.
function Get-Snapshot {
    param([string]$Dir)
    $files = [ordered]@{}
    foreach ($item in Get-ChildItem -LiteralPath $Dir -File -Recurse) {
        $files[$item.FullName.Substring($Dir.Length + 1).Replace('\', '/')] = [IO.File]::ReadAllText($item.FullName)
    }
    return $files
}
$scratch = Join-Path ([IO.Path]::GetTempPath()) "obs-install-test-$([guid]::NewGuid())"
try {
    $obsDir = Join-Path $scratch 'obs-studio'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'laptop') -Destination $obsDir -Recurse
    $install = Join-Path $repo 'obs\install.ps1'
    & $install -Variant intel -ObsDir $obsDir -ReelDir (Join-Path $scratch 'reel') | Out-Null
    $result['installed'] = Get-Snapshot $obsDir
    # A layout arranged in OBS between two installs must survive the second one.
    $profileIni = Join-Path $obsDir 'basic\profiles\streamlight\basic.ini'
    $rearranged = Set-IniValues ([IO.File]::ReadAllLines($profileIni)) 'YouTube - RTMP' ([ordered]@{ DockState = 'FAKE-REARRANGED' })
    [IO.File]::WriteAllLines($profileIni, $rearranged)
    & $install -Variant intel -ObsDir $obsDir -ReelDir (Join-Path $scratch 'reel') | Out-Null
    $result['reinstalled'] = Get-Snapshot $obsDir
}
finally {
    Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
ConvertTo-Json -InputObject $result -Depth 50 -Compress
