import { readFileSync } from 'node:fs';

const catalogPath = new URL('../.github/labels.yml', import.meta.url);
const text = readFileSync(catalogPath, 'utf8');
const labels = [];
let current = null;

for (const rawLine of text.split('\n')) {
  const line = rawLine.trim();
  if (line === '' || line.startsWith('#')) {
    continue;
  }
  const name = line.match(/^- name:\s+(.+)$/);
  if (name) {
    current = { name: unquote(name[1]) };
    labels.push(current);
    continue;
  }
  const field = line.match(/^(color|description):\s+(.+)$/);
  if (!field || !current) {
    throw new Error(`Unrecognized label catalog line: ${rawLine}`);
  }
  current[field[1]] = unquote(field[2]);
}

for (const label of labels) {
  if (!label.name || !label.color || !label.description) {
    throw new Error(`Incomplete label: ${JSON.stringify(label)}`);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(label.color)) {
    throw new Error(`Label ${label.name} needs a 6-digit hex color`);
  }
  if (label.description.length > 100) {
    throw new Error(`Label ${label.name} description is longer than 100 characters`);
  }
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!token || !repository) {
  console.error(`Parsed ${labels.length} labels from .github/labels.yml.`);
  console.error('Set GH_TOKEN (or GITHUB_TOKEN) and GITHUB_REPOSITORY=owner/repo to sync.');
  process.exit(1);
}

const [owner, repo] = repository.split('/');
if (!owner || !repo) {
  throw new Error('GITHUB_REPOSITORY must be owner/repo');
}

const api = 'https://api.github.com';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'oneshot-label-sync',
  'X-GitHub-Api-Version': '2022-11-28',
};

for (const label of labels) {
  const encoded = encodeURIComponent(label.name);
  const update = await fetch(`${api}/repos/${owner}/${repo}/labels/${encoded}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      new_name: label.name,
      color: label.color,
      description: label.description,
    }),
  });
  if (update.status === 404) {
    const created = await fetch(`${api}/repos/${owner}/${repo}/labels`, {
      method: 'POST',
      headers,
      body: JSON.stringify(label),
    });
    if (!created.ok) {
      throw new Error(`Create ${label.name} failed: ${created.status} ${await created.text()}`);
    }
    console.log(`created ${label.name}`);
    continue;
  }
  if (!update.ok) {
    throw new Error(`Update ${label.name} failed: ${update.status} ${await update.text()}`);
  }
  console.log(`updated ${label.name}`);
}

console.log(`Synced ${labels.length} labels on ${repository}. Other labels were left in place.`);

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
