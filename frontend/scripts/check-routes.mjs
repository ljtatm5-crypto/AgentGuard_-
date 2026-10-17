import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const routerSource = readFileSync(join(root, 'src/router/index.ts'), 'utf8')
const required = ['/overview', '/agents', '/test-suites', '/runs', '/runs/:id', '/findings', '/reports', '/settings']

for (const route of required) {
  if (!routerSource.includes(`'${route}'`)) throw new Error(`缺少必需路由: ${route}`)
}

const imports = [...routerSource.matchAll(/import\('\.\.\/views\/([^']+)'\)/g)].map((match) => match[1])
for (const view of imports) {
  if (!existsSync(join(root, 'src/views', view))) throw new Error(`路由组件不存在: ${view}`)
}

console.log(`路由检查通过：${required.length} 条核心路由，${imports.length} 个页面组件。`)
