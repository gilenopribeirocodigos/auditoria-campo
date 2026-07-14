const { spawnSync } = require('node:child_process')
const path = require('node:path')

const patchPackage = path.join(__dirname, '..', 'node_modules', 'patch-package', 'index.js')
const result = spawnSync(process.execPath, [patchPackage], {
  stdio: 'inherit',
  shell: false,
})

if (result.status === 0) {
  process.exit(0)
}

if (process.env.GITHUB_ACTIONS) {
  process.exit(result.status || 1)
}

console.warn(
  'patch-package falhou fora do build Android (GitHub Actions) - seguindo sem aplicar, nao afeta o build web',
)
process.exit(0)
