import assert from "node:assert/strict";
import { parseAssessment } from "../src/groq.js";

assert.deepEqual(parseAssessment('{"is_suspicious":true,"category":"phishing","confidence":0.9,"reason":"A lookalike domain is asking for a login."}'), { is_suspicious: true, category: "phishing", confidence: 0.9, reason: "A lookalike domain is asking for a login." });
assert.equal(parseAssessment('{"is_suspicious":true,"category":"unknown","confidence":4,"reason":"x"}').is_suspicious, false, "unknown categories fail closed");
console.log("PASS: 2 Groq structured-output parsing checks passed.");
