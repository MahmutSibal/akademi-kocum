// Workflow JSON'larını üretir:  node backend/n8n/build/build.mjs
// Çıktı: backend/n8n/workflows/*.json  (n8n'e import edilen dosyalar)
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerWorkflow, loginWorkflow, askWorkflow, summarizeWorkflow } from './wf-auth-ask-summarize.mjs';
import { generateQuizWorkflow, evaluateWorkflow } from './wf-quiz-evaluate.mjs';
import { dataWorkflow, studyPlanWorkflow, extractPdfWorkflow, errorWorkflow } from './wf-data-bonus.mjs';
import { flashcardsWorkflow, extractImageWorkflow, weeklyReportWorkflow } from './wf-extra.mjs';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'workflows');
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith('.json')) unlinkSync(join(outDir, f));

const files = {
  '00-error-handler.json': errorWorkflow,
  '01-register.json': registerWorkflow,
  '02-login.json': loginWorkflow,
  '03-ask.json': askWorkflow,
  '04-summarize.json': summarizeWorkflow,
  '05-generate-quiz.json': generateQuizWorkflow,
  '06-evaluate.json': evaluateWorkflow,
  '07-data.json': dataWorkflow,
  '08-study-plan.json': studyPlanWorkflow,
  '09-extract-pdf.json': extractPdfWorkflow,
  '10-flashcards.json': flashcardsWorkflow,
  '11-extract-image.json': extractImageWorkflow,
  '12-weekly-report.json': weeklyReportWorkflow,
};

for (const [file, make] of Object.entries(files)) {
  const wf = make().toJSON();
  // Bağlantıların gerçekten var olan düğümlere gittiğini kontrol et
  const names = new Set(wf.nodes.map((n) => n.name));
  for (const [from, c] of Object.entries(wf.connections)) {
    if (!names.has(from)) throw new Error(`${file}: bilinmeyen kaynak düğüm "${from}"`);
    for (const out of c.main) for (const t of out) if (!names.has(t.node)) throw new Error(`${file}: bilinmeyen hedef "${t.node}"`);
  }
  // Code düğümleri sözdizimi kontrolü
  for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
    try {
      new Function('$input', '$', '$env', '$runIndex', 'require', n.parameters.jsCode); // eslint-disable-line no-new-func
    } catch (e) {
      throw new Error(`${file} / ${n.name}: ${e.message}`);
    }
  }
  writeFileSync(join(outDir, file), `${JSON.stringify(wf, null, 2)}\n`, 'utf8');
  console.log(`✓ ${file}  (${wf.nodes.length} düğüm)`);
}
