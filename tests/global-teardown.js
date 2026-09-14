'use strict';
/* Kills the `serve` process started in global-setup.js. On Windows, npx
   spawns a shell that spawns node, so killing only the direct child pid
   would leave the real server running - `taskkill /T` kills the whole
   process tree instead. */

const { execSync } = require('child_process');

module.exports = async function globalTeardown() {
  const child = global.__LIBRARY_SERVER_PROC__;
  const pid = global.__LIBRARY_SERVER_PID__;
  if (!pid) return;

  try {
    if (process.platform === 'win32') {
      execSync('taskkill /pid ' + pid + ' /T /F', { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch (e) {
    // best-effort cleanup; nothing further to do if the process is already gone
  }
  if (child && typeof child.unref === 'function') child.unref();
};
