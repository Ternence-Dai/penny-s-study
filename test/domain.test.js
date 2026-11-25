import test from "node:test";
import assert from "node:assert/strict";
import { gradeAnswer, nextReviewDate, fsrsRatingFromQuality, buildReviewEvent, revlogCsvFromAttemptLog } from "../src/domain/index.js";
test("maps scheduler quality to FSRS ratings",()=>{
 assert.deepEqual([0,1,2,3,4,5].map(q=>fsrsRatingFromQuality(q)),[1,1,1,2,3,4]);
 assert.throws(()=>fsrsRatingFromQuality(6),RangeError);
 assert.throws(()=>fsrsRatingFromQuality(-1),RangeError);
 assert.throws(()=>fsrsRatingFromQuality(2.5),RangeError);
});
test("builds FSRS review events with validated fields",()=>{
 const event=buildReviewEvent({cardId:"p001",reviewedAtMs:1760000000000,quality:4,reviewState:0});
 assert.deepEqual(event,{card_id:"p001",review_time:1760000000000,review_rating:3,review_state:0});
 const timed=buildReviewEvent({cardId:"p001",reviewedAtMs:1760000000000,quality:5,reviewState:2,reviewDurationMs:4200});
 assert.equal(timed.review_duration,4200);
 assert.throws(()=>buildReviewEvent({cardId:"",reviewedAtMs:0,quality:4,reviewState:0}),TypeError);
 assert.throws(()=>buildReviewEvent({cardId:"p001",reviewedAtMs:-1,quality:4,reviewState:0}),RangeError);
 assert.throws(()=>buildReviewEvent({cardId:"p001",reviewedAtMs:0,quality:4,reviewState:4}),RangeError);
 assert.throws(()=>buildReviewEvent({cardId:"p001",reviewedAtMs:0,quality:4,reviewState:0,reviewDurationMs:-5}),RangeError);
});
test("exports revlog CSV from attempt entries and skips legacy entries",()=>{
 const attempts=[
  {id:"p001",correct:false,at:1760000000000,state:{book:"none"}},
  {id:"p001",correct:true,at:1760086400000,quality:4,rating:3,fsrsState:3,state:{book:"wrong",intervalDays:1,correctStreak:0,nextReviewAt:1760086400000}},
  {id:"p,002",correct:true,at:1760172800000,quality:5,rating:4,fsrsState:2,state:{book:"wrong",intervalDays:3,correctStreak:2,nextReviewAt:1760432000000}}
 ];
 const result=revlogCsvFromAttemptLog(attempts);
 assert.equal(result.includedCount,2);
 assert.equal(result.skippedCount,1);
 const lines=result.csv.trimEnd().split("\n");
 assert.equal(lines[0],"review_time,card_id,review_rating,review_duration,review_state");
 assert.equal(lines[1],"1760086400000,p001,3,,3");
 assert.equal(lines[2],'1760172800000,"p,002",4,,2');
 const empty=revlogCsvFromAttemptLog([]);
 assert.equal(empty.includedCount,0);
 assert.equal(empty.csv,"review_time,card_id,review_rating,review_duration,review_state\n");
 assert.throws(()=>revlogCsvFromAttemptLog("nope"),TypeError);
 assert.throws(()=>revlogCsvFromAttemptLog([
  {id:"p001",correct:true,at:1760000000000,quality:4,rating:4,fsrsState:2,state:{book:"none"}}
 ]),RangeError);
});
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

test("rejects RFC 3339 unknown local offset for review scheduling",()=>{
 assert.throws(()=>nextReviewDate({
  reviewedAt:"2026-01-01T00:00:00-00:00",quality:4
 }),TypeError);
 assert.equal(nextReviewDate({
  reviewedAt:"2026-01-01T00:00:00+00:00",quality:4
 }).dueAt,"2026-01-02T00:00:00.000Z");
 assert.equal(nextReviewDate({
  reviewedAt:"2026-01-01T00:00:00Z",quality:4
 }).dueAt,"2026-01-02T00:00:00.000Z");
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

test("rejects oversized answer strings before content scanning",()=>{
 const oversized="\\u0000"+"a".repeat(10000);
 assert.throws(()=>gradeAnswer({
  expectedAnswer:oversized,submittedAnswer:"a",evidenceStatus:"verified"
 }),RangeError);
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
