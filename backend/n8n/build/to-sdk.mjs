// Workflow JSON'larını n8n Workflow SDK koduna çevirir (n8n MCP / bulut hesabına yüklemek için).
// Kullanım: node backend/n8n/build/to-sdk.mjs  ->  backend/n8n/sdk/*.js
// SDK ayrıştırıcısı fonksiyon tanımına izin vermez; ortak yardımcı kodlar her dosyada
// bir kez metin sabiti olarak tanımlanır ve Code düğümlerinde birleştirilir.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { body, splitDeclarations } from './lib.mjs';
import { authLib, ollamaLib } from './common.mjs';

const base = join(dirname(fileURLToPath(import.meta.url)), '..');
const inDir = join(base, 'workflows');
const outDir = join(base, 'sdk');
mkdirSync(outDir, { recursive: true });

const TRIGGERS = new Set(['n8n-nodes-base.webhook', 'n8n-nodes-base.errorTrigger', 'n8n-nodes-base.scheduleTrigger']);
const LIB_BLOCKS = [authLib, ollamaLib].flatMap((l) => splitDeclarations(body(l)));

/** '={{ ... }}' biçimindeki n8n ifadelerini expr('{{ ... }}') çağrısına çevirir. */
function toJs(value) {
  if (typeof value === 'string') return value.startsWith('=') ? `expr(${JSON.stringify(value.slice(1))})` : JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(toJs).join(', ')}]`;
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${toJs(v)}`).join(', ')} }`;
  return JSON.stringify(value);
}

/** jsCode'u [ortak blok indeksleri, ana gövde] olarak ayırır. */
function splitPrelude(js) {
  const used = [];
  let rest = js;
  LIB_BLOCKS.forEach((b, i) => {
    if (rest.startsWith(`${b.text}\n\n`)) {
      used.push(i);
      rest = rest.slice(b.text.length + 2);
    }
  });
  return { used, rest };
}

for (const file of readdirSync(inDir).filter((f) => f.endsWith('.json'))) {
  const wf = JSON.parse(readFileSync(join(inDir, file), 'utf8'));
  const vars = new Map(wf.nodes.map((n, i) => [n.name, `n${i}`]));
  const libUsed = new Set();
  const nodeLines = [];

  for (const n of wf.nodes) {
    const params = { ...n.parameters };
    let jsExpr = null;
    if (n.type === 'n8n-nodes-base.code') {
      const { used, rest } = splitPrelude(params.jsCode);
      used.forEach((i) => libUsed.add(i));
      jsExpr = [...used.map((i) => `L${i}`), JSON.stringify(rest)].join(' + ');
      delete params.jsCode;
    }
    let paramsJs = toJs(params);
    if (jsExpr) paramsJs = paramsJs === '{  }' ? `{ "jsCode": ${jsExpr} }` : paramsJs.replace(/ }$/, `, "jsCode": ${jsExpr} }`);

    const extras = [];
    for (const k of ['onError', 'alwaysOutputData', 'notes', 'notesInFlow', 'webhookId']) if (n[k] !== undefined) extras.push(`${JSON.stringify(k)}: ${toJs(n[k])}`);
    if (n.credentials) {
      // Hedef hesapta credential id'leri farklıdır: aynı adla yeni credential istenir
      extras.push(`"credentials": { ${Object.entries(n.credentials).map(([k, c]) => `${JSON.stringify(k)}: newCredential(${JSON.stringify(c.name)})`).join(', ')} }`);
    }
    const fn = TRIGGERS.has(n.type) ? 'trigger' : 'node';
    nodeLines.push(
      `const ${vars.get(n.name)} = ${fn}({ type: ${JSON.stringify(n.type)}, version: ${n.typeVersion}, config: {\n` +
        `  "name": ${JSON.stringify(n.name)}, "position": ${JSON.stringify(n.position)}${extras.length ? `, ${extras.join(', ')}` : ''},\n` +
        `  "parameters": ${paramsJs}\n}, output: [{}] });`,
    );
  }

  const lines = ["import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';", ''];
  for (const i of [...libUsed].sort((a, b) => a - b)) lines.push(`const L${i} = ${JSON.stringify(`${LIB_BLOCKS[i].text}\n\n`)};`);
  lines.push('', ...nodeLines, '');

  // Bağlantılar: her kenar ayrı ayrı eklenir (hata çıkışları ve döngüler dahil)
  const trig = wf.nodes.find((n) => TRIGGERS.has(n.type));
  const parts = [`export default workflow(${JSON.stringify(wf.id)}, ${JSON.stringify(wf.name)})`, `  .add(${vars.get(trig.name)})`];
  for (const [from, c] of Object.entries(wf.connections)) {
    const src = wf.nodes.find((n) => n.name === from);
    c.main.forEach((targets, out) => {
      for (const t of targets) {
        const isErr = src.onError === 'continueErrorOutput' && out === c.main.length - 1 && out > 0 && src.type !== 'n8n-nodes-base.if';
        parts.push(`  .add(${isErr ? `${vars.get(from)}.onError(${vars.get(t.node)})` : `${vars.get(from)}.output(${out}).to(${vars.get(t.node)})`})`);
      }
    });
  }
  lines.push(`${parts.join('\n')};`, '');
  const text = lines.join('\n');
  const out = file.replace(/\.json$/, '.js');
  writeFileSync(join(outDir, out), text, 'utf8');
  console.log(`${out}  ${(text.length / 1024).toFixed(1)} KB`);
}
