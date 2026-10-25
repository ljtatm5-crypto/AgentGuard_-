$ErrorActionPreference = 'Stop'
$env:VITE_USE_MOCK = 'false'
$env:VITE_API_BASE = ''
$env:PLAYWRIGHT_PORT = '5177'
$env:PLAYWRIGHT_ISOLATED = '1'
npx playwright test e2e/api.spec.ts
exit $LASTEXITCODE
