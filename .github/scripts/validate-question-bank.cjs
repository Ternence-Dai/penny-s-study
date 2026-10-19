const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8') + '\n' + fs.readFileSync('assets/js/question-bank.js', 'utf8') + '\n' + fs.readFileSync('assets/js/legacy-app.js', 'utf8');
if (!html.includes("' + esc(e.message) + '</div></div>'"))
  throw new Error('runtime error messages must be HTML-escaped before rendering');
const start = html.indexOf('var RAW = [');
const end = html.indexOf('\n];', start);
if (start < 0 || end < 0) throw new Error('Question bank RAW array not found');

const rows = html.slice(start, end).split('\n')
  .filter(line => /^\s*\['[a-z]\d+'/.test(line))
  .map(line => line.trim().replace(/,$/, ''));

function splitTopLevel(line) {
  const fields = [];
  let fieldStart = 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 1; i < line.length - 1; i++) {
    const ch = line[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === "'") inString = false;
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      fields.push(line.slice(fieldStart, i).trim());
      fieldStart = i + 1;
    }
  }
  fields.push(line.slice(fieldStart, line.length - 1).trim());
  return fields;
}

const ids = new Set();
const levels = new Map();
const allowed = new Set(['single', 'judge', 'multi', 'fill', 'order']);
const errors = [];
const isStringArrayLiteral = value =>
  /^\[\s*'(?:[^'\\]|\\.)*'(?:\s*,\s*'(?:[^'\\]|\\.)*')*\s*\]$/.test(value);
if (!isStringArrayLiteral("['A','B']") ||
    isStringArrayLiteral("['A', invalid, 'B']") ||
    isStringArrayLiteral("['A',, 'B']") ||
    isStringArrayLiteral("['A','B'")) {
  throw new Error('Question option literal parser regression');
}
for (const line of rows) {
  const fields = splitTopLevel(line);
  if (fields.length !== 8) {
    errors.push('Expected 8 fields: ' + line.slice(0, 100));
    continue;
  }
  const id = fields[0].slice(1, -1);
  const level = fields[1].slice(1, -1);
  const type = fields[3].slice(1, -1);
  const promptField = fields[4];
  const optionsField = fields[5];
  const answerField = fields[6];
  const explanationField = fields[7];
  if (!/^[a-z]\d{3}$/.test(id)) errors.push('Invalid question ID: ' + id);
  if (!promptField || promptField.length < 3 || promptField === "''")
    errors.push(id + ': missing question prompt');
  if (!explanationField || explanationField.length < 3 || explanationField === "''")
    errors.push(id + ': missing answer explanation');
  if (ids.has(id)) errors.push('Duplicate question ID: ' + id);
  ids.add(id);
  levels.set(level, (levels.get(level) || 0) + 1);
  const category = fields[2].slice(1, -1);
  if (!category.trim()) errors.push(id + ': missing category');
  if (!allowed.has(type)) {
    errors.push(id + ': unsupported type ' + type);
    continue;
  }
  const optionsLiteralValid = optionsField === 'null' || isStringArrayLiteral(optionsField);
  if (!optionsLiteralValid) errors.push(id + ': malformed options literal');
  const options = optionsField === 'null' || !optionsLiteralValid
    ? null
    : [...optionsField.matchAll(/'((?:[^'\\\\]|\\\\.)*)'/g)].map(match => match[1]);
  const parseIndexArray = () => {
    if (!/^\[\s*(?:0|[1-9]\d*)(?:\s*,\s*(?:0|[1-9]\d*))*\s*\]$/.test(answerField))
      return null;
    try {
      const values = JSON.parse(answerField);
      return Array.isArray(values) && values.every(Number.isSafeInteger) ? values : null;
    } catch {
      return null;
    }
  };
  const answerNumbers = parseIndexArray();
  if (options && options.some(option => !option.trim())) errors.push(id + ': options must not be blank');
  if (options && new Set(options.map(option => option.trim().toLowerCase())).size !== options.length)
    errors.push(id + ': options contain duplicate labels');
  if (type === 'single') {
    const answer = /^(?:0|[1-9]\d*)$/.test(answerField) ? Number(answerField) : NaN;
    if (!options || options.length < 2 || !Number.isSafeInteger(answer) || answer < 0 || answer >= options.length)
      errors.push(id + ': invalid single-choice options/answer');
  } else if (type === 'judge') {
    if (options !== null || !['0', '1'].includes(answerField))
      errors.push(id + ': invalid true/false answer');
  } else if (type === 'multi' || type === 'order') {
    if (!options || options.length < 2 || !answerNumbers || !answerNumbers.length ||
        answerNumbers.some(value => value < 0 || value >= options.length))
      errors.push(id + ': invalid ' + type + ' options/answer');
    if (type === 'multi' && answerNumbers && new Set(answerNumbers).size !== answerNumbers.length)
      errors.push(id + ': multi-choice answer contains duplicate options');
    if (type === 'order' && (!options || !answerNumbers || answerNumbers.length !== options.length ||
        new Set(answerNumbers).size !== options.length))
      errors.push(id + ': order answer must be a complete permutation');
  } else if (type === 'fill') {
    const fillAnswers = [...answerField.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(match => match[1]);
    const validFillLiteral = /^\[\s*'(?:[^'\\]|\\.)*'(?:\s*,\s*'(?:[^'\\]|\\.)*')*\s*\]$/.test(answerField);
    if (options !== null || !validFillLiteral ||
        !fillAnswers.length || fillAnswers.some(value => !value.trim()))
      errors.push(id + ': invalid fill-in answer');
  }
}

if (rows.length !== 300) errors.push('Expected 300 questions, found ' + rows.length);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const runtime = vm.createContext({});
vm.runInContext(fs.readFileSync('assets/js/question-grading.js', 'utf8'), runtime);
vm.runInContext(fs.readFileSync('assets/js/question-bank.js', 'utf8'), runtime);
const appSource = fs.readFileSync('assets/js/legacy-app.js', 'utf8');
const normalizerStart = appSource.indexOf('function norm(s){');
if (normalizerStart < 0) throw new Error('App answer normalization function not found');
const normalizerEnd = appSource.indexOf('\n', normalizerStart);
if (normalizerEnd < 0) throw new Error('App answer normalization function is not newline-terminated');
vm.runInContext(appSource.slice(normalizerStart, normalizerEnd), runtime);
const grading = runtime.PennyQuestionGrading;
if (runtime.norm("20°30'") !== runtime.norm("20°30′"))
  throw new Error('ASCII apostrophe must normalize as an angle-minute marker');
if (runtime.norm('20°30"') !== runtime.norm('20°30″'))
  throw new Error('ASCII quote must normalize as an angle-second marker');
const runtimeFailures = [];
for (const question of runtime.Q) {
  const acceptedAnswers = question.type === 'fill' ? question.answer : [question.answer];
  for (const accepted of acceptedAnswers) {
    if (!grading.isCorrect(question, accepted, runtime.norm)) {
      runtimeFailures.push(question.id + ': configured answer is rejected by the production grader (' +
        question.type + ')');
    }
  }
}
if (runtimeFailures.length) {
  console.error(runtimeFailures.join('\\n'));
  process.exit(1);
}
console.log('Runtime answer-key check OK: all ' + runtime.Q.length +
  ' questions and all accepted fill-in variants pass the production grading engine.');

console.log('Question bank OK: ' + ids.size + ' unique questions; ' + JSON.stringify(Object.fromEntries(levels)));
