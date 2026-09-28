# Cree uniquement hover-token-distance.zip a la racine, sans creer de dossier.
# Lancer : powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\package.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = Split-Path -Parent $PSScriptRoot
$archivePath = Join-Path $projectRoot 'hover-token-distance.zip'

# Inclure uniquement les fichiers distribues : aucun outil, test ou fichier IDE.
$files = @('module.json', 'README.md', 'changelog.md', 'LICENSE')
foreach ($folder in @('scripts', 'styles')) {
    $extension = if ($folder -eq 'scripts') { '.mjs' } else { '.css' }
    $files += Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -Recurse -File |
        Where-Object { $_.Extension -eq $extension } |
        ForEach-Object { $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/') }
}

$temporaryArchive = Join-Path $projectRoot ('.package-' + [guid]::NewGuid().ToString('N') + '.tmp')
try {
    # Le fichier temporaire preserve l'ancienne archive si la creation echoue.
    $archive = [System.IO.Compression.ZipFile]::Open($temporaryArchive, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($entry in $files) {
            # Chemins avec / pour Linux ; module.json reste a la racine du ZIP.
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive, (Join-Path $projectRoot $entry), $entry,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } finally {
        $archive.Dispose()
    }
    Move-Item -LiteralPath $temporaryArchive -Destination $archivePath -Force
} finally {
    if (Test-Path -LiteralPath $temporaryArchive) {
        Remove-Item -LiteralPath $temporaryArchive -Force
    }
}

Write-Host "Archive creee : $archivePath"
