const fs = require("node:fs");
const assert = require("node:assert/strict");
const css = fs.readFileSync("assets/css/readability-accessibility-v10.css", "utf8");
assert.ok(css.includes("@media (pointer: coarse)"));
assert.ok(css.includes("min-height: 44px"));
assert.ok(css.includes("@media (forced-colors: active)"));
assert.ok(css.includes("outline: 3px solid Highlight"));
