// Takes the screenshot for the README: the app at 1280 x 800 with wall-5 (the long west wall) selected.
//
//   pnpm exec tsx scripts/screenshot-viewer.ts [--out docs/viewer.png]
//
// Run from the repo root. It starts its own Vite dev server on port 5176, opens /?debug=1, clicks the outer face of
// wall-5 through the test hook, waits two frames and saves the page. Software WebGL (SwiftShader), like the e2e tests.
// Not type-checked by `pnpm typecheck` (only src/ is) and not covered by tests.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const outIndex = args.indexOf('--out')
const out = outIndex >= 0 && args[outIndex + 1] !== undefined ? args[outIndex + 1]! : 'docs/viewer.png'
const port = 5176

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`http://localhost:${port}/?debug=1`)
  await page.waitForFunction(() => window.__viewer !== undefined)
  const point = await page.evaluate(() => window.__viewer!.screenPoint('wall-5'))
  if (point === null) throw new Error("screenPoint('wall-5') is null: its outer face is hidden or off screen")
  await page.mouse.click(point.x, point.y)
  const selected = await page.evaluate(() => window.__viewer!.selectedId())
  if (selected !== 'wall-5') throw new Error(`expected wall-5 to be selected, got ${String(selected)}`)
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
  mkdirSync(dirname(out), { recursive: true })
  await page.screenshot({ path: out })
  console.log(`wrote ${out} (1280 x 800, wall-5 selected)`)
} finally {
  await browser.close()
  await server.close()
}
