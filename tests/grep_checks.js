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
  'package.json',
  'public/framework/wf-framework-v2.js',
  'FRAMEWORK.md',
  'tests/framework_unit.js',
  'public/workflows/leadgenpro.html'
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
  'WF\\.mount\\(',
  'wf-framework-v2\\.js',
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
  'Radar Orchestrator',
  'Collector Agents',
  'Intent Judge',
  'Contact Finder',
  'Radar Database',
  'Pattern Engine',
  'Project Email Writer',
  'Recruitment Email Writer',
  'Approval & Send'
].forEach(function (title) {
  var pattern = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  checkMinHits('public/workflows/leadgenpro.html', pattern, 1, 'Check J');
});

/* Check T: public wording -- no infra/vendor internals leak into the public page */
(function checkPublicWording() {
  var rel = 'public/workflows/leadgenpro.html';
  var content = readFile(rel);
  if (/proxy|proxies|\bVPN\b|Vinay|burner|residential IP|fake account/i.test(content)) {
    failures.push('Check T: forbidden public-wording pattern matched in ' + rel);
  }
})();

/* Check U: retired stubs gone */
checkNoStrings(
  'public/workflows/leadgenpro.html',
  ['stubC', 'stubD', 'IT Staffing + Email', 'LinkedIn Radar + Apollo + Email'],
  'Check U'
);

/* Check V: built vs in-development marking is wired */
[
  'dev:true',
  "status:'planned'",
  'autoToggle:true',
  'IN DEVELOPMENT',
  'statusLegend'
].forEach(function (pattern) {
  checkMinHits('public/workflows/leadgenpro.html', pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 1, 'Check V');
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

/* Check Q: the shared framework file exists, is v2, carries the DOM runtime, and is client-name free
   (it is publicly served from public/framework/) */
(function checkFrameworkFile() {
  const rel = 'public/framework/wf-framework-v2.js';
  if (!fs.existsSync(path.join(ROOT, rel))) {
    failures.push('Check Q: ' + rel + ' is missing');
    return;
  }
  const content = readFile(rel);
  if (content.indexOf("VERSION = '2.0.0'") === -1) {
    failures.push('Check Q: ' + rel + " does not declare VERSION = '2.0.0'");
  }
  if (content.indexOf('function mount(') === -1) {
    failures.push('Check Q: ' + rel + ' does not define the DOM runtime function mount(');
  }
  ['RecruitingNOW', 'Andreas', 'Bavaria', 'Germany'].forEach(function (s) {
    if (content.indexOf(s) !== -1) {
      failures.push('Check Q: found "' + s + '" in ' + rel);
    }
  });
})();

/* Check R: Measurement Framework v1 is gone from LeadGenPro and Framework v2 drives it */
checkNoPatterns(
  'public/workflows/leadgenpro.html',
  [
    'polar\\(',
    'SUB_FORK_ANGLE',
    'BRANCH_NODE_STEP',
    'radialStep',
    'angleOffset',
    'checkLayoutInvariants',
    'MEASUREMENT FRAMEWORK v1',
    'var GAP_'
  ],
  'Check R'
);
[
  'WF_SPEC',
  "pattern: 'brain'",
  'wfResetLayout'
].forEach(function (pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  checkMinHits('public/workflows/leadgenpro.html', escaped, 1, 'Check R');
});

/* Check S: the spec copy is client-name free */
(function checkFrameworkDoc() {
  const rel = 'FRAMEWORK.md';
  if (!fs.existsSync(path.join(ROOT, rel))) {
    failures.push('Check S: ' + rel + ' is missing');
    return;
  }
  const content = readFile(rel);
  ['RecruitingNOW', 'Andreas', 'Bavaria', 'Germany'].forEach(function (s) {
    if (content.indexOf(s) !== -1) {
      failures.push('Check S: found "' + s + '" in ' + rel);
    }
  });
})();

if (failures.length) {
  console.error('grep_checks.js: ' + failures.length + ' failure(s):');
  failures.forEach(function (f) { console.error('  - ' + f); });
  process.exit(1);
} else {
  console.log('grep_checks.js: all checks passed.');
  process.exit(0);
}
