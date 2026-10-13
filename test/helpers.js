import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const BIN = fileURLToPath(new URL('../bin/readme-gauge.js', import.meta.url));
export const FX = (n) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
export const tmp = () => mkdtempSync(join(tmpdir(), 'rg-'));
export function write(dir, files) { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), typeof c === 'string' ? c : JSON.stringify(c)); } return dir; }
export function run(args) { const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } }); return { code: r.status, out: r.stdout, err: r.stderr }; }
export const LONG = 'This package does useful things for people who need them. '.repeat(15);
