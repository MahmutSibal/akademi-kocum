import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const L0 = "const crypto = require('crypto');\n\n";
const L1 = "const JWT_SECRET = $env.JWT_SECRET || '';\n\n";
const L3 = "const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');\n\n";
const L4 = "const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');\n\n";
const L6 = "/** Authorization: Bearer <jwt> başlığını doğrular; geçerliyse claim'leri döndürür. */\nfunction verifyToken(headers) {\n  const m = /^Bearer\\s+(.+)$/i.exec((headers && headers.authorization) || '');\n  if (!m || !JWT_SECRET) return null;\n  const parts = m[1].split('.');\n  if (parts.length !== 3) return null;\n  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());\n  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;\n  try {\n    const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));\n    return claims.exp > Date.now() / 1000 ? claims : null;\n  } catch {\n    return null;\n  }\n}\n\n";
const L7 = "/** Doğrulama hatası: IF düğümü ok=false görünce doğrudan yanıtlar. */\nconst fail = (status, error, extra = {}) => [{ json: { ok: false, status, body: { error, ...extra } } }];\n\n";
const L8 = "/** SQL'e gidecek veri: UTF-16LE JSON -> base64 (dbo.fn_DecodePayload çözer). */\nconst toPayload = (obj) => Buffer.from(JSON.stringify(obj), 'utf16le').toString('base64');\n\n";
const L9 = "const toId = (v) => {\n  const n = Number(v);\n  return Number.isInteger(n) && n > 0 ? n : null;\n};\n\n";
const L10 = "/** Token'ı doğrular, gövdede userId varsa token ile eşleştiğini kontrol eder. */\nfunction requireUser(req) {\n  const claims = verifyToken(req.headers);\n  if (!claims) return { error: fail(401, 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.') };\n  const bodyUser = req.body && req.body.userId;\n  if (bodyUser !== undefined && bodyUser !== null && Number(bodyUser) !== Number(claims.sub)) {\n    return { error: fail(403, 'Bu işlem için yetkiniz yok.') };\n  }\n  return { userId: Number(claims.sub) };\n}\n\n";
const L11 = "/** Metni temizler: kontrol karakterleri, fazla boşluk ve satırlar. */\nconst cleanText = (s) =>\n  String(s || '')\n    .replace(/\\r\\n?/g, '\\n')\n    .replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, '')\n    .replace(/[ \\t ]+/g, ' ')\n    .replace(/ *\\n */g, '\\n')\n    .replace(/\\n{3,}/g, '\\n\\n')\n    .trim();\n\n";
const L12 = "const OLLAMA = {\n  url: `${($env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\\/$/, '')}/api/chat`,\n  model: $env.OLLAMA_MODEL || 'qwen2.5:7b',\n  numCtx: Number($env.OLLAMA_NUM_CTX || 8192),\n  timeout: Number($env.OLLAMA_TIMEOUT_MS || 180000),\n  // Modele verilecek en uzun not metni (bağlam penceresini aşmamak için)\n  maxInputChars: Number($env.MAX_LLM_INPUT_CHARS || 12000),\n};\n\n";
const L13 = "/** format: undefined (serbest metin), 'json' veya bir JSON şeması. */\nfunction chatRequest(messages, { temperature = 0.4, format } = {}) {\n  const body = {\n    model: OLLAMA.model,\n    messages,\n    stream: false,\n    keep_alive: $env.OLLAMA_KEEP_ALIVE || '30m',\n    options: { temperature, num_ctx: OLLAMA.numCtx },\n  };\n  if (format) body.format = format;\n  return { url: OLLAMA.url, body, timeout: OLLAMA.timeout };\n}\n\n";
const L14 = "// Qwen modelleri bazen Türkçe harfleri, UTF-8 baytlarının GBK okunuşu olan\n// Çince karakterlerle yazar (ı -> 谋, ş -> 艧 ...). Bunları geri çeviririz.\nconst MOJIBAKE = { '莽': 'ç', '脟': 'Ç', '臒': 'ğ', '臑': 'Ğ', '谋': 'ı', '陌': 'İ', '枚': 'ö', '脰': 'Ö', '艧': 'ş', '艦': 'Ş', '眉': 'ü', '脺': 'Ü', '芒': 'â', '脗': 'Â', '卯': 'î', '脦': 'Î', '没': 'û', '脹': 'Û' };\n\n";
const L15 = "const MOJIBAKE_RE = new RegExp(`[${Object.keys(MOJIBAKE).join('')}]`, 'g');\n\n";
const L16 = "const fixTurkish = (s) => String(s || '').replace(MOJIBAKE_RE, (c) => MOJIBAKE[c]);\n\n";
const L18 = "const truncate = (s, n = OLLAMA.maxInputChars) => (s.length > n ? `${s.slice(0, n)}\\n[... metin kısaltıldı ...]` : s);\n\n";
const L19 = "/** Modelin JSON yanıtını ayrıştırır; ```json bloklarını da tolere eder. */\nfunction parseModelJson(raw) {\n  const text = fixTurkish(raw).trim().replace(/^```(?:json)?\\s*/i, '').replace(/```$/, '');\n  try {\n    return JSON.parse(text);\n  } catch {\n    const s = text.indexOf('{');\n    const e = text.lastIndexOf('}');\n    if (s >= 0 && e > s) {\n      try {\n        return JSON.parse(text.slice(s, e + 1));\n      } catch {\n        /* aşağıda null */\n      }\n    }\n    return null;\n  }\n}\n\n";

const n0 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: generate-quiz", "position": [0,300], "webhookId": "6fa7d630-5be4-b921-dbe7-f77363e51d1c",
  "parameters": { "httpMethod": "POST", "path": "generate-quiz", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Girdiyi doğrula", "position": [240,300],
  "parameters": { "jsCode": L0 + L1 + L3 + L4 + L6 + L7 + L8 + L9 + L10 + L11 + "const req = $input.first().json;\nconst auth = requireUser(req);\nif (auth.error) return auth.error;\nconst body = req.body || {};\nconst noteId = toId(body.noteId);\nconst questionCount = body.questionCount === undefined ? 5 : Number(body.questionCount);\nif (!noteId) return fail(400, 'noteId geçersiz.');\nif (!Number.isInteger(questionCount) || questionCount < 5 || questionCount > 10) return fail(400, 'Soru sayısı 5 ile 10 arasında olmalı.');\n// İsteğe bağlı: yalnızca bir konuya odaklanan test (ör. yanlış yapılan konu)\nconst focusTopic = cleanText(body.focusTopic).replace(/\\n/g, ' ').slice(0, 100) || null;\n// Zorluk: otomatik (geçmiş başarıya göre) veya elle kolay/orta/zor\nconst difficulty = String(body.difficulty || 'otomatik').toLocaleLowerCase('tr');\nif (!['otomatik', 'kolay', 'orta', 'zor'].includes(difficulty)) return fail(400, 'difficulty: otomatik, kolay, orta veya zor olmalı.');\nreturn [{ json: { ok: true, userId: auth.userId, noteId, questionCount, focusTopic, difficulty, payload: toPayload({ userId: auth.userId, noteId }) } }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: notu getir", "position": [720,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "notes": "Not + son 3 testin başarısı", "notesInFlow": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @u INT = JSON_VALUE(@j, '$.userId'), @nid INT = JSON_VALUE(@j, '$.noteId');\nSELECT n.Id AS noteId, n.CourseId AS courseId, n.Title AS title, n.Content AS content, c.Name AS courseName,\n       -- Uyarlanabilir zorluk için: bu dersteki son 3 testin başarı yüzdesi\n       p.recentRate, ISNULL(p.recentCount, 0) AS recentCount\nFROM (SELECT 1 AS x) d\nLEFT JOIN dbo.Notes n ON n.Id = @nid AND n.UserId = @u\nLEFT JOIN dbo.Courses c ON c.Id = n.CourseId\nOUTER APPLY (\n    SELECT CAST(100.0 * SUM(t.Score) / NULLIF(SUM(t.Total), 0) AS DECIMAL(5,1)) AS recentRate, COUNT(*) AS recentCount\n    FROM (SELECT TOP 3 r.Score, r.Total\n          FROM dbo.QuizResults r JOIN dbo.Quizzes q ON q.Id = r.QuizId\n          WHERE r.UserId = @u AND q.CourseId = n.CourseId\n          ORDER BY r.CreatedAt DESC) t\n) p;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Not var mı?", "position": [960,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "b56ce2f6-606e-42b4-6f38-2f9ccb9e7cab", "leftValue": expr("{{ !!$json.noteId }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Not bulunamadı", "position": [1200,520],
  "parameters": { "jsCode": "return [{ json: { status: 404, body: { error: 'Not bulunamadı.' } } }];" }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Prompt hazırla", "position": [1200,220],
  "parameters": { "jsCode": L12 + L13 + L18 + "const v = $('Girdiyi doğrula').first().json;\nconst note = $input.first().json;\nconst n = v.questionCount;\n\n// Uyarlanabilir zorluk: son 3 testte %80+ -> zor, %50 altı -> kolay, aksi halde orta\nlet difficulty = v.difficulty;\nlet difficultyReason = 'Zorluğu sen seçtin.';\nif (difficulty === 'otomatik') {\n  const rate = note.recentRate === null || note.recentRate === undefined ? null : Number(note.recentRate);\n  if (rate === null) {\n    difficulty = 'orta';\n    difficultyReason = 'Bu derste henüz test çözmediğin için orta seviyeyle başlandı.';\n  } else {\n    difficulty = rate >= 80 ? 'zor' : rate < 50 ? 'kolay' : 'orta';\n    difficultyReason = `Bu dersteki son ${note.recentCount} testte başarın %${Math.round(rate)} olduğu için seçildi.`;\n  }\n}\nconst LEVEL = {\n  kolay: 'KOLAY: Nottaki tanımları ve temel bilgileri doğrudan soran sorular. Çeldiriciler açıkça yanlış olsun.',\n  orta: 'ORTA: Kavramların anlaşılıp anlaşılmadığını ölçen sorular. Çeldiriciler makul ama ayırt edilebilir olsun.',\n  zor: 'ZOR: Kavramları karşılaştırma, uygulama ve çıkarım yapma gerektiren, birkaç bilgiyi birleştiren sorular. Çeldiriciler birbirine yakın ve dikkat gerektiren türden olsun.',\n};\n\n// Ollama structured output: çıktı bu JSON şemasına zorlanır\nconst schema = {\n  type: 'object',\n  properties: {\n    questions: {\n      type: 'array', minItems: n, maxItems: n,\n      items: {\n        type: 'object',\n        properties: {\n          question: { type: 'string' },\n          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },\n          correct_answer: { type: 'string' },\n          explanation: { type: 'string' },\n          topic: { type: 'string' },\n        },\n        required: ['question', 'options', 'correct_answer', 'explanation', 'topic'],\n      },\n    },\n  },\n  required: ['questions'],\n};\n\n// PROMPT (test üretimi): yalnızca JSON, nota dayalı, tam 4 seçenek, cevap seçeneklerden biri\nconst system = 'Sen üniversite dersleri için çoktan seçmeli sınav soruları hazırlayan bir eğitim uzmanısın. Yalnızca geçerli JSON üretirsin; JSON dışında hiçbir metin yazmazsın. Tüm içerik Türkçe olmalı ve yalnızca Latin alfabesi kullanılmalıdır.';\nconst user = [\n  `Aşağıdaki ders notundan TAM OLARAK ${n} adet çoktan seçmeli soru hazırla.`,\n  '',\n  `Zorluk seviyesi — ${LEVEL[difficulty]}`,\n  '',\n  'Kurallar:',\n  '- Her soru yalnızca nottaki bilgilere dayanmalı.',\n  '- Her sorunun TAM 4 seçeneği olmalı; seçenekler birbirinden farklı, kısa ve akla yatkın olmalı.',\n  '- \"correct_answer\", seçeneklerden birinin metniyle BİREBİR aynı olmalı.',\n  '- \"explanation\": doğru cevabın neden doğru olduğunu 1-2 cümleyle açıkla.',\n  '- \"topic\": sorunun ölçtüğü konuyu 2-4 kelimeyle yaz (ör. \"Flutter temelleri\").',\n  v.focusTopic\n    ? `- Soruların HEPSİ \"${v.focusTopic}\" konusunu ölçsün; notun bu konuyla ilgili bölümlerine odaklan, farklı açılardan sor ve \"topic\" alanına bu konuyu yaz.`\n    : '- Sorular notun farklı bölümlerini kapsasın; aynı soruyu tekrar etme.',\n  '',\n  'Çıktı biçimi:',\n  '{\"questions\":[{\"question\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],\"correct_answer\":\"...\",\"explanation\":\"...\",\"topic\":\"...\"}]}',\n  '',\n  `DERS NOTU (\"${note.title}\"):`,\n  '\"\"\"',\n  truncate(note.content),\n  '\"\"\"',\n].join('\\n');\n\nreturn [{ json: {\n  noteId: note.noteId, courseId: note.courseId, title: note.title, questionCount: n, difficulty, difficultyReason,\n  ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.5, format: schema }),\n} }];" }
}, output: [{}] });
const n7 = node({ type: "n8n-nodes-base.httpRequest", version: 4.2, config: {
  "name": "Ollama: test üret", "position": [1440,220], "onError": "continueErrorOutput", "notes": "format: JSON şeması", "notesInFlow": true,
  "parameters": { "method": "POST", "url": expr("{{ $json.ollama.url }}"), "sendBody": true, "specifyBody": "json", "jsonBody": expr("{{ JSON.stringify($json.ollama.body) }}"), "options": { "timeout": expr("{{ $json.ollama.timeout }}") } }
}, output: [{}] });
const n8 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Şemayı doğrula", "position": [1680,220], "notes": "Şema doğrulama (max 2 yeniden deneme)", "notesInFlow": true,
  "parameters": { "jsCode": L14 + L15 + L16 + L19 + "const base = $('Prompt hazırla').first().json;\nconst n = base.questionCount;\nconst attempt = $runIndex + 1; // bu düğüm her denemede bir kez çalışır\nconst maxRetries = Number($env.QUIZ_MAX_RETRIES ?? 2);\nconst raw = String(($input.first().json.message || {}).content || '');\nconst errors = [];\nconst data = parseModelJson(raw);\nconst str = (x) => (typeof x === 'string' ? x.trim() : '');\n\nif (!data || !Array.isArray(data.questions)) errors.push('\"questions\" dizisi yok veya JSON geçersiz');\nconst list = data && Array.isArray(data.questions) ? data.questions : [];\nif (list.length < n) errors.push(`${n} soru istendi, ${list.length} geldi`);\n\nconst questions = [];\nlist.slice(0, n).forEach((q, i) => {\n  const where = `Soru ${i + 1}`;\n  const question = str(q && q.question);\n  const options = Array.isArray(q && q.options) ? q.options.map(str) : [];\n  const explanation = str(q && q.explanation);\n  const topic = str(q && q.topic);\n  let correct = str(q && q.correct_answer);\n\n  if (!question) errors.push(`${where}: soru metni boş`);\n  if (options.length !== 4 || options.some((o) => !o)) { errors.push(`${where}: tam 4 dolu seçenek olmalı`); return; }\n  if (new Set(options.map((o) => o.toLocaleLowerCase('tr'))).size !== 4) errors.push(`${where}: seçenekler birbirinden farklı olmalı`);\n  if (!explanation) errors.push(`${where}: açıklama boş`);\n  if (!topic) errors.push(`${where}: konu boş`);\n\n  // correct_answer seçeneklerden biri olmalı. \"B\" veya \"B) metin\" gibi biçimler tolere edilir.\n  let idx = options.indexOf(correct);\n  if (idx < 0) idx = options.findIndex((o) => o.toLocaleLowerCase('tr') === correct.toLocaleLowerCase('tr'));\n  if (idx < 0) {\n    const m = /^([A-Da-d])(?:[).:\\-\\s]|$)/.exec(correct);\n    if (m) idx = 'ABCD'.indexOf(m[1].toUpperCase());\n  }\n  if (idx < 0) { errors.push(`${where}: correct_answer seçeneklerden biri değil`); return; }\n  correct = options[idx];\n\n  // Model doğru cevabı sık sık A'ya koyar: seçenekleri karıştır\n  const shuffled = [...options];\n  for (let k = shuffled.length - 1; k > 0; k--) {\n    const r = Math.floor(Math.random() * (k + 1));\n    [shuffled[k], shuffled[r]] = [shuffled[r], shuffled[k]];\n  }\n  questions.push({\n    questionIndex: i,\n    question: question.slice(0, 2000),\n    options: shuffled.map((o) => o.slice(0, 500)),\n    correctAnswer: 'ABCD'[shuffled.indexOf(correct)],\n    explanation: explanation.slice(0, 2000),\n    topic: topic.slice(0, 200),\n  });\n});\n\nif (!errors.length) return [{ json: { valid: true, attempt, questions } }];\nconsole.log(`[generate-quiz] deneme ${attempt} geçersiz: ${errors.join('; ')}`);\nreturn [{ json: {\n  valid: false, retry: attempt <= maxRetries, attempt, errors, lastRaw: raw.slice(0, 4000),\n  status: 502, body: { error: `Model ${attempt} denemede geçerli bir test üretemedi. Lütfen tekrar deneyin.`, details: errors.slice(0, 5) },\n} }];" }
}, output: [{}] });
const n9 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli JSON mu?", "position": [1920,220],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "5f94cc4c-186d-58af-a186-df6f240e148f", "leftValue": expr("{{ $json.valid }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n10 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Deneme hakkı var mı?", "position": [2160,400],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "51e2f91c-d078-c406-4a5a-b94463326c68", "leftValue": expr("{{ $json.retry }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n11 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Yeniden dene", "position": [2400,400],
  "parameters": { "jsCode": "const base = $('Prompt hazırla').first().json;\nconst v = $input.first().json;\nconst body = JSON.parse(JSON.stringify(base.ollama.body));\nbody.messages.push(\n  { role: 'assistant', content: v.lastRaw || '(boş)' },\n  { role: 'user', content: `Önceki çıktın şu nedenlerle geçersizdi: ${v.errors.slice(0, 6).join('; ')}. Kuralları uygulayarak TAM OLARAK ${base.questionCount} soru içeren, yalnızca geçerli JSON üret.` },\n);\nbody.options.temperature = 0.2;\nreturn [{ json: { ollama: { ...base.ollama, body } } }];" }
}, output: [{}] });
const n12 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Kayıt verisi", "position": [2160,140],
  "parameters": { "jsCode": L8 + "const base = $('Prompt hazırla').first().json;\nconst v = $('Girdiyi doğrula').first().json;\nconst questions = $input.first().json.questions.map((q) => ({\n  questionIndex: q.questionIndex, question: q.question,\n  optionA: q.options[0], optionB: q.options[1], optionC: q.options[2], optionD: q.options[3],\n  correctAnswer: q.correctAnswer, explanation: q.explanation, topic: q.topic,\n}));\nreturn [{ json: { payload: toPayload({\n  userId: v.userId, courseId: base.courseId, noteId: base.noteId,\n  difficulty: base.difficulty, focusTopic: v.focusTopic, questions,\n}) } }];" }
}, output: [{}] });
const n13 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: test + soruları kaydet", "position": [2400,140], "onError": "continueErrorOutput", "alwaysOutputData": true, "notes": "Quizzes + QuizQuestions tek transaction", "notesInFlow": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON; SET XACT_ABORT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @u INT = JSON_VALUE(@j, '$.userId'), @c INT = JSON_VALUE(@j, '$.courseId'), @n INT = JSON_VALUE(@j, '$.noteId');\n\nBEGIN TRAN;\nDECLARE @t TABLE (Id INT);\nINSERT dbo.Quizzes (UserId, CourseId, NoteId, Difficulty, FocusTopic) OUTPUT inserted.Id INTO @t\nVALUES (@u, @c, @n, JSON_VALUE(@j, '$.difficulty'), JSON_VALUE(@j, '$.focusTopic'));\nDECLARE @qid INT = (SELECT Id FROM @t);\n\nINSERT dbo.QuizQuestions (QuizId, QuestionIndex, QuestionText, OptionA, OptionB, OptionC, OptionD, CorrectAnswer, Explanation, Topic)\nSELECT @qid, questionIndex, question, optionA, optionB, optionC, optionD, correctAnswer, explanation, topic\nFROM OPENJSON(@j, '$.questions') WITH (\n    questionIndex INT, question NVARCHAR(MAX),\n    optionA NVARCHAR(500), optionB NVARCHAR(500), optionC NVARCHAR(500), optionD NVARCHAR(500),\n    correctAnswer CHAR(1), explanation NVARCHAR(MAX), topic NVARCHAR(200));\nCOMMIT;\nSELECT @qid AS quizId;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n14 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Cevapları gizle", "position": [2640,140],
  "parameters": { "jsCode": "const base = $('Prompt hazırla').first().json;\nconst qs = $('Şemayı doğrula').last().json.questions;\n// İstemciye correct_answer ve explanation GÖNDERİLMEZ\nconst questions = qs.map((q) => ({ questionIndex: q.questionIndex, question: q.question, options: q.options, topic: q.topic }));\nconst focusTopic = $('Girdiyi doğrula').first().json.focusTopic;\nreturn [{ json: { status: 201, body: {\n  quizId: $input.first().json.quizId, noteId: base.noteId, courseId: base.courseId, title: base.title,\n  focusTopic, difficulty: base.difficulty, difficultyReason: base.difficultyReason, questions,\n} } }];" }
}, output: [{}] });
const n15 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: veritabanı", "position": [2640,600],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];" }
}, output: [{}] });
const n16 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: Ollama", "position": [1680,520],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[llm-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 502, body: { error: 'Yapay zekâ servisine ulaşılamadı veya yanıt zaman aşımına uğradı. Ollama çalışıyor mu?' } } }];" }
}, output: [{}] });
const n17 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [2880,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akGenerateQuiz01", "05 - Test Oluşturma (POST /webhook/generate-quiz)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n2))
  .add(n2.output(0).to(n3))
  .add(n2.output(1).to(n17))
  .add(n3.output(0).to(n4))
  .add(n3.onError(n15))
  .add(n4.output(0).to(n6))
  .add(n4.output(1).to(n5))
  .add(n6.output(0).to(n7))
  .add(n7.output(0).to(n8))
  .add(n7.onError(n16))
  .add(n8.output(0).to(n9))
  .add(n9.output(0).to(n12))
  .add(n9.output(1).to(n10))
  .add(n10.output(0).to(n11))
  .add(n10.output(1).to(n17))
  .add(n11.output(0).to(n7))
  .add(n12.output(0).to(n13))
  .add(n13.output(0).to(n14))
  .add(n13.onError(n15))
  .add(n14.output(0).to(n17))
  .add(n5.output(0).to(n17))
  .add(n15.output(0).to(n17))
  .add(n16.output(0).to(n17));
