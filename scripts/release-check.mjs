import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'README.md',
  'plan.md',
  'docs/DOMAIN_ARCHITECTURE.md',
  'docs/DEMO_SCRIPT.md',
  'docs/RELEASE_CHECKLIST.md',
  'docs/settlement/LIVE_EVIDENCE.md',
  'packages/reconciliation/docs/c06/QUALIFICATION_REPORT.md',
];

const requiredScripts = ['build', 'lint', 'typecheck', 'test', 'demo:r4'];

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function fail(message) {
  console.error(`release-check: ${message}`);
  process.exitCode = 1;
}

const branch = git('branch', '--show-current');
const head = git('rev-parse', 'HEAD');
const tree = git('rev-parse', 'HEAD^{tree}');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`missing required release artifact: ${file}`);
}

for (const name of requiredScripts) {
  if (typeof packageJson.scripts?.[name] !== 'string') {
    fail(`missing package script: ${name}`);
  }
}

if (!branch || ['develop', 'main'].includes(branch)) {
  fail('run from a short-lived release branch, not develop/main');
}

const expectedHead = process.env.ONESHOT_RELEASE_HEAD?.trim();
if (expectedHead && expectedHead !== head) {
  fail(`HEAD ${head} does not match ONESHOT_RELEASE_HEAD ${expectedHead}`);
}

const expectedTree = process.env.ONESHOT_RELEASE_TREE?.trim();
if (expectedTree && expectedTree !== tree) {
  fail(`tree ${tree} does not match ONESHOT_RELEASE_TREE ${expectedTree}`);
}

if (process.exitCode) process.exit();

console.log(
  JSON.stringify(
    {
      schema_version: 'oneshot-release-check-v1',
      status: 'PASS',
      branch,
      head,
      tree,
      required_artifacts: requiredFiles,
      required_scripts: requiredScripts,
      qualification: 'NOT VERIFIED until fresh live sponsor evidence is captured',
    },
    null,
    2,
  ),
);
