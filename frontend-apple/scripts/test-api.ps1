$ErrorActionPreference = 'Stop'
$env:VITE_USE_MOCK = 'false'
$env:VITE_API_BASE = ''
npx playwright test e2e/api.spec.ts
exit $LASTEXITCODE
