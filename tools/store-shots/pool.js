// pool.js — runs headless-browser jobs concurrently instead of one at a time.
//
// Rendering 55 frames serially is process-bound, not compute-bound: each shot is
// an independent Edge invocation that spends most of its life starting up. A
// small pool cuts wall-clock roughly with the worker count.
//
// This does NOT change output. Each job renders the same HTML with the same
// flags, and --virtual-time-budget makes the render deterministic regardless of
// how loaded the machine is, so a frame looks identical whether it ran alone or
// alongside five others. The one requirement is that every worker gets its own
// --user-data-dir; sharing one profile across concurrent Chromium processes is
// what actually corrupts runs.
"use strict";

const os = require("os");
const { execFile } = require("child_process");

// Leave headroom so the machine stays usable and the processes aren't fighting
// for cores, which is where flaky font timing would come from.
const DEFAULT_WORKERS = Math.max(2, Math.min(6, (os.cpus() || { length: 4 }).length - 2));

/**
 * @param {Array} items          job descriptors
 * @param {(item, workerId) => {file: string, args: string[]}} plan
 *        Builds the command for one item. workerId is stable per worker so the
 *        caller can hand out a distinct --user-data-dir.
 * @param {(item, stdout) => void} [onDone]  called as each job finishes
 * @param {number} [workers]
 */
function runPool(items, plan, onDone, workers) {
  const limit = workers || DEFAULT_WORKERS;
  let next = 0;
  let active = 0;
  const errors = [];

  return new Promise((resolve, reject) => {
    function pump() {
      if (next >= items.length && active === 0) {
        return errors.length ? reject(errors[0]) : resolve();
      }
      while (active < limit && next < items.length) {
        const item = items[next];
        const workerId = next % limit;
        next++;
        active++;
        const { file, args } = plan(item, workerId);
        execFile(file, args, { maxBuffer: 1 << 24 }, (err, stdout) => {
          active--;
          if (err) errors.push(err);
          else if (onDone) {
            try {
              onDone(item, stdout);
            } catch (e) {
              errors.push(e);
            }
          }
          pump();
        });
      }
    }
    pump();
  });
}

module.exports = { runPool, DEFAULT_WORKERS };
