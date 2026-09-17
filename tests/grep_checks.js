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
  'Leadgenpro AI Orchestrator',
  'Prospector',
  'Lead Database',
  'CRM',
  'WhatsApp Web',
  'Cold Call',
  'Call Analyzer',
  'AI Coach',
  'Radar Orchestrator',
  'Collector Agents',
  'Intent Judge',
  'Contact Finder',
  'Radar Database',
  'Pattern Engine',
  'Project Email Writer',
  'Recruitment Email Writer',
  'Approval & Send',
  'Search Brief',
  'Site Discovery',
  'Relevance Gate',
  'Deep Extraction',
  'Apollo Enrichment',
  'Company Dossier',
  'LinkedIn Finder',
  'Vault & Send to CRM',
  'Report back required on every task'
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
  ['stubB', 'stubC', 'stubD', 'IT Staffing + Email', 'LinkedIn Radar + Apollo + Email', 'ProspectIQ + Apollo + Email'],
  'Check U'
);

/* Check W: fit and toggle wired */
[
  'function contentBox',
  'function fitViewFor',
  'role="switch"',
  'aria-checked',
  'function setAutoSend',
  'atFit',
  'function contentFitZoom',
  'DEFAULT_ZOOM = 0.32',
  'wf-framework-v2.js?v=2.2.0'
].forEach(function (pattern) {
  checkMinHits('public/workflows/leadgenpro.html', pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 1, 'Check W');
});
checkNoStrings(
  'public/workflows/leadgenpro.html',
  ["autoDiv.setAttribute('aria-hidden'"],
  'Check W'
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
  if (content.indexOf("VERSION = '2.2.0'") === -1) {
    failures.push('Check Q: ' + rel + " does not declare VERSION = '2.2.0'");
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

/* Check X: branch clearance is measured on real geometry (framework 2.1.0), not the old rectangle envelope gap */
(function checkGeomGap() {
  const rel = 'public/framework/wf-framework-v2.js';
  const content = readFile(rel);
  if (content.indexOf('function branchGeom') === -1) {
    failures.push('Check X: ' + rel + ' does not define function branchGeom');
  }
  if (content.indexOf('function geomGap') === -1) {
    failures.push('Check X: ' + rel + ' does not define function geomGap');
  }
  if (content.indexOf('var g = envGap(B, E);') !== -1) {
    failures.push('Check X: ' + rel + ' still contains the old rectangle-envelope gap check "var g = envGap(B, E);"');
  }
  if (content.indexOf('var eg = envGap(L.envelopes') !== -1) {
    failures.push('Check X: ' + rel + ' still contains the old rectangle-envelope inspector check "var eg = envGap(L.envelopes"');
  }
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

/* Check X: RAG assistant file exists and carries its core symbols */
[
  'WF_SPEC',
  'WF\\.mount\\(',
  'wf-framework-v2\\.js\\?v=2\\.2\\.0',
  'wf-menu-btn',
  'Illustrative scale, not live data\\.'
].forEach(function (pattern) {
  checkMinHits('public/workflows/rag-assistant.html', pattern, 1, 'Check X');
});

/* Check Y: public-wording forbidden strings, in every file this build adds or touches
   under public/ (case insensitive) -- the new page and workflows.json -- except the
   allowed "RAG" tag/subtitle in workflows.json. Pre-existing pages this build must not
   edit (leadgenpro.html, account-enrichment.html, home.html; ground rule 1) are out of
   scope for this check: leadgenpro.html already carries legitimate "LLM"/"GPT" copy from
   an earlier build, and rule 1 forbids touching it here. Also: no em dash and no
   wildcard postMessage target in the new page. */
(function checkPublicWordingForbidden() {
  var forbidden = [
    'LendIQ', 'LendingIQ', 'Lending IQ', 'lendingiq', 'Sanskar', 'Supabase', 'pgvector',
    'Vercel', 'Anthropic', 'Claude', 'OpenAI', 'GPT', 'embedding', 'embeddings',
    'vector database', 'LLM', 'RAG pipeline', 'chunking', 'reranker'
  ];
  ['public/workflows/rag-assistant.html', 'public/workflows.json'].forEach(function (rel) {
    var content = readFile(rel);
    forbidden.forEach(function (s) {
      var re = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (re.test(content)) {
        failures.push('Check Y: forbidden string "' + s + '" found in ' + rel);
      }
    });
  });

  var relNew = 'public/workflows/rag-assistant.html';
  var contentNew = readFile(relNew);
  if (contentNew.indexOf(EM_DASH) !== -1) {
    var idx = contentNew.indexOf(EM_DASH);
    var line = contentNew.substring(0, idx).split('\n').length;
    failures.push('Check Y: em dash (U+2014) found in ' + relNew + ' near line ' + line);
  }
  if (/postMessage\(.*,\s*['"]\*['"]/.test(contentNew)) {
    failures.push('Check Y: wildcard postMessage target found in ' + relNew);
  }
})();

/* Check Z: RAG assistant node completeness -- every node id, title, tooltip {what,why}, >=2 minor entries */
(function checkRagNodeCompleteness() {
  var rel = 'public/workflows/rag-assistant.html';
  var content = readFile(rel);
  var ids = ['kb', 'intake', 'extract', 'organize', 'ask', 'narrow', 'team', 'quick', 'deep', 'compare', 'shortlist'];
  // Locate every node's own start first (a node's own top-level "id:" declaration, not a
  // counter's "id:" field nested inside it), then slice between consecutive known starts --
  // slicing to the next generic "{ ... id:" would stop at the node's own first counter object.
  var starts = ids.map(function (id) {
    var m = new RegExp("\\{\\s*\\n?\\s*id\\s*:\\s*'" + id + "'").exec(content);
    return { id: id, index: m ? m.index : -1 };
  });
  starts.sort(function (a, b) { return a.index - b.index; });
  starts.forEach(function (entry, i) {
    var id = entry.id;
    if (entry.index === -1) { failures.push('Check Z: node "' + id + '" not found in ' + rel); return; }
    var end = (i + 1 < starts.length) ? starts[i + 1].index : content.length;
    var slice = content.substring(entry.index, end);
    if (!/title\s*:\s*'[^']+'/.test(slice)) failures.push('Check Z: node "' + id + '" missing a title');
    if (!/tooltip\s*:\s*\{[\s\S]*?what\s*:/.test(slice)) failures.push('Check Z: node "' + id + '" missing tooltip.what');
    if (!/tooltip\s*:\s*\{[\s\S]*?why\s*:/.test(slice)) failures.push('Check Z: node "' + id + '" missing tooltip.why');
    var minorMatch = /minor\s*:\s*\[([\s\S]*?)\]/.exec(slice);
    if (!minorMatch) {
      failures.push('Check Z: node "' + id + '" missing minor list');
    } else {
      var items = minorMatch[1].split(/',\s*\n?\s*'/).filter(function (s) { return s.trim().length; });
      if (items.length < 2) failures.push('Check Z: node "' + id + '" has fewer than 2 minor entries');
    }
  });
})();

/* Check AA: registry entry for rag-assistant */
(function checkRagRegistryEntry() {
  var json = JSON.parse(readFile('public/workflows.json'));
  var entry = json.filter(function (e) { return e.id === 'rag-assistant'; })[0];
  if (!entry) {
    failures.push('Check AA: rag-assistant entry missing from workflows.json');
    return;
  }
  if (entry.title !== 'AI Guideline Research Assistant') {
    failures.push('Check AA: title mismatch, expected "AI Guideline Research Assistant", got "' + entry.title + '"');
  }
  if (entry.accent !== '#0EA5E9') {
    failures.push('Check AA: accent mismatch, expected "#0EA5E9", got "' + entry.accent + '"');
  }
  if (entry.file !== 'workflows/rag-assistant.html') {
    failures.push('Check AA: file mismatch, expected "workflows/rag-assistant.html", got "' + entry.file + '"');
  }
})();

/* Check AB: framework version 2.2.0, and every page under public/workflows/ that loads the
   framework requests ?v=2.2.0 */
(function checkFrameworkVersion() {
  var rel = 'public/framework/wf-framework-v2.js';
  var content = readFile(rel);
  if (content.indexOf("VERSION = '2.2.0'") === -1) {
    failures.push('Check AB: ' + rel + " does not declare VERSION = '2.2.0'");
  }
  var dir = path.join(ROOT, 'public', 'workflows');
  fs.readdirSync(dir).filter(function (f) { return f.endsWith('.html'); }).forEach(function (f) {
    var relPage = 'public/workflows/' + f;
    var pageContent = readFile(relPage);
    if (pageContent.indexOf('wf-framework-v2.js') === -1) return; // page does not load the framework
    if (pageContent.indexOf('wf-framework-v2.js?v=2.2.0') === -1) {
      failures.push('Check AB: ' + relPage + ' loads the framework without requesting ?v=2.2.0');
    }
  });
})();

/* Check AC: no LeadGenPro leftovers in the RAG assistant page (case insensitive) */
(function checkRagNoLeadgenproLeftovers() {
  var rel = 'public/workflows/rag-assistant.html';
  var content = readFile(rel);
  ['leadgenpro', 'prospect', 'radar', 'whatsapp', 'crm', 'apollo'].forEach(function (s) {
    var re = new RegExp(s, 'i');
    if (re.test(content)) {
      failures.push('Check AC: leftover "' + s + '" found in ' + rel);
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
