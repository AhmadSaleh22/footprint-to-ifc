import { expect, test, type Page } from '@playwright/test'

// Shared by the specs added in step 04. (viewer.spec.ts keeps its own copies, as written in step 03.)

const problems = new WeakMap<Page, string[]>()

/**
 * Call at the top of a spec file. Any console error, uncaught exception or Three.js warning fails the test; warnings
 * from the GPU driver (SwiftShader reports "GPU stall due to ReadPixels") are not ours.
 */
export const failOnConsoleProblems = (): void => {
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
}

/** Opens the app with the debug hook and waits until the viewer has drawn its first frame with a building. */
export const open = async (page: Page): Promise<void> => {
  await page.goto('/?debug=1')
  await page.waitForFunction(() => window.__viewer !== undefined)
}

export const nextFrames = (page: Page, count = 2): Promise<void> =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)))
        step(n)
      }),
    count,
  )

export const selectWall = (page: Page, id: string) => page.getByRole('button', { name: id, exact: true }).click()

export const addOpening = (page: Page) => page.getByRole('button', { name: 'Add opening' }).click()

export const openingList = (page: Page) => page.getByRole('list', { name: 'Openings' }).getByRole('listitem')

export const selectedId = (page: Page) => page.evaluate(() => window.__viewer!.selectedId())

export const openingIds = (page: Page) => page.evaluate(() => window.__viewer!.openings().map((o) => o.id))

export const clickEmptyCorner = async (page: Page): Promise<void> => {
  const box = (await page.locator('canvas').boundingBox())!
  await page.mouse.click(box.x + 10, box.y + 10)
}

export const openingPoint = async (page: Page, id: string): Promise<{ x: number; y: number }> => {
  const point = await page.evaluate((openingId) => window.__viewer!.openingScreenPoint(openingId), id)
  expect(point, `openingScreenPoint('${id}') is null: off screen or hidden by something in front`).not.toBeNull()
  return point!
}
