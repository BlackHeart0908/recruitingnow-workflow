'use strict';
/* Grep-based acceptance checks for the Workflow Library shell build.
   No dependencies. Exits 0 on pass, prints failures and exits 1 on any hit. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EM_DASH = String.fromCharCode(8212);

const failures = [];

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function checkNoStrings(relPath, strings, label) {
  const content = readFile(relPath);
  strings.forEach(function (s) {
    if (content.indexOf(s) !== -1) {
      failures.push(label + ': found "' + s + '" in ' + relPath);
    }
  });
}

function checkNoPatterns(relPath, patterns, label) {
  const content = readFile(relPath);
  patterns.forEach(function (p) {
    const re = new RegExp(p);
    if (re.test(content)) {
      failures.push(label + ': pattern /' + p + '/ matched in ' + relPath);
    }
  });
}

function checkNoEmDash(relPath) {
  const content = readFile(relPath);
  if (content.indexOf(EM_DASH) !== -1) {
    const idx = content.indexOf(EM_DASH);
    const line = content.substring(0, idx).split('\n').length;
    failures.push('Check 4: em dash (U+2014) found in ' + relPath + ' near line ' + line);
  }
}

/* Check 1: account-enrichment.html has zero client-name occurrences */
checkNoStrings(
  'public/workflows/account-enrichment.html',
  [
    'RecruitingNOW',
    'Recruiting NOW',
    'Andreas',
    'Bavaria',
    'Bavarian',
    'Germany',
    'German',
    'Deutsch',
    'Impressum'
  ],
  'Check 1'
);

/* Check 2: account-enrichment.html has zero proposal-territory symbols */
checkNoPatterns(
  'public/workflows/account-enrichment.html',
  [
    '\\bBOARDS\\b',
    '\\bBOARD_EDGES\\b',
    '\\bSTEP_BOARDS\\b',
    'function\\s+switchTerritory',
    'function\\s+centerOnBoard',
    'function\\s+finalizeBoardLayout',
    'function\\s+openBoardPanel',
    'function\\s+territoryHome',
    '\\bPROPOSAL_W\\b',
    '\\bGUTTER_W\\b',
    '\\bBOARD_W\\b',
    '\\bWORKFLOW_OFFSET_X\\b',
    '\\bCURRENT_TERRITORY\\b',
    '#territoryToggle'
  ],
  'Check 2'
);

/* Check 3: workflows.json has zero client-name occurrences */
checkNoStrings(
  'public/workflows.json',
  ['recruitingnow', 'RecruitingNOW', 'Andreas', 'Germany', 'Bavaria'],
  'Check 3'
);

/* Check 4: zero em dash characters in any changed file */
[
  'public/index.html',
  'public/workflows/home.html',
  'public/workflows/account-enrichment.html',
  'public/workflows.json',
  'tests/grep_checks.js',
  'tests/library_acceptance.spec.js',
  'package.json'
].forEach(checkNoEmDash);

if (failures.length) {
  console.error('grep_checks.js: ' + failures.length + ' failure(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
} else {
  console.log('grep_checks.js: all checks passed.');
  process.exit(0);
}
