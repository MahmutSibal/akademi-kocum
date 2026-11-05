// Ollama model karşılaştırması: iş akışlarıyla aynı prompt ve JSON şemasıyla
// test üretimi + özet görevlerini her modelde çalıştırır, sonuçları raporlar.
//
// Kullanım:  node backend/tests/benchmark-models.mjs [model1 model2 ...] [--runs=3]
// Çıktı:     docs/model-karsilastirma.md, backend/tests/benchmark-results.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OLLAMA = process.env.OLLAMA_URL || 'http://localhost:11434';
const args = process.argv.slice(2);
const RUNS = Number((args.find((a) => a.startsWith('--runs=')) || '--runs=3').split('=')[1]);
const MODELS = args.filter((a) => !a.startsWith('--'));
if (!MODELS.length) MODELS.push('qwen2.5:3b', 'qwen2.5:7b', 'gemma4:12b');
const NOTE = readFileSync(join(here, 'payloads', 'ornek-not.txt'), 'utf8');
const N = 5;

// --- Workflow 05 ile aynı prompt + şema -----------------------------------------
const quizSchema = {
  type: 'object',
  properties: { questions: { type: 'array', minItems: N, maxItems: N, items: {
    type: 'object',
    properties: {
      question: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
      correct_answer: { type: 'string' }, explanation: { type: 'string' }, topic: { type: 'string' },
    },
    required: ['question', 'options', 'correct_answer', 'explanation', 'topic'],
  } } },
  required: ['questions'],
};
const quizMessages = [
  { role: 'system', content: 'Sen üniversite dersleri için çoktan seçmeli sınav soruları hazırlayan bir eğitim uzmanısın. Yalnızca geçerli JSON üretirsin; JSON dışında hiçbir metin yazmazsın. Tüm içerik Türkçe olmalı ve yalnızca Latin alfabesi kullanılmalıdır.' },
  { role: 'user', content: [
    `Aşağıdaki ders notundan TAM OLARAK ${N} adet çoktan seçmeli soru hazırla.`, '', 'Kurallar:',
    '- Her soru yalnızca nottaki bilgilere dayanmalı.',
    '- Her sorunun TAM 4 seçeneği olmalı; seçenekler birbirinden farklı, kısa ve akla yatkın olmalı.',
    '- "correct_answer", seçeneklerden birinin metniyle BİREBİR aynı olmalı.',
    '- "explanation": doğru cevabın neden doğru olduğunu 1-2 cümleyle açıkla.',
    '- "topic": sorunun ölçtüğü konuyu 2-4 kelimeyle yaz.',
    '', 'DERS NOTU:', '"""', NOTE, '"""',
  ].join('\n') },
];
const summaryMessages = [
  { role: 'system', content: 'Sen deneyimli bir üniversite asistanısın. Öğrencilerin ders notlarını Türkçe, doğru ve öğretici biçimde özetlersin. Notta olmayan bilgi eklemezsin. Yalnızca Türkçe Latin harfleri kullanırsın.' },
  { role: 'user', content: `Aşağıdaki ders notunu Türkçe özetle.\nBiçim: "Genel Bakış:" 2-3 cümle, "Anahtar Kavramlar:" 4-8 madde, "Sınavda Dikkat:" 2-3 madde.\n\nDERS NOTU:\n"""\n${NOTE}\n"""` },
];

// --- Workflow 05 "Şemayı doğrula" ile aynı kurallar -----------------------------
function validateQuiz(raw) {
  const errors = [];
  let data = null;
  try { data = JSON.parse(raw); } catch { errors.push('JSON ayrıştırılamadı'); }
  const list = data && Array.isArray(data.questions) ? data.questions : [];
  if (list.length < N) errors.push(`${list.length}/${N} soru`);
  list.slice(0, N).forEach((q, i) => {
    const opts = Array.isArray(q?.options) ? q.options.map((o) => String(o).trim()) : [];
    if (!String(q?.question || '').trim()) errors.push(`S${i + 1}: soru boş`);
    if (opts.length !== 4 || opts.some((o) => !o)) errors.push(`S${i + 1}: 4 seçenek yok`);
    else if (new Set(opts.map((o) => o.toLowerCase())).size !== 4) errors.push(`S${i + 1}: tekrar eden seçenek`);
    const c = String(q?.correct_answer || '').trim().toLowerCase();
    if (!opts.some((o) => o.toLowerCase() === c) && !/^[a-d]([).:\s-]|$)/.test(c)) errors.push(`S${i + 1}: cevap seçeneklerde yok`);
    if (!String(q?.explanation || '').trim() || !String(q?.topic || '').trim()) errors.push(`S${i + 1}: boş alan`);
  });
  return { valid: errors.length === 0, errors };
}

// Türkçe kalite sinyalleri: GBK mojibake (谋, 艧 ...) ve diğer alfabeler
const MOJIBAKE = /[莽脟臒臑谋陌枚脰艧艦眉脺]/g;
const FOREIGN = /[Ѐ-ӿ؀-ۿ぀-ヿ一-鿿]/g;
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/g;

async function supportsThinking(model) {
  const r = await fetch(`${OLLAMA}/api/show`, { method: 'POST', body: JSON.stringify({ model }) });
  const j = await r.json();
  return (j.capabilities || []).includes('thinking');
}

async function chat(model, messages, { format, temperature, think }) {
  const t0 = performance.now();
  const body = { model, messages, stream: false, keep_alive: '10m', options: { temperature, num_ctx: 8192 } };
  if (format) body.format = format;
  if (think !== undefined) body.think = think;
  const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', body: JSON.stringify(body) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return {
    text: j.message?.content || '',
    seconds: (performance.now() - t0) / 1000,
    tokensPerSec: j.eval_count && j.eval_duration ? j.eval_count / (j.eval_duration / 1e9) : null,
  };
}

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const results = [];

for (const model of MODELS) {
  console.log(`\n== ${model}`);
  const think = (await supportsThinking(model)) ? false : undefined;
  // Isınma: modeli belleğe yükler, ölçüme katılmaz
  const warm = await chat(model, [{ role: 'user', content: 'Merhaba' }], { temperature: 0, think });
  console.log(`   yükleme+ısınma: ${warm.seconds.toFixed(1)} sn`);

  const quiz = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await chat(model, quizMessages, { format: quizSchema, temperature: 0.5, think });
    const v = validateQuiz(r.text);
    quiz.push({ ...v, seconds: r.seconds, tokensPerSec: r.tokensPerSec, mojibake: (r.text.match(MOJIBAKE) || []).length, foreign: (r.text.match(FOREIGN) || []).length - (r.text.match(MOJIBAKE) || []).length });
    console.log(`   test ${i + 1}: ${v.valid ? 'GEÇERLİ' : 'GEÇERSİZ (' + v.errors.slice(0, 2).join(', ') + ')'} ${r.seconds.toFixed(1)} sn`);
  }
  const s = await chat(model, summaryMessages, { temperature: 0.3, think });
  console.log(`   özet: ${s.seconds.toFixed(1)} sn, ${s.text.length} karakter`);

  results.push({
    model,
    loadSeconds: warm.seconds,
    quizValidRate: quiz.filter((q) => q.valid).length / quiz.length,
    quizAvgSeconds: avg(quiz.map((q) => q.seconds)),
    tokensPerSec: avg(quiz.map((q) => q.tokensPerSec).filter(Boolean)),
    mojibake: quiz.reduce((a, q) => a + q.mojibake, 0) + (s.text.match(MOJIBAKE) || []).length,
    foreignChars: quiz.reduce((a, q) => a + Math.max(0, q.foreign), 0),
    summarySeconds: s.seconds,
    summaryTurkishRatio: s.text.length ? (s.text.match(TR_CHARS) || []).length / s.text.length : 0,
    summarySample: s.text.slice(0, 400),
    quizErrors: quiz.flatMap((q) => q.errors).slice(0, 6),
  });
}

writeFileSync(join(here, 'benchmark-results.json'), `${JSON.stringify({ date: new Date().toISOString(), runs: RUNS, results }, null, 2)}\n`);

const f1 = (x) => (x === null ? '—' : x.toFixed(1));
const rows = results.map((r) =>
  `| \`${r.model}\` | ${Math.round(r.quizValidRate * 100)}% (${Math.round(r.quizValidRate * RUNS)}/${RUNS}) | ${f1(r.quizAvgSeconds)} sn | ${f1(r.tokensPerSec)} | ${f1(r.summarySeconds)} sn | ${r.mojibake} | ${r.foreignChars} | ${f1(r.loadSeconds)} sn |`).join('\n');
const best = [...results].sort((a, b) => b.quizValidRate - a.quizValidRate || a.quizAvgSeconds - b.quizAvgSeconds)[0];
const md = `# Model Karşılaştırması

Ölçüm: \`node backend/tests/benchmark-models.mjs\` · ${new Date().toLocaleDateString('tr-TR')} · her model için ${RUNS} test üretimi + 1 özet.
Prompt ve JSON şeması **workflow 05 ile birebir aynıdır**; geçerlilik, workflow'daki "Şemayı doğrula" düğümünün kurallarıyla ölçülür
(tam ${N} soru, 4 farklı ve dolu seçenek, cevap seçeneklerden biri, boş alan yok). Donanım: RTX 5060 Laptop (8 GB), 32 GB RAM.

| Model | Geçerli test JSON'u | Test süresi (ort.) | Token/sn | Özet süresi | Bozuk Türkçe karakter* | Yabancı alfabe | Yükleme |
|---|---|---|---|---|---|---|---|
${rows}

\\* Qwen modellerinin Türkçe harfleri GBK okunuşuyla (ı → 谋, ş → 艧) yazması; workflow'lar bunu \`fixTurkish()\` ile düzeltir.
Yeniden deneme (en fazla 2) sayesinde tek denemede geçersiz olan çıktıların çoğu kullanıcıya hiç yansımaz.

## Sonuç (bu ölçümden)

${results.map((r) => `- **\`${r.model}\`**: ilk denemede geçerli JSON ${Math.round(r.quizValidRate * RUNS)}/${RUNS}, test ortalama ${f1(r.quizAvgSeconds)} sn, ${f1(r.tokensPerSec)} token/sn.${r.quizErrors.length ? ` Hatalar: ${[...new Set(r.quizErrors.map((e) => e.replace(/^S\\d+: /, '')))].join(', ')}.` : ''}`).join('\n')}
- Şemaya ilk denemede en iyi uyan: **\`${best.model}\`**; en hızlı: **\`${[...results].sort((a, b) => a.quizAvgSeconds - b.quizAvgSeconds)[0].model}\`**.
- Her denemede ${RUNS} örnek olduğu için oranlar kabaca yorumlanmalı; workflow'daki 2 yeniden deneme, ilk denemede geçersiz olan çıktıları kullanıcıya yansıtmadan düzeltir.

Model değiştirmek için \`.env\` → \`OLLAMA_MODEL\` (metin) ve \`OLLAMA_VISION_MODEL\` (fotoğraf).

## Örnek özet çıktıları

${results.map((r) => `**${r.model}**\n\n> ${r.summarySample.replace(/\n+/g, '\n> ')}…`).join('\n\n')}
`;
writeFileSync(join(here, '..', '..', 'docs', 'model-karsilastirma.md'), md);
console.log('\nYazıldı: docs/model-karsilastirma.md');
