<#
Merge rules for obs\install.ps1, kept free of disk and OBS state so tests\test_obs_merge.mjs can run them on fixtures.
The installer owns only the keys and objects named here; every other key, section, file and source in the
user's OBS setup passes through unchanged.
#>

# The basic.ini keys the installer owns, taken from the repo template. The variant's basic-overrides.ini keys and
# [General] Name are owned too. Replay Buffer length and size, file paths, hotkeys, [Panels] and the sign-in
# sections are deliberately absent: OBS or the user writes them.
$ManagedProfileKeys = [ordered]@{
    Output = @('Mode', 'Reconnect', 'RetryDelay', 'MaxRetries', 'DynamicBitrate')
    AdvOut = @('ApplyServiceSettings', 'TrackIndex', 'RecType', 'RecFormat2', 'RecTracks', 'AudioEncoder',
        'RecAudioEncoder', 'RecRB')
    Video  = @('BaseCX', 'BaseCY', 'OutputCX', 'OutputCY', 'FPSType', 'FPSCommon', 'FPSInt', 'FPSNum', 'FPSDen',
        'ScaleType', 'ColorFormat', 'ColorSpace', 'ColorRange')
    Audio  = @('SampleRate', 'ChannelSetup')
}

function Test-AuthSection {
    <# True for the basic.ini sections OBS writes the account sign-in and its dock layout into. #>
    param([string]$Section)
    return $Section -eq 'Auth' -or $Section -eq 'YouTube' -or $Section.StartsWith('YouTube - ')
}

function Set-IniValues {
    <# Returns the ini lines with each key of Values set in Section, adding the key or the section when absent. #>
    param([string[]]$Lines, [string]$Section, [System.Collections.IDictionary]$Values)
    $pending = [ordered]@{}
    foreach ($key in $Values.Keys) { $pending[$key] = $Values[$key] }
    $out = [System.Collections.Generic.List[string]]::new()
    $inSection = $false
    foreach ($line in $Lines) {
        if ($line -match '^\[(.+)\]\s*$') {
            $nextSection = $Matches[1]
            if ($inSection) {
                foreach ($key in $pending.Keys) { $out.Add("$key=$($pending[$key])") }
                $pending.Clear()
            }
            $inSection = $nextSection -eq $Section
        }
        elseif ($inSection -and $line -match '^([^=]+)=' -and $pending.Contains($Matches[1])) {
            $key = $Matches[1]
            $out.Add("$key=$($pending[$key])")
            $pending.Remove($key)
            continue
        }
        $out.Add($line)
    }
    if ($pending.Count -gt 0) {
        if (-not $inSection) { $out.Add("[$Section]") }
        foreach ($key in $pending.Keys) { $out.Add("$key=$($pending[$key])") }
    }
    return , $out.ToArray()
}

function Get-IniValue {
    <# Returns the value of Key in Section, or $null when either is absent. #>
    param([string[]]$Lines, [string]$Section, [string]$Key)
    $inSection = $false
    foreach ($line in $Lines) {
        if ($line -match '^\[(.+)\]\s*$') { $inSection = $Matches[1] -eq $Section }
        elseif ($inSection -and $line.StartsWith("$Key=")) { return $line.Substring($Key.Length + 1) }
    }
    return $null
}

function Read-IniSections {
    <# Returns section name -> ordered key/value map of the ini lines. #>
    param([string[]]$Lines)
    $sections = [ordered]@{}
    $current = $null
    foreach ($line in $Lines) {
        if ($line -match '^\[(.+)\]\s*$') { $current = $Matches[1]; $sections[$current] = [ordered]@{} }
        elseif ($current -and $line -match '^([^=]+)=(.*)$') { $sections[$current][$Matches[1]] = $Matches[2] }
    }
    return $sections
}

function Split-IniSections {
    <# Returns the lines before the first section, then section name -> its header and body lines, in file order. #>
    param([string[]]$Lines)
    $preamble = [System.Collections.Generic.List[string]]::new()
    $sections = [ordered]@{}
    $current = $preamble
    foreach ($line in $Lines) {
        if ($line -match '^\[(.+)\]\s*$') {
            $current = [System.Collections.Generic.List[string]]::new()
            $sections[$Matches[1]] = $current
        }
        $current.Add($line)
    }
    return [pscustomobject]@{ Preamble = $preamble; Sections = $sections }
}

function Get-ManagedProfileValues {
    <# Returns section -> key -> value for the owned keys: the template's values, then the variant overrides. #>
    param([string[]]$TemplateLines, [System.Collections.IDictionary]$Overrides, [string]$ProfileName)
    $template = Read-IniSections $TemplateLines
    $managed = [ordered]@{ General = [ordered]@{ Name = $ProfileName } }
    foreach ($section in $ManagedProfileKeys.Keys) {
        $managed[$section] = [ordered]@{}
        foreach ($key in $ManagedProfileKeys[$section]) {
            if (-not ($template.Contains($section) -and $template[$section].Contains($key))) {
                throw "The repo basic.ini lacks the managed key [$section] $key."
            }
            $managed[$section][$key] = $template[$section][$key]
        }
    }
    foreach ($section in $Overrides.Keys) {
        if (-not $managed.Contains($section)) { $managed[$section] = [ordered]@{} }
        foreach ($key in $Overrides[$section].Keys) { $managed[$section][$key] = $Overrides[$section][$key] }
    }
    return $managed
}

function Merge-ProfileIni {
    <#
    Returns the profile basic.ini with the managed values set. An existing file keeps every other line. A new
    profile starts from the template, with the donor's sign-in sections in place of the template's.
    #>
    param([string[]]$Existing, [string[]]$TemplateLines, [System.Collections.IDictionary]$Managed, [string[]]$DonorLines)
    if ($Existing) {
        $lines = $Existing
    }
    else {
        $lines = $TemplateLines
        if ($DonorLines) {
            $template = Split-IniSections $TemplateLines
            $donor = Split-IniSections $DonorLines
            $out = [System.Collections.Generic.List[string]]::new()
            $out.AddRange($template.Preamble)
            foreach ($name in $template.Sections.Keys) {
                if (-not (Test-AuthSection $name)) { $out.AddRange($template.Sections[$name]) }
            }
            foreach ($name in $donor.Sections.Keys) {
                if (Test-AuthSection $name) {
                    if ($out.Count -gt 0 -and $out[$out.Count - 1] -ne '') { $out.Add('') }
                    $out.AddRange($donor.Sections[$name])
                }
            }
            $lines = $out.ToArray()
        }
    }
    foreach ($section in $Managed.Keys) {
        $lines = Set-IniValues $lines $section $Managed[$section]
    }
    return , $lines
}

function Merge-JsonProperties {
    <# Returns Existing (or an empty object) with every top-level property of Managed set, others kept. #>
    param([psobject]$Existing, [psobject]$Managed)
    $target = if ($Existing) { $Existing } else { [pscustomobject]@{} }
    foreach ($property in $Managed.PSObject.Properties) {
        $target | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value -Force
    }
    return $target
}

function Merge-ProfileFiles {
    <#
    Returns file name -> new text for one profile directory; a file absent from the result is left as it is.
    Existing and Donor map file name -> current text (Donor is another signed-in stream-light profile, used only
    when this profile has no basic.ini yet). service.json is never rewritten: it is created from the donor or
    the example only when missing.
    #>
    param(
        [string]$ProfileName,
        [int]$Bitrate,
        [hashtable]$Existing,
        [string[]]$TemplateLines,
        [System.Collections.IDictionary]$Overrides,
        [psobject]$StreamEncoder,
        [psobject]$RecordEncoder,
        [string]$ServiceExample,
        [hashtable]$Donor
    )
    $isNew = -not $Existing.ContainsKey('basic.ini')
    $donorIni = if ($isNew -and $Donor -and $Donor.ContainsKey('basic.ini')) { $Donor['basic.ini'] -split "`r?`n" } else { $null }
    $existingIni = if ($isNew) { $null } else { $Existing['basic.ini'] -split "`r?`n" }
    $templateWithOverrides = $TemplateLines
    foreach ($section in $Overrides.Keys) {
        $templateWithOverrides = Set-IniValues $templateWithOverrides $section $Overrides[$section]
    }
    $managed = Get-ManagedProfileValues $TemplateLines $Overrides $ProfileName
    $files = [ordered]@{}
    $files['basic.ini'] = ((Merge-ProfileIni $existingIni $templateWithOverrides $managed $donorIni) -join "`r`n").TrimEnd() + "`r`n"

    $stream = [pscustomobject]@{}
    foreach ($property in $StreamEncoder.PSObject.Properties) { $stream | Add-Member $property.Name $property.Value }
    $stream | Add-Member -NotePropertyName bitrate -NotePropertyValue $Bitrate -Force
    foreach ($pair in @(@('streamEncoder.json', $stream), @('recordEncoder.json', $RecordEncoder))) {
        $current = if ($Existing.ContainsKey($pair[0])) { $Existing[$pair[0]] | ConvertFrom-Json } else { $null }
        $files[$pair[0]] = ConvertTo-Json -InputObject (Merge-JsonProperties $current $pair[1]) -Compress
    }

    if (-not $Existing.ContainsKey('service.json')) {
        $files['service.json'] = if ($isNew -and $Donor -and $Donor.ContainsKey('service.json')) { $Donor['service.json'] } else { $ServiceExample }
    }
    return $files
}

function Merge-SceneCollection {
    <#
    Returns the installed scene collection with the repo's sources merged in by uuid, then by name. A repo
    source replaces its installed match but keeps the installed hotkeys; a repo scene also keeps the items the
    user added to it. Sources, scenes, canvases and top-level settings the repo does not have are kept.
    #>
    param([psobject]$Existing, [psobject]$Repo)
    if (-not $Existing) { return $Repo }
    $sources = [System.Collections.Generic.List[object]]::new()
    foreach ($source in @($Existing.sources | Where-Object { $_ })) { $sources.Add($source) }
    foreach ($repoSource in @($Repo.sources)) {
        $index = -1
        for ($i = 0; $i -lt $sources.Count; $i++) {
            if ($repoSource.uuid -and $sources[$i].uuid -eq $repoSource.uuid) { $index = $i; break }
        }
        if ($index -lt 0) {
            for ($i = 0; $i -lt $sources.Count; $i++) {
                if ($sources[$i].name -eq $repoSource.name) { $index = $i; break }
            }
        }
        if ($index -lt 0) { $sources.Add($repoSource); continue }
        $installed = $sources[$index]
        if ($installed.PSObject.Properties['hotkeys']) {
            $repoSource | Add-Member -NotePropertyName hotkeys -NotePropertyValue $installed.hotkeys -Force
        }
        if ($repoSource.id -eq 'scene' -and $installed.settings.items) {
            $repoItems = @($repoSource.settings.items)
            $userItems = @($installed.settings.items | Where-Object {
                    $item = $_
                    -not ($repoItems | Where-Object { $_.source_uuid -eq $item.source_uuid -or $_.name -eq $item.name })
                })
            $repoSource.settings | Add-Member -NotePropertyName items -NotePropertyValue @($repoItems + $userItems) -Force
        }
        $sources[$index] = $repoSource
    }

    $merged = $Existing
    foreach ($property in $Repo.PSObject.Properties) {
        if (-not $merged.PSObject.Properties[$property.Name]) {
            $merged | Add-Member -NotePropertyName $property.Name -NotePropertyValue $property.Value
        }
    }
    $merged | Add-Member -NotePropertyName name -NotePropertyValue $Repo.name -Force
    $merged | Add-Member -NotePropertyName sources -NotePropertyValue $sources.ToArray() -Force
    foreach ($listName in @('scene_order', 'canvases')) {
        $list = @($Existing.$listName | Where-Object { $_ })
        foreach ($entry in @($Repo.$listName | Where-Object { $_ })) {
            $present = $list | Where-Object { ($entry.uuid -and $_.uuid -eq $entry.uuid) -or $_.name -eq $entry.name }
            if (-not $present) { $list += $entry }
        }
        $merged | Add-Member -NotePropertyName $listName -NotePropertyValue $list -Force
    }
    return $merged
}

Export-ModuleMember -Function Set-IniValues, Get-IniValue, Read-IniSections, Test-AuthSection, Merge-ProfileFiles,
    Merge-ProfileIni, Merge-JsonProperties, Merge-SceneCollection, Get-ManagedProfileValues
