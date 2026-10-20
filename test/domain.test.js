import test from "node:test";
import assert from "node:assert/strict";
import { gradeAnswer, nextReviewDate } from "../src/domain/index.js";
test("grades normalized answers while preserving evidence status",()=>{
 const result=gradeAnswer({expectedAnswer:"Kepler",submittedAnswer:" kepler ",evidenceStatus:"verified"});
 assert.equal(result.correct,true); assert.equal(result.evidenceStatus,"verified");
});
test("grades case and canonical Unicode consistently without locale-dependent casing",()=>{
 assert.equal(gradeAnswer({expectedAnswer:"  KEPLER  ",submittedAnswer:"kepler",evidenceStatus:"verified"}).correct,true);
 assert.equal(gradeAnswer({expectedAnswer:"Café",submittedAnswer:"Cafe"+String.fromCharCode(0x301),evidenceStatus:"verified"}).correct,true);
 assert.equal(gradeAnswer({expectedAnswer:"I",submittedAnswer:"i",evidenceStatus:"verified"}).correct,true);
});
test("warns when answer key is not verified",()=>{
 const result=gradeAnswer({expectedAnswer:"Kepler",submittedAnswer:"Kepler",evidenceStatus:"draft"});
 assert.match(result.feedback,/尚未完成来源审核/);
});
test("schedules deterministic spaced repetition",()=>{
 assert.equal(nextReviewDate({reviewedAt:"2026-01-01T00:00:00Z",quality:5,previousIntervalDays:4}).intervalDays,10);
});

test("requires timezone-qualified review timestamps and safe review intervals",()=>{
 assert.throws(()=>nextReviewDate({reviewedAt:"2026-01-01T00:00:00",quality:4}),TypeError);
 assert.throws(()=>nextReviewDate({reviewedAt:"2026-02-30T00:00:00Z",quality:4}),TypeError);
 assert.throws(()=>nextReviewDate({reviewedAt:"2026-01-01T00:00:00+14:30",quality:4}),TypeError);
 assert.throws(()=>nextReviewDate({reviewedAt:"2026-01-01T00:00:00Z",quality:4,previousIntervalDays:-1}),RangeError);
 assert.throws(()=>nextReviewDate({reviewedAt:"2026-01-01T00:00:00Z",quality:4,previousIntervalDays:3651}),RangeError);
 assert.throws(()=>nextReviewDate({reviewedAt:"2026-01-01T00:00:00Z",quality:6}),RangeError);
});
test("caps long-term spaced-review intervals and prevents invalid due dates",()=>{
 const result=nextReviewDate({
  reviewedAt:"2026-01-01T00:00:00Z",quality:5,previousIntervalDays:3650
 });
 assert.equal(result.intervalDays,3650);
 assert.equal(result.dueAt,"2035-12-30T00:00:00.000Z");
 assert.throws(()=>nextReviewDate({
  reviewedAt:"9999-12-31T23:59:59Z",quality:5,previousIntervalDays:1
 }),RangeError);
});


test("grades equivalent Unicode whitespace consistently",()=>{
 assert.equal(gradeAnswer({
  expectedAnswer:"fuel cell efficiency",
  submittedAnswer:"fuel\u00a0\u2009cell\t efficiency",
  evidenceStatus:"verified"
 }).correct,true);
});


test("collapses repeated whitespace before comparing normalized answers",()=>{
 assert.equal(gradeAnswer({expectedAnswer:"alpha beta",submittedAnswer:" alpha   beta ",evidenceStatus:"verified"}).correct,true);
});

test("bounds answer grading input before Unicode normalization",()=>{
 const oversized="a".repeat(10001);
 assert.throws(()=>gradeAnswer({
  expectedAnswer:oversized,submittedAnswer:"a",evidenceStatus:"verified"
 }),RangeError);
 assert.throws(()=>gradeAnswer({
  expectedAnswer:"a",submittedAnswer:oversized,evidenceStatus:"verified"
 }),RangeError);
});


test("answer grading enforces the size limit after Unicode normalization",()=>{
 const expanding="İ".repeat(6000);
 assert.throws(()=>gradeAnswer({expectedAnswer:expanding,submittedAnswer:"i",evidenceStatus:"verified"}),RangeError);
});


test("answer grading rejects non-whitespace control characters",()=>{
 assert.throws(()=>gradeAnswer({expectedAnswer:"safe\u0000answer",submittedAnswer:"safe answer",evidenceStatus:"verified"}),TypeError);
 assert.throws(()=>gradeAnswer({expectedAnswer:"safe answer",submittedAnswer:"safe\u007fanswer",evidenceStatus:"verified"}),TypeError);
});
