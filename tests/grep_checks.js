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

function checkMinHits(relPath, pattern, minHits, label) {
  const content = readFile(relPath);
  const re = new RegExp(pattern, 'g');
  const matches = content.match(re);
  const count = matches ? matches.length : 0;
  if (count < minHits) {
    failures.push(label + ': expected >= ' + minHits + ' hit(s) for /' + pattern + '/ in ' + relPath + ', found ' + count);
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

/* Check A: menu pill fully removed from the shell */
checkNoStrings(
  'public/index.html',
  ['menu-pill', '#menuPill', 'menuPill', '--menu-pill-size', 'STORAGE_LAST', 'wflib.lastWorkflow'],
  'Check A'
);

/* Check B: shell listens for cross-frame postMessage */
checkMinHits('public/index.html', 'addEventListener\\([\'"]message[\'"]', 1, 'Check B');

/* Check C: every iframe page carries the menu button */
['public/workflows/home.html', 'public/workflows/account-enrichment.html'].forEach(function (relPath) {
  checkMinHits(relPath, 'wf-menu-btn', 1, 'Check C');
});

/* Check D: every iframe page posts to the shell */
['public/workflows/home.html', 'public/workflows/account-enrichment.html'].forEach(function (relPath) {
  checkMinHits(relPath, 'postMessage', 1, 'Check D');
});

/* Check E: no stale territory-era framing state survives in the workflow */
checkNoStrings(
  'public/workflows/account-enrichment.html',
  ['WORKFLOW_OFFSET_X', 'territoryHome', 'initialPanX', 'initialPanY', 'initialZoom'],
  'Check E'
);

/* Check F: postMessage never targets a wildcard origin, anywhere under public/ */
(function checkNoWildcardPostMessage() {
  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        const rel = path.relative(ROOT, full);
        checkNoPatterns(rel, ["postMessage\\(.*,\\s*['\"]\\*['\"]"], 'Check F');
      }
    });
  }
  walk(path.join(ROOT, 'public'));
})();

/* Check H: LeadGenPro file existence + core symbols */
[
  'wf-menu-btn',
  'postMessage',
  'TRUNK_CX',
  'polar\\(',
  'Leadgenpro',
  '--accent:#7C3AED'
].forEach(function (pattern) {
  checkMinHits('public/workflows/leadgenpro.html', pattern, 1, 'Check H');
});

/* Check I: LeadGenPro forbidden strings */
(function checkLeadgenproForbidden(){
  var relPath = 'public/workflows/leadgenpro.html';
  var content = readFile(relPath);
  if (content.indexOf(EM_DASH) !== -1) {
    var idx = content.indexOf(EM_DASH);
    var line = content.substring(0, idx).split('\n').length;
    failures.push('Check I: em dash (U+2014) found in ' + relPath + ' near line ' + line);
  }
  ['RecruitingNOW', 'Andreas'].forEach(function (s) {
    if (content.indexOf(s) !== -1) {
      failures.push('Check I: found "' + s + '" in ' + relPath);
    }
  });
  if (/postMessage\(.*,\s*['"]\*['"]/.test(content)) {
    failures.push('Check I: wildcard postMessage target found in ' + relPath);
  }
})();

/* Check J: LeadGenPro node completeness */
[
  'Prospector',
  'Lead Database',
  'CRM',
  'WhatsApp Web',
  'Cold Call',
  'Call Analyzer',
  'AI Coach',
  'ProspectIQ + Apollo + Email',
  'LinkedIn Radar + Apollo + Email',
  'IT Staffing + Email'
].forEach(function (title) {
  var pattern = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  checkMinHits('public/workflows/leadgenpro.html', pattern, 1, 'Check J');
});

/* Check K: split-rule comment present */
checkMinHits('public/workflows/leadgenpro.html', 'Overview vs Full Detail split rule', 1, 'Check K');

/* Check L: registry entry */
(function checkRegistryEntry(){
  var json = JSON.parse(readFile('public/workflows.json'));
  var entry = json.filter(function (e) { return e.id === 'leadgenpro'; })[0];
  if (!entry) {
    failures.push('Check L: leadgenpro entry missing from workflows.json');
    return;
  }
  if (entry.title !== 'Leadgenpro') {
    failures.push('Check L: title mismatch, expected "Leadgenpro", got "' + entry.title + '"');
  }
  if (entry.accent !== '#7C3AED') {
    failures.push('Check L: accent mismatch, expected "#7C3AED", got "' + entry.accent + '"');
  }
  if (entry.subtitle !== 'Multi Channel Ai native Lead generation and outbound automation platform') {
    failures.push('Check L: subtitle mismatch, got "' + entry.subtitle + '"');
  }
})();

/* Check M: framework block present */
checkMinHits('public/workflows/leadgenpro.html', 'MEASUREMENT FRAMEWORK v1', 1, 'Check M');

/* Check N: constants derived, not hardcoded */
[
  'GAP_TIGHT',
  'GAP_BREATH',
  'GAP_ISLAND',
  'GAP_SECTOR',
  'TRUNK_CLEAR_R',
  'BRANCH_START_R',
  'BRANCH_NODE_STEP',
  'SUB_FORK_ANGLE'
].forEach(function (name) {
  checkMinHits('public/workflows/leadgenpro.html', name, 1, 'Check N');
});

/* Check O: BRANCH_START_R is derived, not a literal */
checkMinHits(
  'public/workflows/leadgenpro.html',
  'BRANCH_START_R\\s*=\\s*TRUNK_CLEAR_R\\s*\\+\\s*NODE_W\\s*/\\s*2',
  1,
  'Check O'
);

/* Check P: aggressive clearance pass removed, warn-only invariant check present */
checkNoPatterns(
  'public/workflows/leadgenpro.html',
  ['enforceClearance', 'pushBranchOutward'],
  'Check P'
);
checkMinHits('public/workflows/leadgenpro.html', 'checkLayoutInvariants', 1, 'Check P');

if (failures.length) {
  console.error('grep_checks.js: ' + failures.length + ' failure(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
} else {
  console.log('grep_checks.js: all checks passed.');
  process.exit(0);
}
