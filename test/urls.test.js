import assert from "node:assert/strict";
import { extractUrls } from "../src/urls.js";

assert.deepEqual(extractUrls("Read https://example.com/path."), ["https://example.com/path"], "trailing punctuation is removed");
assert.deepEqual(extractUrls("Visit www.example.com now"), ["https://www.example.com"], "www links gain HTTPS");
assert.deepEqual(extractUrls("(https://one.test/a), https://two.test/b!"), ["https://one.test/a", "https://two.test/b"], "multiple wrapped links work");
assert.deepEqual(extractUrls("Same https://example.com https://example.com"), ["https://example.com"], "duplicate links are removed");
assert.deepEqual(extractUrls("No links here"), [], "ordinary text has no URLs");

console.log("PASS: 5 URL extraction checks passed.");
