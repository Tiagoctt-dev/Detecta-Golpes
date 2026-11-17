// Converte dist/index.html (arquivo único, para abrir direto no navegador/pendrive)
// em dist/detecta-golpes.html, sem doctype/html/head/body, para publicar como página no claude.ai.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');

const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';
const headKept = head
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
// Scripts de módulo vão depois do #root, para encontrar o elemento ao rodar.
const scripts = [...headKept.matchAll(/<script\b[\s\S]*?<\/script>/gi)].map((m) => m[0]);
const headNoScripts = headKept.replace(/<script\b[\s\S]*?<\/script>/gi, '');

const out = `${headNoScripts.trim()}\n${body.trim()}\n${scripts.join('\n')}\n`;
writeFileSync(path.join(dist, 'detecta-golpes.html'), out);
console.log(`detecta-golpes.html: ${(out.length / 1024).toFixed(0)} KB`);
