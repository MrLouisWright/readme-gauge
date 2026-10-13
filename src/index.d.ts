export * from './core.js';
import type { Report, Config, Rule } from './core.js';
export const RULES: Record<string, Rule>;
export const DEFAULT_SECTIONS: Record<string, string[]>;
export interface LintOptions { file?: string; require?: string[]; sections?: Record<string, string[]>; minWords?: number; checkLinks?: boolean; timeout?: number; now?: Date; fetchImpl?: typeof fetch }
export function check(dir: string, opts?: LintOptions, config?: Config & { require?: string[]; sections?: Record<string, string[]>; minWords?: number; ignoreUrls?: string[]; checkLinks?: boolean }, configFile?: string): Promise<Report & { info: { file: string; words: number; sections: string[]; badges: number; links: number } }>;
export function analyze(dir: string, opts?: LintOptions): { info: object; findings: import('./core.js').Finding[] };
export function findReadme(dir: string): string | null;
export function slug(heading: string): string;
export function scan(markdown: string): { lines: string[]; headings: { level: number; title: string; line: number; slug: string }[]; sections: object[]; codeBlocks: { lang: string; start: number; end?: number; text: string }[]; links: { kind: 'link' | 'image'; url: string; text: string; line: number; badge?: boolean }[]; anchors: Set<string> };
export function installCommands(md: ReturnType<typeof scan>): { tool: string; verb: string; flags: string[]; pkgs: string[]; line: number; raw: string }[];
