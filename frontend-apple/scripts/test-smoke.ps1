$ErrorActionPreference = 'Stop'
$env:VITE_USE_MOCK = 'true'
$env:PLAYWRIGHT_PORT = '5180'
$env:PLAYWRIGHT_ISOLATED = '1'
npx playwright test e2e/smoke.spec.ts e2e/flows.spec.ts
exit $LASTEXITCODE
