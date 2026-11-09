$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$outputDir = Join-Path $repo 'competition/dist'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$zip = Join-Path $outputDir 'AI智能体测试挑战赛-AgentGuard智测盾.zip'
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Push-Location $repo
try {
  git archive --format=zip --output="$zip" HEAD
  if (-not (Test-Path -LiteralPath $zip)) { throw 'ZIP 未生成' }
  $sizeMb = (Get-Item -LiteralPath $zip).Length / 1MB
  if ($sizeMb -gt 200) { throw ('ZIP 超过 200MB：{0:N2}MB' -f $sizeMb) }
  Write-Host ('ZIP: {0}' -f $zip)
  Write-Host ('SIZE: {0:N2} MB' -f $sizeMb)
} finally {
  Pop-Location
}
