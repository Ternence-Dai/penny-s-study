import test from "node:test";
import assert from "node:assert/strict";
import { gradeAnswer, nextReviewDate } from "../src/domain/index.js";
test("grades normalized answers while preserving evidence status",()=>{
 const result=gradeAnswer({expectedAnswer:"Kepler",submittedAnswer:" kepler ",evidenceStatus:"verified"});
 assert.equal(result.correct,true); assert.equal(result.evidenceStatus,"verified");
});
test("warns when answer key is not verified",()=>{
 const result=gradeAnswer({expectedAnswer:"Kepler",submittedAnswer:"Kepler",evidenceStatus:"draft"});
 assert.match(result.feedback,/尚未完成来源审核/);
});
test("schedules deterministic spaced repetition",()=>{
 assert.equal(nextReviewDate({reviewedAt:"2026-01-01T00:00:00Z",quality:5,previousIntervalDays:4}).intervalDays,10);
});
