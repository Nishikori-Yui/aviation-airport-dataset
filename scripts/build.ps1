param(
  [string]$Version = "",
  [string]$Out = "data/airports.json",
  [string]$Overpass = ""
)

if (-not $Version) {
  $Version = (Get-Date).ToString("yyyy-MM-dd")
}

$env:DATASET_VERSION = $Version
if ($Overpass) {
  $env:OVERPASS_URL = $Overpass
}

node scripts/fetch-overpass.cjs --out $Out --version $Version
