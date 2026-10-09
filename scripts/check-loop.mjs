import assert from "node:assert/strict";
import {
  columnFiles,
  fileLocation,
  fileAtSlot,
  records,
} from "../src/data.ts";
import {
  fileAtCell,
  selectionCell,
  visibleCell,
  cellKey,
  LOOP_COLUMNS,
  LOOP_ROWS,
  wrap,
} from "../src/archive-loop.ts";

let checks = 0;
// Every document owns exactly one array slot: a shared slot would hide one file
// behind another and make the loop unreachable for it.
const slots = new Set();
for (const index of records.keys()) {
  const location = fileLocation(index);
  assert.equal(fileAtSlot(location.slot), index, "Slot lookup returns its own file");
  assert.ok(location.row >= 0 && location.row < 32);
  assert.ok(!slots.has(location.slot), `Slot ${location.slot} is claimed twice`);
  slots.add(location.slot);
}
assert.equal(slots.size, records.length);
for (const direction of [-1, 1]) {
  let cell = { lane: 2, row: 12 };
  let index = fileAtCell(cell);
  const memory = Array.from({ length: 5 }, (_, lane) => columnFiles(lane)[0]);
  for (let step = 0; step < 10000; step++) {
    const axis = step % 17 < 10 ? "row" : "lane";
    const lane = fileLocation(index).lane;
    if (axis === "row") {
      const files = columnFiles(lane);
      index = files[wrap(files.indexOf(index) + direction, files.length)];
    } else index = memory[wrap(lane + direction, 5)];
    const next = selectionCell(index, cell, { axis, direction });
    assert.equal(
      next[axis] - cell[axis],
      direction,
      "Crossing a seam must move exactly one cell in the requested direction",
    );
    assert.equal(
      fileAtCell(next),
      index,
      "Selected physical cell must contain the requested document",
    );
    memory[fileLocation(index).lane] = index;
    cell = next;
    checks++;
  }
}
for (const center of [
  { lane: 2, row: 12 },
  { lane: -8.3, row: -19.2 },
  { lane: 10002.49, row: -32001.49 },
]) {
  const cells = Array.from({ length: LOOP_COLUMNS * LOOP_ROWS }, (_, i) =>
    visibleCell(i, center),
  );
  assert.equal(new Set(cells.map(cellKey)).size, LOOP_COLUMNS * LOOP_ROWS);
  const lanes = [...new Set(cells.map((c) => c.lane))].sort((a, b) => a - b);
  const rows = [...new Set(cells.map((c) => c.row))].sort((a, b) => a - b);
  assert.equal(lanes.length, LOOP_COLUMNS);
  assert.equal(rows.length, LOOP_ROWS);
  assert.equal(lanes.at(-1) - lanes[0], LOOP_COLUMNS - 1);
  assert.equal(rows.at(-1) - rows[0], LOOP_ROWS - 1);
  assert.ok(lanes[0] < center.lane - 3 && lanes.at(-1) > center.lane + 3);
  assert.ok(rows[0] < center.row - 14 && rows.at(-1) > center.row + 14);
}
console.log(
  JSON.stringify(
    {
      directionalMoves: checks,
      poolSize: LOOP_COLUMNS * LOOP_ROWS,
      checks: "passed",
    },
    null,
    2,
  ),
);
