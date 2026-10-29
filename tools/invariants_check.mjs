import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const harness = resolve(here, 'invariants.html');
const source = await readFile(harness, 'utf8');
const required = [1, 2, 3, 6, 8, 10];
const missing = required.filter(number => !source.includes(`report(${number},`));
if (missing.length) {
  console.error(`FAIL: invariants harness missing checks ${missing.join(', ')}`);
  process.exitCode = 1;
} else if (!source.includes('MutationObserver') || !source.includes("import('../src/ui.js')")) {
  console.error('FAIL: harness is not wired to the UI module and MutationObserver instrumentation');
  process.exitCode = 1;
} else {
  console.log(`PASS: ${harness} exists and wires browser checks ${required.join(', ')} with MutationObserver instrumentation.`);
  console.log('NOTE: open http://localhost:8000/tools/invariants.html in a real browser to execute the checklist.');
}
