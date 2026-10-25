$ErrorActionPreference = 'Stop'
$env:VITE_USE_MOCK = 'true'
$env:PLAYWRIGHT_PORT = '5181'
$env:PLAYWRIGHT_ISOLATED = '1'
npx playwright test screenshots.spec.ts
exit $LASTEXITCODE
