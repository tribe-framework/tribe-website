# Archive - Metadata Generator (Windows / PowerShell port)
# Usage: .\metadata.ps1 [C:\path\to\disk]
# Output: archive-metadata.csv written inside the disk root
#
# READ-ONLY: This script only reads and indexes files.
# It never renames, modifies, moves, or deletes anything.

param(
    [string]$DiskRoot = (Split-Path $PSScriptRoot -Parent)
)

$DiskRoot = $DiskRoot.TrimEnd('\', '/')

if (-not (Test-Path -LiteralPath $DiskRoot -PathType Container)) {
    Write-Host "Error: '$DiskRoot' is not a directory."
    exit 1
}

$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$Out = Join-Path $PSScriptRoot "metadata-archive-$Timestamp.csv"

# ──────────────────────────────────────────────
# TRIBE SYSTEM FOLDERS TO SKIP
# ──────────────────────────────────────────────
$SkipDirs = @(
    "xs", "sm", "md", "lg", "xl",
    "hls",
    "tribe-cache",
    "tribe-temp",
    "metadata-generator",
    "tmp",
    ".git",
    "__MACOSX",
    "node_modules"
)

function Test-InSkippedDir {
    param([string]$RelDir)
    if ([string]::IsNullOrEmpty($RelDir)) { return $false }
    $parts = $RelDir -split '[\\/]'
    foreach ($p in $parts) {
        if ($SkipDirs -contains $p) { return $true }
    }
    return $false
}

function Find-YearInPath {
    param([string]$RelPath, [string]$ScriptDir)

    $parts = $RelPath -split '[\\/]'
    foreach ($part in $parts) {
        if ($part -match '^\d{4}$') {
            $y = [int]$part
            if ($y -ge 1900 -and $y -le 2100) { return $part }
        }
    }

    # Check script's own ancestry: current -> parent -> grandparent
    $checkDir = $ScriptDir
    for ($i = 0; $i -lt 3; $i++) {
        $segment = Split-Path $checkDir -Leaf
        if ($segment -match '^\d{4}$') {
            $y = [int]$segment
            if ($y -ge 1900 -and $y -le 2100) { return $segment }
        }
        $parent = Split-Path $checkDir -Parent
        if ([string]::IsNullOrEmpty($parent) -or $parent -eq $checkDir) { break }
        $checkDir = $parent
    }

    return ""
}

function Format-CsvField {
    param([string]$Val)
    if ($null -eq $Val) { $Val = "" }
    if ($Val -match '[,"]') {
        $Val = $Val -replace '"', '""'
        return "`"$Val`""
    }
    return $Val
}

# ──────────────────────────────────────────────
# WRITE HEADER
# ──────────────────────────────────────────────
"filename,filepath,year,format,size_mb,date_modified,category" | Out-File -FilePath $Out -Encoding utf8

$total = 0
$rows = New-Object System.Collections.Generic.List[string]

# ──────────────────────────────────────────────
# ENUMERATE FILES
# ──────────────────────────────────────────────
$allFiles = Get-ChildItem -LiteralPath $DiskRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
    Sort-Object -Property FullName

foreach ($file in $allFiles) {
    $filename = $file.Name

    # Skip the output CSV itself
    if ($filename -like "metadata-archive-*.csv") { continue }
    # Skip hidden/dotfiles and macOS junk just in case
    if ($filename -eq ".DS_Store") { continue }
    if ($filename.StartsWith("._")) { continue }
    if ($filename.StartsWith(".")) { continue }
    # Skip this script itself if colocated
    if ($filename -eq "metadata.ps1" -or $filename -eq "metadata.bat") { continue }

    $relPath = $file.FullName.Substring($DiskRoot.Length).TrimStart('\', '/')
    $relDir  = Split-Path $relPath -Parent
    if ($null -eq $relDir) { $relDir = "" }

    # Skip if any path segment matches a system folder to prune
    if (Test-InSkippedDir -RelDir $relDir) { continue }
    if ($SkipDirs -contains $filename) { continue }

    # Extension (lowercased)
    $ext = $file.Extension
    if ([string]::IsNullOrEmpty($ext)) {
        $extLower = "(none)"
    } else {
        $extLower = $ext.TrimStart('.').ToLower()
    }

    # Size in MB
    $sizeMb = "{0:N2}" -f ($file.Length / 1MB)

    # Date modified
    $dateMod = $file.LastWriteTime.ToString("yyyy-MM-dd")

    # Year from path or script ancestry
    $year = Find-YearInPath -RelPath $relPath -ScriptDir $PSScriptRoot

    # Category: top-level directory under disk root
    $category = ""
    if (-not [string]::IsNullOrEmpty($relDir)) {
        $segments = $relDir -split '[\\/]'
        $category = $segments[0]
        if ($category -match '^\d{4}$' -and $segments.Length -gt 1) {
            $category = $segments[1]
        }
    }

    $row = "{0},{1},{2},{3},{4},{5},{6}" -f `
        (Format-CsvField $filename), `
        (Format-CsvField $relDir), `
        $year, `
        $extLower, `
        $sizeMb, `
        $dateMod, `
        (Format-CsvField $category)

    $rows.Add($row)
    $total++
}

$rows | Out-File -FilePath $Out -Append -Encoding utf8

Write-Host "Done. $total file(s) indexed -> $Out"
