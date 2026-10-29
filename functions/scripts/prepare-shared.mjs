import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'shared/socialCatalog.mjs');
const target = path.join(root, 'functions/src/generated/socialCatalog.mjs');
const bytes = await readFile(source);
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, bytes);
const expected = createHash('sha256').update(bytes).digest('hex');
const actual = createHash('sha256').update(await readFile(target)).digest('hex');
if (actual !== expected) throw new Error('Shared catalog copy mismatch');
console.log(`socialCatalog sha256 ${actual}`);
