import { loadPlaywright } from "./playwright.mjs";
import { launchChromium, seedPreferences } from "./browser-launch.mjs";
import assert from "node:assert/strict";
import { COLUMN_SPACING } from "../src/archive-loop.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium);
const output = resolve(".tools/array-input");
await mkdir(output, { recursive: true });
const report = [];
const stats = (page) => page.evaluate(() => window.rhine.stats());
const settle = (page) => page.waitForTimeout(2200);
// Plane travel is speed limited, so a gesture needs a moment before the array
// reaches the projected pointer destination.
const projected = (page) =>
  page.waitForFunction(
    () => {
      const s = window.rhine.stats();
      return (
        s.dragTarget !== null &&
        Math.abs(s.columnCamera - s.dragTarget.lane) < 0.05 &&
        Math.abs(s.rail - s.dragTarget.row) < 0.05
      );
    },
    null,
    { timeout: 8000 },
  );
try {
  for (const mobile of [false, true].filter(
    (mobile) =>
      !process.env.REVIEW_CASES ||
      process.env.REVIEW_CASES === (mobile ? "mobile" : "desktop"),
  )) {
    const width = mobile ? 390 : 1920,
      height = mobile ? 844 : 1080;
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: mobile,
      isMobile: mobile,
    });
    // Enter the archive without the audio entry gate, motion stays on.
    await seedPreferences(context, { sound: false, music: false });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `${process.env.REVIEW_URL || "http://127.0.0.1:5204"}/?scene=archive`,
    );
    await page.waitForFunction(
      () => window.rhine?.stats().ready && !document.querySelector("#loading"),
      null,
      { timeout: 60000 },
    );
    await page.waitForFunction(
      () => window.rhine.stats().extraction >= 0.399,
      null,
      { timeout: 60000 },
    );
    await settle(page);
    const start = await stats(page);
    const x = width * 0.55,
      y = height * 0.3;
    const laneStep = Math.max(100, Math.min(280, width * 0.24));
    const rowStep = Math.max(72, Math.min(150, height * 0.14));
    const cdp = mobile ? await context.newCDPSession(page) : null;
    let origin, projection, inspecting, pointer;
    const downRaw = async (x, y) =>
      mobile
        ? cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x, y, id: 1 }],
          })
        : (await page.mouse.move(x, y), page.mouse.down());
    const moveRaw = async (x, y) =>
      mobile
        ? cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y, id: 1 }],
          })
        : page.mouse.move(x, y);
    const down = async (px, py) => {
      await downRaw(px, py);
      const state = await stats(page);
      origin = { x: px, y: py };
      pointer = origin;
      projection = state.dragProjection;
      inspecting = state.canInspect;
    };
    // Existing behavioral cases use logical column/file distances; project them.
    const move = async (px, py) => {
      if (inspecting) return moveRaw(px, py);
      const lane = (origin.x - px) / laneStep,
        row = (origin.y - py) / rowStep;
      pointer = {
        x: origin.x + lane * projection.lane.x + row * projection.row.x,
        y: origin.y + lane * projection.lane.y + row * projection.row.y,
      };
      await moveRaw(pointer.x, pointer.y);
      // Let the scene consume the move before the next wait inspects the target,
      // otherwise a still-unprocessed gesture looks already projected.
      await page.waitForTimeout(80);
    };
    const up = async () =>
      mobile
        ? cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          })
        : page.mouse.up();
    await down(x, y);
    await move(x - laneStep * 0.3, y + 2);
    await projected(page);
    const partial = await stats(page);
    assert.ok(partial.dragTarget);
    assert.equal(partial.selectedCell.lane, start.selectedCell.lane);
    assert.ok(
      partial.columnCamera > start.columnCamera + COLUMN_SPACING * 0.2,
      "Array follows before selecting the next cell",
    );
    await move(x - laneStep * 0.8, y + 3);
    await projected(page);
    assert.equal(
      (await stats(page)).selectedCell.lane,
      start.selectedCell.lane + 1,
      "Selection changes before release",
    );
    await page.screenshot({
      path: resolve(output, `${mobile ? "touch" : "mouse"}-drag.png`),
    });
    await up();
    await settle(page);
    const lane = await stats(page);
    assert.equal(lane.selectedCell.lane, start.selectedCell.lane + 1);
    assert.equal(lane.dragTarget, null);
    // The released array rests exactly on the column grid.
    assert.ok(
      Math.abs(lane.columnCamera / COLUMN_SPACING - Math.round(lane.columnCamera / COLUMN_SPACING)) < 0.01,
      "A settled drag snaps onto a column",
    );
    await down(x, y);
    await move(x + 2, y - rowStep * 0.8);
    await projected(page);
    assert.equal(
      (await stats(page)).selectedCell.row,
      lane.selectedCell.row + 1,
    );
    await move(x + 4, y + rowStep * 0.8);
    await projected(page);
    const reverse = await stats(page);
    assert.equal(reverse.selectedCell.lane, lane.selectedCell.lane);
    assert.equal(
      reverse.selectedCell.row,
      lane.selectedCell.row - 1,
      "Reversing mid-drag switches to previous file",
    );
    await up();
    await settle(page);
    if (!mobile) {
      // Find a visible cover using actual scene hit-testing, then hold the pointer still.
      let hit = false;
      for (const point of [
        [960, 450],
        [800, 440],
        [1100, 400],
        [600, 500],
        [1300, 400],
      ]) {
        await page.mouse.move(...point);
        await page.waitForTimeout(50);
        if ((await stats(page)).hoverCell) {
          hit = true;
          break;
        }
      }
      assert.ok(hit, "A visible card can be hovered");
      await page.waitForTimeout(450);
      const hovered = await stats(page);
      assert.ok(
        Object.values(hovered.hoverLifts).some((v) => v > 0),
        "Hover raises the card",
      );
      assert.equal(
        hovered.extraction,
        start.extraction,
        "Hover does not change extraction or camera progress",
      );
      await page.screenshot({ path: resolve(output, "mouse-hover.png") });
      await page.mouse.down();
      await page.mouse.up();
      assert.deepEqual(
        (await stats(page)).selectedCell,
        hovered.hoverCell,
        "Click still selects the hovered physical cell",
      );
      // The array loops without end, so the corner still hits a card: what
      // matters is that exactly one card is lifted and it is the hovered one.
      await page.mouse.move(5, 5);
      await page.waitForTimeout(700);
      const moved = await stats(page);
      assert.ok(moved.hoverCell, "A looping array still hit-tests at the corner");
      assert.notDeepEqual(moved.hoverCell, hovered.hoverCell, "Moving the pointer moves the hover");
      assert.equal(Object.keys(moved.hoverLifts).length, 1, "Only the hovered card is lifted");
      assert.ok(moved.hoverLifts[`${moved.hoverCell.lane}:${moved.hoverCell.row}`] > 0, "The lifted card is the hovered one");
      await page.mouse.move(x, y);
      const beforeWheel = await stats(page);
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(100);
      assert.ok(
        (await stats(page)).selectedCell.row > beforeWheel.selectedCell.row,
        "Wheel advances through the files",
      );
      await page.mouse.wheel(0, -100);
      await settle(page);
      assert.equal(
        (await stats(page)).selectedCell.row,
        beforeWheel.selectedCell.row,
      );
      await page.locator('[data-action="settings"]').click();
      await page.waitForTimeout(350);
      const modal = await stats(page);
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(200);
      assert.deepEqual(
        (await stats(page)).selectedCell,
        modal.selectedCell,
        "Modal blocks array wheel navigation",
      );
      await page.locator('[data-action="close-modal"]').click();
      await page.waitForFunction(
        () => !document.querySelector(".modal-backdrop"),
      );
    }
    // Run across a complete row cycle, checking physical direction at the seam.
    const loop = await stats(page);
    for (let i = 0; i < 8; i++)
      await page.locator('[data-action="next"]').click();
    assert.equal((await stats(page)).selected, loop.selected);
    assert.equal(
      (await stats(page)).selectedCell.row,
      loop.selectedCell.row + 8,
    );
    await settle(page);
    const interrupted = await stats(page);
    await down(x, y);
    await move(x - laneStep * 0.3, y);
    await page.waitForTimeout(100);
    if (mobile) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { ...pointer, id: 1 },
          { x: x + 30, y: y + 30, id: 2 },
        ],
      });
    } else {
      // The browser cancels the pointer capture the drag was using.
      await page.evaluate(() =>
        document
          .querySelector("#three-scene canvas")
          .dispatchEvent(
            new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }),
          ),
      );
    }
    await up();
    await settle(page);
    assert.equal(
      (await stats(page)).dragTarget,
      null,
      "Interrupted drag clears capture state",
    );
    assert.deepEqual(
      (await stats(page)).selectedCell,
      interrupted.selectedCell,
      "Interrupted partial drag does not select",
    );
    // A subsequent gesture must work after cancellation / multi-touch.
    await down(x, y);
    await move(x, y - rowStep * 0.8);
    await projected(page);
    await up();
    await settle(page);
    assert.equal(
      (await stats(page)).selectedCell.row,
      interrupted.selectedCell.row + 1,
    );
    await page.locator(".read-file").click();
    await page.waitForFunction(() => window.rhine.stats().canInspect, null, {
      timeout: 30000,
    });
    const detail = await stats(page);
    await down(x, y);
    await move(x + 60, y + 5);
    await up();
    await page.waitForTimeout(500);
    assert.deepEqual(
      (await stats(page)).selectedCell,
      detail.selectedCell,
      "Detail drag only rotates",
    );
    assert.ok((await stats(page)).rotation > 0.05);
    assert.deepEqual(errors, []);
    report.push({
      mobile,
      start: start.selectedCell,
      after: reverse.selectedCell,
      checks: "passed",
    });
    console.log(`${mobile ? "Touch" : "Mouse"} input passed`);
    await context.close();
  }
} finally {
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
