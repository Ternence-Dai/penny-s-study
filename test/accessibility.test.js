import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../assets/css/readability-accessibility-v10.css", import.meta.url), "utf8");

test("coarse pointer controls meet the enhanced touch target size", () => {
  assert.ok(css.includes("@media (pointer: coarse)"));
  assert.ok(css.includes("min-height: 44px"));
  assert.ok(css.includes("min-inline-size: 44px"));
});

test("forced-colors mode preserves native control borders and keyboard focus", () => {
  assert.ok(css.includes("@media (forced-colors: active)"));
  assert.ok(css.includes("border-color: ButtonText"));
  assert.ok(css.includes("outline: 3px solid Highlight"));
});
