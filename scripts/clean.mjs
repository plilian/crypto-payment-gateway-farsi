import { rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildOutput = resolve(projectRoot, 'dist');
if (dirname(buildOutput) !== projectRoot || basename(buildOutput) !== 'dist') {
  throw new Error('Refusing to clean a path outside the project dist directory.');
}
await rm(buildOutput, { recursive: true, force: true });
