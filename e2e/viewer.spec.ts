import { expect, test, type Page } from '@playwright/test'

// Any console error, uncaught exception or Three.js warning fails the test, so misuse of the library cannot go
// unnoticed. Warnings from the GPU driver (SwiftShader reports "GPU stall due to ReadPixels") are not ours.
const problems = new WeakMap<Page, string[]>()

test.beforeEach(({ page }) => {
  const seen: string[] = []
  problems.set(page, seen)
  page.on('console', (message) => {
    const ours = message.type() === 'error' || (message.type() === 'warning' && message.text().includes('THREE.'))
    if (ours) seen.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => seen.push(`pageerror: ${error.message}`))
})

test.afterEach(({ page }) => {
  expect(problems.get(page)).toEqual([])
})

/** Opens the app with the debug hook and waits until the viewer has drawn its first frame with a building. */
const open = async (page: Page): Promise<void> => {
  await page.goto('/?debug=1')
  await page.waitForFunction(() => window.__viewer !== undefined)
}

const nextFrames = (page: Page, count = 2): Promise<void> =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)))
        step(n)
      }),
    count,
  )

const screenPoint = async (page: Page, id: string): Promise<{ x: number; y: number }> => {
  const point = await page.evaluate((wallId) => window.__viewer!.screenPoint(wallId), id)
  expect(point, `screenPoint('${id}') is null: the wall's outer face is hidden or off screen`).not.toBeNull()
  return point!
}

const walls = (page: Page) => page.getByRole('list', { name: 'Walls' }).getByRole('button')

test('9. the app loads, the canvas is visible and the wall list has 7 buttons', async ({ page }) => {
  await open(page)
  await expect(page.locator('canvas')).toBeVisible()
  await expect(walls(page)).toHaveCount(7)
})

test('without ?debug=1 window.__viewer is never set', async ({ page }) => {
  await page.goto('/')
  await expect(walls(page)).toHaveCount(7)
  await nextFrames(page, 5)
  expect(await page.evaluate(() => window.__viewer)).toBeUndefined()
})

test('10. clicking wall-5 selects it, highlights it and shows its details', async ({ page }) => {
  await open(page)
  const { x, y } = await screenPoint(page, 'wall-5')
  await page.mouse.click(x, y)
  expect(await page.evaluate(() => window.__viewer!.selectedId())).toBe('wall-5')
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-5'))).toBe('#e07a2f')
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-2'))).toBe('#d9d4c7')
  const details = page.getByTestId('wall-details')
  await expect(details).toContainText('wall-5')
  // wall-5 is the long west wall of the fixture; its length comes from the building in the store
  await expect(details).toContainText(/length\s*\d+\.\d\d m/)
})

test('11. clicking the top-left corner of the canvas clears the selection', async ({ page }) => {
  await open(page)
  const { x, y } = await screenPoint(page, 'wall-5')
  await page.mouse.click(x, y)
  expect(await page.evaluate(() => window.__viewer!.selectedId())).toBe('wall-5')
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(box.x + 10, box.y + 10)
  expect(await page.evaluate(() => window.__viewer!.selectedId())).toBeNull()
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-5'))).toBe('#d9d4c7')
})

test('12. a 50 px drag from wall-5 rotates the view and leaves the selection unchanged', async ({ page }) => {
  await open(page)
  const { x, y } = await screenPoint(page, 'wall-5')
  await page.mouse.click(x, y)
  const before = await page.evaluate(() => window.__viewer!.cameraPosition())
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 50, y, { steps: 10 })
  await page.mouse.up()
  await nextFrames(page)
  const after = await page.evaluate(() => window.__viewer!.cameraPosition())
  expect(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])).toBeGreaterThan(0.01)
  expect(await page.evaluate(() => window.__viewer!.selectedId())).toBe('wall-5')
})

test('12. a drag with nothing selected does not select anything', async ({ page }) => {
  await open(page)
  const { x, y } = await screenPoint(page, 'wall-5')
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 50, y, { steps: 10 })
  await page.mouse.up()
  expect(await page.evaluate(() => window.__viewer!.selectedId())).toBeNull()
})

test('13. Tab to the wall-2 button and Enter selects wall-2', async ({ page }) => {
  await open(page)
  await page.getByLabel('Thickness').focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toHaveText('wall-2')
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => window.__viewer!.selectedId())).toBe('wall-2')
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-2'))).toBe('#e07a2f')
  await expect(page.getByTestId('wall-details')).toContainText('wall-2')
})

test('14. thickness 10 shows the alert and an empty wall list; 0.3 brings the 7 walls back', async ({ page }) => {
  await open(page)
  const input = page.getByLabel('Thickness')
  await input.fill('10')
  await expect(page.getByRole('alert')).toHaveText('thickness-too-large')
  await expect(walls(page)).toHaveCount(0)
  await input.fill('0.3')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(walls(page)).toHaveCount(7)
})

test('an empty thickness input is ignored: the model stays', async ({ page }) => {
  await open(page)
  await page.getByLabel('Thickness').fill('')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(walls(page)).toHaveCount(7)
})

test('15. changing the thickness 50 times leaves the geometry count where the first build left it', async ({ page }) => {
  await open(page)
  await nextFrames(page)
  const first = await page.evaluate(() => window.__viewer!.geometries())
  expect(first).toBeGreaterThan(0)
  const input = page.getByLabel('Thickness')
  for (let i = 0; i < 50; i++) {
    await input.fill((0.2 + (i % 5) * 0.05).toFixed(2))
    await nextFrames(page)
  }
  expect(await page.evaluate(() => window.__viewer!.geometries())).toBe(first)
})

test('the selection and its highlight survive a thickness change', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'wall-2' }).click()
  await page.getByLabel('Thickness').fill('0.25')
  await expect(page.getByTestId('wall-details')).toContainText('0.25 m')
  await nextFrames(page)
  expect(await page.evaluate(() => window.__viewer!.selectedId())).toBe('wall-2')
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-2'))).toBe('#e07a2f')
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-3'))).toBe('#d9d4c7')
})

test('a thickness error clears the selection and the highlight does not come back with the model', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'wall-2' }).click()
  const input = page.getByLabel('Thickness')
  await input.fill('10')
  await expect(page.getByRole('alert')).toHaveText('thickness-too-large')
  await expect(page.getByTestId('wall-details')).toHaveCount(0)
  await input.fill('0.3')
  await expect(walls(page)).toHaveCount(7)
  await nextFrames(page)
  expect(await page.evaluate(() => window.__viewer!.selectedId())).toBeNull()
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-2'))).toBe('#d9d4c7')
})
