<#
Runs the ObsMerge.psm1 merges on the fixtures beside this file and the repo templates, and prints the results as
one JSON object for tests\test_obs_merge.mjs. Reads only; writes nothing.
#>
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
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
ConvertTo-Json -InputObject $result -Depth 50 -Compress
