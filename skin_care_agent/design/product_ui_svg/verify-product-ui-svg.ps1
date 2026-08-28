$ErrorActionPreference = 'Stop'

$designDir = $PSScriptRoot
$failures = [System.Collections.Generic.List[string]]::new()

function Unicode-Text([int[]]$codePoints) {
  return -join ($codePoints | ForEach-Object { [char]$_ })
}

function Read-Svg([string]$name) {
  $path = Join-Path $designDir $name
  if (-not (Test-Path -LiteralPath $path)) {
    $failures.Add("Missing file: $name")
    return $null
  }
  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  try { [xml]$xml = $raw } catch {
    $failures.Add("Invalid SVG XML: $name")
    return $null
  }
  return [PSCustomObject]@{ Raw = $raw; Xml = $xml; Path = $path }
}

function Require([bool]$condition, [string]$message) {
  if (-not $condition) { $failures.Add($message) }
}

$recordUse = Unicode-Text @(0x8BB0,0x5F55,0x4E00,0x6B21,0x4F7F,0x7528)
$commonFirst = Unicode-Text @(0x5E38,0x7528,0x4F18,0x5148)
$sortByUse = Unicode-Text @(0x6309,0x4F7F,0x7528,0x9891,0x6B21,0x6392,0x5217)
$swipeLeft = Unicode-Text @(0x5DE6,0x6ED1)
$swipeRight = Unicode-Text @(0x53F3,0x6ED1)
$manualTitle = Unicode-Text @(0x5B98,0x65B9,0x8BF4,0x660E,0x4E66)
$indicationText = Unicode-Text @(0x9002,0x5E94,0x75C7,0x539F,0x6587)
$sourceText = Unicode-Text @(0x8D44,0x6599,0x6765,0x6E90)
$standardCatalog = Unicode-Text @(0x6807,0x51C6,0x4EA7,0x54C1,0x76EE,0x5F55)
$manualAdd = Unicode-Text @(0x624B,0x52A8,0x6DFB,0x52A0)
$liveMatch = Unicode-Text @(0x5B9E,0x65F6,0x5339,0x914D)
$createCustom = Unicode-Text @(0x521B,0x5EFA,0x81EA,0x5B9A,0x4E49,0x4EA7,0x54C1)
$noMatch = Unicode-Text @(0x6CA1,0x6709,0x627E,0x5230,0x5339,0x914D,0x4EA7,0x54C1)
$iris = Unicode-Text @(0x9E22,0x5C3E,0x7D2B)
$lavender = Unicode-Text @(0x85B0,0x8863,0x8349)

$list = Read-Svg '01-product-list.svg'
if ($list) {
  Require (-not $list.Raw.Contains($recordUse)) 'Product list still exposes record-use action'
  Require (-not $list.Raw.Contains($commonFirst)) 'Product list still contains duplicate common-first label'
  Require ($list.Raw.Contains($sortByUse)) 'Product list is missing its single sort explanation'
}

$swipe = Read-Svg '02-swipe-archive.svg'
if ($swipe) {
  Require ($swipe.Raw.Contains($swipeLeft)) 'Archive state does not describe a left swipe'
  Require (-not $swipe.Raw.Contains($swipeRight)) 'Archive state still describes a right swipe'
  $action = $swipe.Xml.SelectSingleNode("//*[@id='archive-action']")
  $card = $swipe.Xml.SelectSingleNode("//*[@id='swiped-card']")
  Require ($null -ne $action) 'Archive state is missing archive-action'
  Require ($null -ne $card) 'Archive state is missing swiped-card'
  if ($action -and $card) {
    Require ([double]$action.x -gt [double]$card.x) 'Archive action is not on the right of the swiped card'
  }
}

$detail = Read-Svg '03-product-detail.svg'
if ($detail) {
  Require (-not $detail.Raw.Contains($recordUse)) 'Product detail still exposes record-use action'
  Require ($detail.Raw.Contains($manualTitle)) 'Product detail does not directly show the official manual'
  Require ($detail.Raw.Contains($indicationText)) 'Product detail is missing original indication text'
  Require ($detail.Raw.Contains($sourceText)) 'Product detail is missing document source'
  $usageSummary = $detail.Xml.SelectSingleNode("//*[@id='usage-summary']")
  Require ($null -ne $usageSummary) 'Product detail is missing compact usage summary'
  if ($usageSummary) {
    Require ([double]$usageSummary.height -le 52) 'Usage summary is taller than 52 units'
  }
}

$search = Read-Svg '04-add-product.svg'
if ($search) {
  Require (-not $search.Raw.Contains($standardCatalog)) 'Add screen still has standard-catalog switch'
  Require (-not $search.Raw.Contains($manualAdd)) 'Add screen still has manual-add switch'
  Require ($search.Raw.Contains($liveMatch)) 'Add screen does not communicate live matching'
  Require (-not $search.Raw.Contains($createCustom)) 'Matched state incorrectly shows custom-product action'
}

$empty = Read-Svg '05-add-product-no-match.svg'
if ($empty) {
  Require ($empty.Raw.Contains($noMatch)) 'No-match state is missing its explanation'
  Require ($empty.Raw.Contains($createCustom)) 'No-match state is missing custom-product action'
}

foreach ($name in @('00-product-ui-overview.svg','01-product-list.svg','02-swipe-archive.svg','03-product-detail.svg','04-add-product.svg','05-add-product-no-match.svg')) {
  $svg = Read-Svg $name
  if (-not $svg) { continue }
  foreach ($legacy in @('#8F85CE','#6F63B7','#F2EFF8',$iris,$lavender)) {
    Require (-not $svg.Raw.Contains($legacy)) "$name contains legacy theme value"
  }
  foreach ($match in [regex]::Matches($svg.Raw, 'href="([^"]+)"')) {
    $target = Join-Path (Split-Path -Parent $svg.Path) $match.Groups[1].Value
    Require (Test-Path -LiteralPath $target) "$name has a broken reference"
  }
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Output "FAIL: $_" }
  exit 1
}

Write-Output 'PASS: product UI SVG structure, interaction, theme, and references are valid.'
