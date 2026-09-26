import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function countPackages(recursive) {
  const output = execFileSync(
    'yarn',
    ['info', '**', '--all', ...(recursive ? ['--recursive'] : []), '--name-only', '--json'],
    {
      encoding: 'utf8',
    }
  );
  let count = 0;
  for (const line of output.trim().split('\n')) {
    if (!/@(workspace|link):/.test(JSON.parse(line))) {
      count++;
    }
  }
  return count;
}

const packageManager = JSON.parse(readFileSync('package.json', 'utf8')).packageManager.split('@')[0];

if (packageManager === 'yarn') {
  console.log(`${countPackages(false)} ${countPackages(true)}`);
} else if (packageManager === 'pnpm') {
  const { default: yaml } = await import('js-yaml');
  // pnpm 12 may prepend a separate lockfile document for its own executable/config dependencies.
  // The final document is the workspace dependency graph (and the only document in older lockfiles).
  const lockfile = yaml.loadAll(readFileSync('pnpm-lock.yaml', 'utf8')).at(-1);
  if (!lockfile?.importers || !lockfile.packages) {
    throw new Error('pnpm-lock.yaml must contain importers and packages');
  }
  const { importers, packages } = lockfile;

  // The packages section has one entry per resolved version, without peer-context duplicates.
  const resolved = new Set(Object.keys(packages).filter((id) => /^(@[^/]+\/)?[^@]+@\d/.test(id)));
  const direct = new Set();
  for (const importer of Object.values(importers)) {
    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, { specifier, version }] of Object.entries(importer[group] ?? {})) {
        if (specifier.startsWith('workspace:') || version.startsWith('link:')) {
          continue;
        }
        // Alias refs already contain the real package name; ordinary refs contain only the version.
        const ref = version.split('(')[0];
        const id = /^\d/.test(ref) ? `${name}@${ref}` : ref;
        if (resolved.has(id)) {
          direct.add(id);
        }
      }
    }
  }
  console.log(`${direct.size} ${resolved.size}`);
} else {
  throw new Error(`Unsupported package manager: ${packageManager}`);
}
