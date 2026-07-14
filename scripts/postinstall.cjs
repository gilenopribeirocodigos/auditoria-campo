const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const patchPackage = path.join(__dirname, '..', 'node_modules', 'patch-package', 'index.js')
const serviceOverride = path.join(
  __dirname,
  '..',
  'android',
  'plugin-overrides',
  'background-geolocation',
  'com',
  'equimaps',
  'capacitor_background_geolocation',
  'BackgroundGeolocationService.java',
)
const serviceTarget = path.join(
  __dirname,
  '..',
  'node_modules',
  '@capacitor-community',
  'background-geolocation',
  'android',
  'src',
  'main',
  'java',
  'com',
  'equimaps',
  'capacitor_background_geolocation',
  'BackgroundGeolocationService.java',
)

function aplicarOverrideAndroid() {
  if (!fs.existsSync(serviceOverride) || !fs.existsSync(serviceTarget)) return
  fs.copyFileSync(serviceOverride, serviceTarget)
  console.log('BackgroundGeolocationService.java corrigido aplicado ao plugin Android')
}

const result = spawnSync(process.execPath, [patchPackage], {
  stdio: 'inherit',
  shell: false,
})

if (result.status === 0) {
  aplicarOverrideAndroid()
  process.exit(0)
}

if (process.env.GITHUB_ACTIONS) {
  process.exit(result.status || 1)
}

console.warn(
  'patch-package falhou fora do build Android (GitHub Actions) - seguindo sem aplicar, nao afeta o build web',
)
process.exit(0)
