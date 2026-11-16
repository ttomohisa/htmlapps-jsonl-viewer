# Create the same release assets in PR CI and after merge; never publishes or pushes.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$version = [string]((Get-Content -Raw -Encoding UTF8 (Join-Path $root 'app.config.json') | ConvertFrom-Json).version)
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Expected a stable SemVer version: $version" }
$tag = "v$version"
$prefix = "htmlapps-jsonl-viewer-$tag"
$output = Join-Path $root 'release-assets'
$bundle = Join-Path ([System.IO.Path]::GetTempPath()) ("jsonl-release-" + [Guid]::NewGuid().ToString('N'))

$standalone = @(
  @{ Source='dist/index.html'; Name="$prefix.html" },
  @{ Source='dist/index.self-extract.html'; Name="$prefix.self-extract.html" }
)
$metadata = @('README.md','README.ja.md','LICENSE','THIRD_PARTY_NOTICES.md')
$generated = @('index.html','index.self-extract.html','dependency-manifest.json','self-extract-manifest.json')
$required = @($metadata) + @($generated | ForEach-Object { "dist/$_" })
foreach ($file in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)) {
    throw "Missing release file: $file"
  }
}

$pattern = "(?ms)^## v$([regex]::Escape($version))[^\r\n]*\r?\n(?<notes>.*?)(?=^## |\z)"
$changelog = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'CHANGELOG.md')
$match = [regex]::Match($changelog,$pattern)
if (-not $match.Success -or -not $match.Groups['notes'].Value.Trim()) {
  throw "Missing CHANGELOG notes for $tag."
}

try {
  if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force -Recurse }
  New-Item -ItemType Directory -Force -Path $output | Out-Null
  New-Item -ItemType Directory -Force -Path $bundle | Out-Null
  foreach ($item in $standalone) {
    Copy-Item -LiteralPath (Join-Path $root $item.Source) -Destination (Join-Path $output $item.Name)
  }
  foreach ($item in $metadata) {
    Copy-Item -LiteralPath (Join-Path $root $item) -Destination (Join-Path $bundle $item)
  }
  foreach ($item in $generated) {
    Copy-Item -LiteralPath (Join-Path $root "dist/$item") -Destination (Join-Path $bundle $item)
  }
  $zip = Join-Path $output "$prefix.zip"
  Compress-Archive -Path (Join-Path $bundle '*') -DestinationPath $zip -CompressionLevel Optimal -Force

  $names = @("$prefix.html","$prefix.self-extract.html","$prefix.zip")
  $sums = foreach ($name in $names) {
    $file = Join-Path $output $name
    $sum = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
    "$sum  $name"
  }
  [System.IO.File]::WriteAllLines((Join-Path $output 'SHA256SUMS.txt'),[string[]]$sums,[System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText((Join-Path $output 'RELEASE_NOTES.md'),$match.Groups['notes'].Value.Trim(),[System.Text.UTF8Encoding]::new($false))
  Write-Host "[OK] Prepared and verified $tag release package (no publishing)." -ForegroundColor Green
}
finally {
  if (Test-Path -LiteralPath $bundle) { Remove-Item -LiteralPath $bundle -Force -Recurse }
}
