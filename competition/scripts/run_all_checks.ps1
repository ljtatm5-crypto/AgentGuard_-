$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location (Join-Path $repo 'backend')
try { uv sync --all-groups; uv run pytest } finally { Pop-Location }
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { $node = 'D:\CTF\node.exe' } else { $node = $node.Source }
& $node (Join-Path $repo 'competition/scripts/validate_dataset.mjs')
Push-Location (Join-Path $repo 'frontend-apple')
try { npm run typecheck; npm run lint; npm run build; npm run check:mock; npm run check:trace; npm run test:smoke; npm run test:api } finally { Pop-Location }
Write-Host 'All local checks completed.'
