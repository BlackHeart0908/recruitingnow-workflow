'use strict';
/* Starts `npx serve public -p 4173 -L` before the acceptance suite runs.
   Pairs with global-teardown.js, which kills this process afterward.
   Playwright runs globalSetup and globalTeardown in the same main process
   for a single `playwright test` invocation, so a value stashed on
   `global` here is readable from global-teardown.js. */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 4173;
const URL = 'http://127.0.0.1:' + PORT + '/';
const ROOT = path.join(__dirname, '..');

function waitForServer(url, timeoutMs) {
  const start = Date.now();
  return new Promise(function (resolve, reject) {
    (function check() {
      const req = http.get(url, function (res) {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      function retry() {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Server at ' + url + ' did not respond with 200 within ' + timeoutMs + 'ms'));
          return;
        }
        setTimeout(check, 200);
      }
    })();
  });
}

module.exports = async function globalSetup() {
  const isWin = process.platform === 'win32';
  const child = spawn(
    isWin ? 'npx.cmd' : 'npx',
    ['serve', 'public', '-p', String(PORT), '-L'],
    {
      cwd: ROOT,
      stdio: 'ignore',
      shell: isWin,
      detached: !isWin
    }
  );
  global.__LIBRARY_SERVER_PID__ = child.pid;
  global.__LIBRARY_SERVER_PROC__ = child;
  await waitForServer(URL, 30000);
};
