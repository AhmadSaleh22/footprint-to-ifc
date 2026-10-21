import { expect, test } from '@playwright/test'
import {
  addOpening,
  clickEmptyCorner,
  failOnConsoleProblems,
  nextFrames,
  open,
  openingIds,
  openingList,
  openingPoint,
  selectWall,
  selectedId,
} from './helpers'

failOnConsoleProblems()

test('12. adding an opening with the defaults to wall-5 lists it, and its centre can be clicked through', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-5')
  await addOpening(page)
  await expect(openingList(page)).toHaveCount(1)
  expect(await openingIds(page)).toEqual(['opening-1'])
  await nextFrames(page)

  const point = await openingPoint(page, 'opening-1')
  await clickEmptyCorner(page)
  expect(await selectedId(page)).toBeNull()
  await page.mouse.click(point.x, point.y)
  // the click goes through the hole to the far wall, or hits nothing: it never selects wall-5
  expect(await selectedId(page)).not.toBe('wall-5')
})

test('13. Undo with the button removes the opening so the same point selects wall-5; Redo with the keyboard brings it back', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-5')
  await addOpening(page)
  await nextFrames(page)
  const point = await openingPoint(page, 'opening-1')

  await page.getByRole('button', { name: 'Undo' }).click()
  expect(await openingIds(page)).toEqual([])
  await clickEmptyCorner(page)
  expect(await selectedId(page)).toBeNull()
  await nextFrames(page)
  await page.mouse.click(point.x, point.y)
  expect(await selectedId(page)).toBe('wall-5')

  await page.keyboard.press('ControlOrMeta+Shift+Z')
  expect(await openingIds(page)).toEqual(['opening-1'])
  await nextFrames(page)
  await openingPoint(page, 'opening-1')
})

test('keyboard undo works with Ctrl/Cmd+Z outside a text field and is ignored inside one', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-5')
  await addOpening(page)
  await page.getByLabel('Thickness').focus()
  await page.keyboard.press('ControlOrMeta+Z')
  expect(await openingIds(page)).toEqual(['opening-1'])
  await page.getByRole('button', { name: 'wall-5' }).focus()
  await page.keyboard.press('ControlOrMeta+Z')
  expect(await openingIds(page)).toEqual([])
})

test('14. an opening that does not fit shows outside-wall in the alert and changes nothing', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-5')
  await page.getByLabel('Width').fill('50')
  await addOpening(page)
  await expect(page.getByRole('alert')).toHaveText('outside-wall')
  expect(await openingIds(page)).toEqual([])
  await expect(openingList(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
})

test('an overlapping second opening shows overlaps-opening, and selecting a wall clears the alert', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-5')
  await addOpening(page)
  await addOpening(page)
  await expect(page.getByRole('alert')).toHaveText('overlaps-opening')
  expect(await openingIds(page)).toEqual(['opening-1'])
  await selectWall(page, 'wall-4')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('15. adding an opening and undoing it keep wall-5 highlighted', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-5')
  await nextFrames(page)
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-5'))).toBe('#e07a2f')
  await addOpening(page)
  await nextFrames(page)
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-5'))).toBe('#e07a2f')
  await page.getByRole('button', { name: 'Undo' }).click()
  await nextFrames(page)
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-5'))).toBe('#e07a2f')
  expect(await page.evaluate(() => window.__viewer!.colorOf('wall-4'))).toBe('#d9d4c7')
})

test('16. 50 cycles of add and undo leave the geometry count where it was before the first add', async ({ page }) => {
  test.setTimeout(120_000) // 100 rebuilds, each followed by two frames, on software WebGL
  await open(page)
  await selectWall(page, 'wall-5')
  await nextFrames(page)
  const before = await page.evaluate(() => window.__viewer!.geometries())
  for (let i = 0; i < 50; i++) {
    await addOpening(page)
    await nextFrames(page)
    await page.getByRole('button', { name: 'Undo' }).click()
    await nextFrames(page)
  }
  expect(await openingIds(page)).toEqual([])
  expect(await page.evaluate(() => window.__viewer!.geometries())).toBe(before)
})

test('the details show the net face area, and Remove then Undo restores the opening', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-5')
  const details = page.getByTestId('wall-details')
  await expect(details).toContainText('575.18 m²')
  await addOpening(page)
  await expect(details).toContainText(/netFaceArea\s*573\.50 m²/)
  await page.getByRole('button', { name: 'Remove opening-1' }).click()
  await expect(openingList(page)).toHaveCount(0)
  await expect(details).toContainText(/netFaceArea\s*575\.18 m²/)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(openingList(page)).toHaveCount(1)
})

test('a thickness the opening does not fit is refused: the alert shows openings-conflict and the input shows the old value', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-5')
  await page.getByLabel('Offset').fill('0.5')
  await page.getByLabel('Width').fill('1')
  await addOpening(page)
  await expect(openingList(page)).toHaveCount(1)
  const thickness = page.getByLabel('Thickness')
  await thickness.fill('1')
  await expect(page.getByRole('alert')).toHaveText('openings-conflict')
  await expect(thickness).toHaveValue('0.3')
  await expect(page.getByRole('list', { name: 'Walls' }).getByRole('button')).toHaveCount(7)
  expect(await openingIds(page)).toEqual(['opening-1'])
  // a thickness that fits is accepted and keeps the opening; the history is cleared
  await thickness.fill('0.2')
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await openingIds(page)).toEqual(['opening-1'])
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
})

test('a building error stays when the empty canvas is clicked, because the model is still missing', async ({ page }) => {
  await open(page)
  await page.getByLabel('Thickness').fill('10')
  await expect(page.getByRole('alert')).toHaveText('thickness-too-large')
  await clickEmptyCorner(page)
  await expect(page.getByRole('alert')).toHaveText('thickness-too-large')
  await page.getByLabel('Thickness').fill('0.3')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('decimals can be typed into the thickness input', async ({ page }) => {
  await open(page)
  const thickness = page.getByLabel('Thickness')
  await thickness.fill('')
  await thickness.pressSequentially('0.25')
  await expect(thickness).toHaveValue('0.25')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('openingScreenPoint is null for an opening hidden behind another wall and set for a visible one', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-2') // an east wall: seen from the south-west its outer face is behind wall-5
  await addOpening(page)
  await expect(openingList(page)).toHaveCount(1)
  await nextFrames(page)
  expect(await page.evaluate(() => window.__viewer!.openingScreenPoint('opening-1'))).toBeNull()
  await selectWall(page, 'wall-5')
  await addOpening(page)
  await nextFrames(page)
  await openingPoint(page, 'opening-2')
})

test('openingScreenPoint stays set for a high window whose view ray ends on the far wall seen through the hole', async ({ page }) => {
  await open(page)
  await selectWall(page, 'wall-5')
  await page.getByLabel('Sill').fill('6')
  await page.getByLabel('Height').fill('3')
  await addOpening(page)
  await expect(openingList(page)).toHaveCount(1)
  await nextFrames(page)
  const point = await openingPoint(page, 'opening-1')
  // through the hole the click lands on the inside of another wall, so wall-5 is not selected
  await page.mouse.click(point.x, point.y)
  expect(await selectedId(page)).not.toBe('wall-5')
})
