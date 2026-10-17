const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
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
  if (!/^[a-z]\\d{3}$/.test(id)) errors.push('Invalid question ID: ' + id);
  if (!promptField || promptField.length < 3 || promptField === "''")
    errors.push(id + ': missing question prompt');
  if (!explanationField || explanationField.length < 3 || explanationField === "''")
    errors.push(id + ': missing answer explanation');
  if (ids.has(id)) errors.push('Duplicate question ID: ' + id);
  ids.add(id);
  levels.set(level, (levels.get(level) || 0) + 1);
  if (!allowed.has(type)) {
    errors.push(id + ': unsupported type ' + type);
    continue;
  }
  const options = optionsField === 'null'
    ? null
    : [...optionsField.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(match => match[1]);
  const answerNumbers = [...answerField.matchAll(/\d+/g)].map(match => Number(match[0]));
  if (type === 'single') {
    const answer = Number(answerField);
    if (!options || options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length)
      errors.push(id + ': invalid single-choice options/answer');
  } else if (type === 'judge') {
    if (options !== null || !['0', '1'].includes(answerField))
      errors.push(id + ': invalid true/false answer');
  } else if (type === 'multi' || type === 'order') {
    if (!options || options.length < 2 || !answerNumbers.length ||
        answerNumbers.some(value => value < 0 || value >= options.length))
      errors.push(id + ': invalid ' + type + ' options/answer');
    if (type === 'multi' && new Set(answerNumbers).size !== answerNumbers.length)
      errors.push(id + ': multi-choice answer contains duplicate options');
    if (type === 'order' && (answerNumbers.length !== options.length ||
        new Set(answerNumbers).size !== options.length))
      errors.push(id + ': order answer must be a complete permutation');
  } else if (type === 'fill') {
    const fillAnswers = [...answerField.matchAll(/'((?:[^'\\\\]|\\\\.)*)'/g)].map(match => match[1]);
    if (options !== null || !answerField.startsWith('[') || !answerField.endsWith(']') ||
        !fillAnswers.length || fillAnswers.some(value => !value.trim()))
      errors.push(id + ': invalid fill-in answer');
  }
}

if (rows.length !== 300) errors.push('Expected 300 questions, found ' + rows.length);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Question bank OK: ' + ids.size + ' unique questions; ' + JSON.stringify(Object.fromEntries(levels)));
