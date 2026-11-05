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
const L12 = "const OLLAMA = {\n  url: `${($env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\\/$/, '')}/api/chat`,\n  model: $env.OLLAMA_MODEL || 'qwen2.5:7b',\n  numCtx: Number($env.OLLAMA_NUM_CTX || 8192),\n  timeout: Number($env.OLLAMA_TIMEOUT_MS || 180000),\n  // Modele verilecek en uzun not metni (bağlam penceresini aşmamak için)\n  maxInputChars: Number($env.MAX_LLM_INPUT_CHARS || 12000),\n};\n\n";
const L13 = "/** format: undefined (serbest metin), 'json' veya bir JSON şeması. */\nfunction chatRequest(messages, { temperature = 0.4, format } = {}) {\n  const body = {\n    model: OLLAMA.model,\n    messages,\n    stream: false,\n    keep_alive: $env.OLLAMA_KEEP_ALIVE || '30m',\n    options: { temperature, num_ctx: OLLAMA.numCtx },\n  };\n  if (format) body.format = format;\n  return { url: OLLAMA.url, body, timeout: OLLAMA.timeout };\n}\n\n";
const L14 = "// Qwen modelleri bazen Türkçe harfleri, UTF-8 baytlarının GBK okunuşu olan\n// Çince karakterlerle yazar (ı -> 谋, ş -> 艧 ...). Bunları geri çeviririz.\nconst MOJIBAKE = { '莽': 'ç', '脟': 'Ç', '臒': 'ğ', '臑': 'Ğ', '谋': 'ı', '陌': 'İ', '枚': 'ö', '脰': 'Ö', '艧': 'ş', '艦': 'Ş', '眉': 'ü', '脺': 'Ü', '芒': 'â', '脗': 'Â', '卯': 'î', '脦': 'Î', '没': 'û', '脹': 'Û' };\n\n";
const L15 = "const MOJIBAKE_RE = new RegExp(`[${Object.keys(MOJIBAKE).join('')}]`, 'g');\n\n";
const L16 = "const fixTurkish = (s) => String(s || '').replace(MOJIBAKE_RE, (c) => MOJIBAKE[c]);\n\n";
const L19 = "/** Modelin JSON yanıtını ayrıştırır; ```json bloklarını da tolere eder. */\nfunction parseModelJson(raw) {\n  const text = fixTurkish(raw).trim().replace(/^```(?:json)?\\s*/i, '').replace(/```$/, '');\n  try {\n    return JSON.parse(text);\n  } catch {\n    const s = text.indexOf('{');\n    const e = text.lastIndexOf('}');\n    if (s >= 0 && e > s) {\n      try {\n        return JSON.parse(text.slice(s, e + 1));\n      } catch {\n        /* aşağıda null */\n      }\n    }\n    return null;\n  }\n}\n\n";

const n0 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: evaluate", "position": [0,300], "webhookId": "e3677c29-eee2-7915-bc4f-53c2b57392a1",
  "parameters": { "httpMethod": "POST", "path": "evaluate", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Girdiyi doğrula", "position": [240,300],
  "parameters": { "jsCode": L0 + L1 + L3 + L4 + L6 + L7 + L8 + L9 + L10 + "const req = $input.first().json;\nconst auth = requireUser(req);\nif (auth.error) return auth.error;\nconst body = req.body || {};\nconst quizId = toId(body.quizId);\nif (!quizId) return fail(400, 'quizId geçersiz.');\nif (!Array.isArray(body.answers) || body.answers.length === 0 || body.answers.length > 50) return fail(400, 'answers bir dizi olmalı (1-50 eleman).');\n\nconst answers = [];\nfor (const a of body.answers) {\n  const questionIndex = Number(a && a.questionIndex);\n  if (!Number.isInteger(questionIndex) || questionIndex < 0) return fail(400, 'Her cevapta geçerli bir questionIndex olmalı.');\n  let selected = a.selected;\n  if (typeof selected === 'number' && selected >= 0 && selected <= 3) selected = 'ABCD'[selected];\n  selected = selected === null || selected === undefined || selected === '' ? null : String(selected).trim().toUpperCase();\n  if (selected !== null && !/^[ABCD]$/.test(selected)) return fail(400, 'selected alanı A, B, C, D veya null olmalı.');\n  answers.push({ questionIndex, selected });\n}\nreturn [{ json: { ok: true, userId: auth.userId, quizId, answers, payload: toPayload({ userId: auth.userId, quizId }) } }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: doğru cevapları getir", "position": [720,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nSELECT q.Id AS quizId, q.NoteId AS noteId, c.Name AS courseName, n.Title AS noteTitle,\n    (SELECT qq.Id AS id, qq.QuestionIndex AS questionIndex, qq.QuestionText AS question,\n            qq.OptionA AS a, qq.OptionB AS b, qq.OptionC AS c, qq.OptionD AS d,\n            qq.CorrectAnswer AS correct, qq.Explanation AS explanation, qq.Topic AS topic\n       FROM dbo.QuizQuestions qq WHERE qq.QuizId = q.Id ORDER BY qq.QuestionIndex FOR JSON PATH) AS questions\nFROM (SELECT 1 AS x) d\nLEFT JOIN dbo.Quizzes q ON q.Id = JSON_VALUE(@j, '$.quizId') AND q.UserId = JSON_VALUE(@j, '$.userId')\nLEFT JOIN dbo.Courses c ON c.Id = q.CourseId\nLEFT JOIN dbo.Notes n ON n.Id = q.NoteId;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Test var mı?", "position": [960,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "0932a6e2-6db1-ba0c-5ec2-c79cdc572037", "leftValue": expr("{{ !!$json.quizId }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Test bulunamadı", "position": [1200,560],
  "parameters": { "jsCode": "return [{ json: { status: 404, body: { error: 'Test bulunamadı.' } } }];" }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Puanla (kod)", "position": [1200,300],
  "parameters": { "jsCode": L12 + L13 + "// Puanlama LLM'e değil koda yaptırılır\nconst v = $('Girdiyi doğrula').first().json;\nconst quiz = $input.first().json;\nconst qs = JSON.parse(quiz.questions || '[]');\nconst selectedBy = new Map(v.answers.map((a) => [a.questionIndex, a.selected]));\n\nconst results = qs.map((q) => {\n  const selected = selectedBy.has(q.questionIndex) ? selectedBy.get(q.questionIndex) : null;\n  return {\n    questionId: q.id, questionIndex: q.questionIndex, question: q.question,\n    options: [q.a, q.b, q.c, q.d], selected, correctAnswer: q.correct,\n    isCorrect: selected === q.correct, explanation: q.explanation, topic: q.topic,\n  };\n});\nconst score = results.filter((r) => r.isCorrect).length;\nconst total = results.length;\nconst wrong = results.filter((r) => !r.isCorrect);\n\n// PROMPT (öneri): yanlış konulara göre kişiselleştirilmiş, somut çalışma önerisi (JSON)\nconst optionText = (r, letter) => (letter ? `${letter}) ${r.options['ABCD'.indexOf(letter)]}` : 'boş bırakıldı');\nconst wrongList = wrong.map((r, i) =>\n  `${i + 1}) Konu: ${r.topic}\\n   Soru: ${r.question}\\n   Öğrencinin cevabı: ${optionText(r, r.selected)}\\n   Doğru cevap: ${optionText(r, r.correctAnswer)}\\n   Açıklama: ${r.explanation}`).join('\\n');\nconst system = 'Sen öğrencilere kişiselleştirilmiş çalışma önerisi veren deneyimli ve destekleyici bir eğitim koçusun. Her zaman Türkçe ve yalnızca Latin alfabesiyle yazarsın. Yalnızca geçerli JSON üretirsin.';\nconst user = [\n  `Öğrenci \"${quiz.courseName}\" dersinin \"${quiz.noteTitle}\" notundan oluşturulan testte ${total} sorudan ${score} tanesini doğru yanıtladı (başarı yüzdesi: ${Math.round((100 * score) / Math.max(total, 1))}).`,\n  '',\n  'Yanlış yaptığı veya boş bıraktığı sorular:',\n  wrongList,\n  '',\n  'Bu sonuçlara göre öğrenciye kişiselleştirilmiş bir çalışma önerisi hazırla.',\n  'Kurallar:',\n  '- \"focusTopics\" yalnızca yanlış yapılan konulardan oluşsun; her biri için neden çalışması gerektiğini ve somut bir çalışma adımı yaz.',\n  '- \"studyPlan\" 3-5 adımlık, uygulanabilir bir plan olsun.',\n  '- Öğrenciye \"sen\" diye hitap et, cesaretlendirici ama net ol.',\n  '',\n  'JSON biçimi:',\n  '{\"summary\":\"1-2 cümlelik değerlendirme\",\"focusTopics\":[{\"topic\":\"...\",\"reason\":\"...\",\"action\":\"...\"}],\"studyPlan\":[\"...\",\"...\"],\"motivation\":\"kısa motive edici cümle\"}',\n].join('\\n');\nconst format = {\n  type: 'object',\n  properties: {\n    summary: { type: 'string' },\n    focusTopics: { type: 'array', items: { type: 'object', properties: { topic: { type: 'string' }, reason: { type: 'string' }, action: { type: 'string' } }, required: ['topic', 'reason', 'action'] } },\n    studyPlan: { type: 'array', items: { type: 'string' } },\n    motivation: { type: 'string' },\n  },\n  required: ['summary', 'focusTopics', 'studyPlan', 'motivation'],\n};\nreturn [{ json: {\n  quizId: v.quizId, noteId: quiz.noteId, noteTitle: quiz.noteTitle, courseName: quiz.courseName,\n  score, total, results, hasWrong: wrong.length > 0,\n  wrongTopics: [...new Set(wrong.map((r) => r.topic))],\n  ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.5, format }),\n} }];" }
}, output: [{}] });
const n7 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Yanlış var mı?", "position": [1440,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "24be1621-a0f4-eab1-cc0b-34be1b5d26ee", "leftValue": expr("{{ $json.hasWrong }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n8 = node({ type: "n8n-nodes-base.httpRequest", version: 4.2, config: {
  "name": "Ollama: öneri üret", "position": [1680,220], "onError": "continueErrorOutput", "notes": "Yanlış konular -> öneri", "notesInFlow": true,
  "parameters": { "method": "POST", "url": expr("{{ $json.ollama.url }}"), "sendBody": true, "specifyBody": "json", "jsonBody": expr("{{ JSON.stringify($json.ollama.body) }}"), "options": { "timeout": expr("{{ $json.ollama.timeout }}") } }
}, output: [{}] });
const n9 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Öneriyi biçimle", "position": [1920,220],
  "parameters": { "jsCode": L14 + L15 + L16 + L19 + "const s = $('Puanla (kod)').first().json;\nconst res = $input.first().json;\nlet detail = parseModelJson((res.message || {}).content);\nconst ok = detail && typeof detail.summary === 'string' && Array.isArray(detail.focusTopics);\nif (!ok) {\n  // Ollama hata verirse veya JSON bozuksa öneri yine üretilir (kural tabanlı yedek)\n  detail = {\n    summary: `${s.total} sorudan ${s.score} doğru yaptın. Aşağıdaki konuları tekrar etmen faydalı olacak.`,\n    focusTopics: s.wrongTopics.map((t) => ({ topic: t, reason: 'Bu konudaki soruyu yanlış yaptın.', action: 'Ders notundaki ilgili bölümü tekrar oku ve özet çıkar.' })),\n    studyPlan: ['Yanlış yaptığın soruların açıklamalarını oku.', 'İlgili konuları notundan tekrar et.', 'Aynı nottan yeni bir test oluşturup tekrar dene.'],\n    motivation: 'Her yanlış, öğrenmek için bir fırsat!',\n    fallback: true,\n  };\n}\nconst lines = [detail.summary, '', 'Odaklanman gereken konular:'];\nfor (const f of detail.focusTopics) lines.push(`• ${f.topic}: ${f.reason} → ${f.action}`);\nlines.push('', 'Çalışma planı:');\n(detail.studyPlan || []).forEach((p, i) => lines.push(`${i + 1}. ${p}`));\nif (detail.motivation) lines.push('', detail.motivation);\nreturn [{ json: { recommendation: lines.join('\\n'), recommendationDetail: detail } }];" }
}, output: [{}] });
const n10 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Tam puan önerisi", "position": [1920,420],
  "parameters": { "jsCode": "const s = $input.first().json;\nconst detail = {\n  summary: `Tebrikler! ${s.total} sorunun hepsini doğru yanıtladın.`,\n  focusTopics: [],\n  studyPlan: ['Bu notu birkaç gün sonra tekrar ederek kalıcılığı artır.', 'Daha fazla soruyla yeni bir test oluştur.', 'Bir sonraki konuya geç.'],\n  motivation: 'Harika gidiyorsun, aynen devam!',\n};\nconst recommendation = [detail.summary, '', 'Çalışma planı:', ...detail.studyPlan.map((p, i) => `${i + 1}. ${p}`), '', detail.motivation].join('\\n');\nreturn [{ json: { recommendation, recommendationDetail: detail } }];" }
}, output: [{}] });
const n11 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Kayıt verisi", "position": [2160,300],
  "parameters": { "jsCode": L8 + "const s = $('Puanla (kod)').first().json;\nconst v = $('Girdiyi doğrula').first().json;\nconst { recommendation, recommendationDetail } = $input.first().json;\nreturn [{ json: {\n  recommendation, recommendationDetail,\n  payload: toPayload({\n    userId: v.userId, quizId: s.quizId, score: s.score, total: s.total, recommendation,\n    answers: s.results.map((r) => ({ questionId: r.questionId, selected: r.selected, isCorrect: r.isCorrect })),\n  }),\n} }];" }
}, output: [{}] });
const n12 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: sonucu kaydet", "position": [2400,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "notes": "QuizResults + QuizAnswers tek transaction", "notesInFlow": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON; SET XACT_ABORT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\n\nBEGIN TRAN;\nDECLARE @t TABLE (Id INT);\nINSERT dbo.QuizResults (UserId, QuizId, Score, Total, Recommendation) OUTPUT inserted.Id INTO @t\nSELECT userId, quizId, score, total, recommendation\nFROM OPENJSON(@j) WITH (userId INT, quizId INT, score INT, total INT, recommendation NVARCHAR(MAX));\nDECLARE @rid INT = (SELECT Id FROM @t);\n\nINSERT dbo.QuizAnswers (ResultId, QuestionId, SelectedAnswer, IsCorrect)\nSELECT @rid, questionId, selected, isCorrect\nFROM OPENJSON(@j, '$.answers') WITH (questionId INT, selected CHAR(1), isCorrect BIT);\nCOMMIT;\nSELECT @rid AS resultId;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n13 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Yanıtı biçimle", "position": [2640,220],
  "parameters": { "jsCode": "const s = $('Puanla (kod)').first().json;\nconst k = $('Kayıt verisi').first().json;\nconst results = s.results.map(({ questionId, ...r }) => r);\nreturn [{ json: { status: 200, body: {\n  resultId: $input.first().json.resultId, quizId: s.quizId, noteId: s.noteId, noteTitle: s.noteTitle, courseName: s.courseName,\n  score: s.score, total: s.total,\n  percentage: Math.round((100 * s.score) / Math.max(s.total, 1)), results,\n  recommendation: k.recommendation, recommendationDetail: k.recommendationDetail,\n} } }];" }
}, output: [{}] });
const n14 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: veritabanı", "position": [2640,520],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];" }
}, output: [{}] });
const n15 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [2880,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akEvaluateQuiz01", "06 - Performans Değerlendirme (POST /webhook/evaluate)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n2))
  .add(n2.output(0).to(n3))
  .add(n2.output(1).to(n15))
  .add(n3.output(0).to(n4))
  .add(n3.onError(n14))
  .add(n4.output(0).to(n6))
  .add(n4.output(1).to(n5))
  .add(n6.output(0).to(n7))
  .add(n7.output(0).to(n8))
  .add(n7.output(1).to(n10))
  .add(n8.output(0).to(n9))
  .add(n8.onError(n9))
  .add(n9.output(0).to(n11))
  .add(n10.output(0).to(n11))
  .add(n11.output(0).to(n12))
  .add(n12.output(0).to(n13))
  .add(n12.onError(n14))
  .add(n13.output(0).to(n15))
  .add(n5.output(0).to(n15))
  .add(n14.output(0).to(n15));
