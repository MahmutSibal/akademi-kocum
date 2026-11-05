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
const L17 = "/** Ollama /api/chat yanıtındaki metin (Türkçe karakter düzeltmesiyle). */\nconst modelText = (res) => fixTurkish(((res && res.message) || {}).content).trim();\n\n";
const L18 = "const truncate = (s, n = OLLAMA.maxInputChars) => (s.length > n ? `${s.slice(0, n)}\\n[... metin kısaltıldı ...]` : s);\n\n";

const n0 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: summarize", "position": [0,300], "webhookId": "48877eb8-ad9d-53f9-408a-257803ad7920",
  "parameters": { "httpMethod": "POST", "path": "summarize", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Girdiyi doğrula + temizle", "position": [240,300],
  "parameters": { "jsCode": L0 + L1 + L3 + L4 + L6 + L7 + L8 + L9 + L10 + L11 + "const req = $input.first().json;\nconst auth = requireUser(req);\nif (auth.error) return auth.error;\nconst body = req.body || {};\nconst courseId = toId(body.courseId);\nconst title = cleanText(body.title).replace(/\\n/g, ' ').slice(0, 200) || 'Başlıksız not';\nconst content = cleanText(body.content);\nif (!courseId) return fail(400, 'Bir ders seçmelisiniz (courseId).');\nif (content.length < 50) return fail(400, 'Not metni en az 50 karakter olmalı.');\nif (content.length > 100000) return fail(413, 'Not metni en fazla 100.000 karakter olabilir.');\n\n// RAG için ~800 karakterlik, paragraf sınırlarına saygılı, 100 karakter örtüşmeli parçalar\nconst chunks = [];\nconst paragraphs = content.split(/\\n\\n+/);\nlet buf = '';\nfor (const p of paragraphs) {\n  if ((buf + '\\n\\n' + p).length > 800 && buf) {\n    chunks.push(buf.trim());\n    buf = buf.slice(-100) + '\\n\\n' + p;\n  } else {\n    buf = buf ? `${buf}\\n\\n${p}` : p;\n  }\n  while (buf.length > 1200) {\n    chunks.push(buf.slice(0, 800).trim());\n    buf = buf.slice(700);\n  }\n}\nif (buf.trim()) chunks.push(buf.trim());\n\nreturn [{ json: {\n  ok: true, userId: auth.userId, courseId, title, content,\n  chunks: chunks.map((c, i) => ({ chunkIndex: i, content: c })),\n  payload: toPayload({ userId: auth.userId, courseId }),\n} }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: ders sahibi mi?", "position": [720,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nSELECT COUNT(*) AS found FROM dbo.Courses\nWHERE Id = JSON_VALUE(@j, '$.courseId') AND UserId = JSON_VALUE(@j, '$.userId');", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Ders var mı?", "position": [960,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "08015c8a-45d2-7fe8-b040-ab1c93c42ecc", "leftValue": expr("{{ Number($json.found) === 1 }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Prompt hazırla", "position": [1200,220],
  "parameters": { "jsCode": L12 + L13 + L18 + "const v = $('Girdiyi doğrula + temizle').first().json;\n// PROMPT (özet): yapılandırılmış, yalnızca nottaki bilgiye dayanan Türkçe özet\nconst system = 'Sen deneyimli bir üniversite asistanısın. Öğrencilerin ders notlarını Türkçe, doğru ve öğretici biçimde özetlersin. Notta olmayan bilgi eklemezsin. Yalnızca Türkçe Latin harfleri kullanırsın; Çince veya başka alfabeden karakter kullanmazsın.';\nconst user = [\n  `Aşağıdaki \"${v.title}\" başlıklı ders notunu Türkçe özetle.`,\n  '',\n  'Biçim (başlıkları aynen kullan):',\n  'Genel Bakış: notun ana fikrini anlatan 2-3 cümle.',\n  'Anahtar Kavramlar: en önemli 4-8 kavram, her biri \"- Kavram: kısa açıklama\" satırı olarak.',\n  'Sınavda Dikkat: 2-3 maddelik hatırlatma, her biri \"- \" ile başlayan satır.',\n  '',\n  'Kurallar: Yalnızca notta geçen bilgilere dayan. Markdown başlık işareti (#) veya kalın yazı (**) kullanma.',\n  '',\n  'DERS NOTU:',\n  '\"\"\"',\n  truncate(v.content),\n  '\"\"\"',\n].join('\\n');\nreturn [{ json: { ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.3 }) } }];" }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Ders bulunamadı", "position": [1200,460],
  "parameters": { "jsCode": "return [{ json: { status: 404, body: { error: 'Ders bulunamadı.' } } }];" }
}, output: [{}] });
const n7 = node({ type: "n8n-nodes-base.httpRequest", version: 4.2, config: {
  "name": "Ollama: özetle", "position": [1440,220], "onError": "continueErrorOutput", "notes": "POST /api/chat", "notesInFlow": true,
  "parameters": { "method": "POST", "url": expr("{{ $json.ollama.url }}"), "sendBody": true, "specifyBody": "json", "jsonBody": expr("{{ JSON.stringify($json.ollama.body) }}"), "options": { "timeout": expr("{{ $json.ollama.timeout }}") } }
}, output: [{}] });
const n8 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Özeti al", "position": [1680,140],
  "parameters": { "jsCode": L7 + L8 + L14 + L15 + L16 + L17 + "const v = $('Girdiyi doğrula + temizle').first().json;\nconst summary = modelText($input.first().json).replace(/\\*\\*/g, '').replace(/^#+\\s*/gm, '').trim();\nif (!summary) return fail(502, 'Model boş özet döndürdü, lütfen tekrar deneyin.');\nreturn [{ json: { ok: true, summary, payload: toPayload({ userId: v.userId, courseId: v.courseId, title: v.title, content: v.content, summary, chunks: v.chunks }) } }];" }
}, output: [{}] });
const n9 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Özet var mı?", "position": [1920,140],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "6473da01-9253-98c4-657d-bfa537ec2b7a", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n10 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: not + parçaları kaydet", "position": [2160,140], "onError": "continueErrorOutput", "alwaysOutputData": true, "notes": "Not ve RAG parçaları tek transaction", "notesInFlow": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON; SET XACT_ABORT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @u INT = JSON_VALUE(@j, '$.userId'), @c INT = JSON_VALUE(@j, '$.courseId');\n\nBEGIN TRAN;\nDECLARE @t TABLE (Id INT);\nINSERT dbo.Notes (UserId, CourseId, Title, Content, Summary) OUTPUT inserted.Id INTO @t\nSELECT @u, @c, p.title, p.content, p.summary\nFROM OPENJSON(@j) WITH (title NVARCHAR(200), content NVARCHAR(MAX), summary NVARCHAR(MAX)) p\nWHERE EXISTS (SELECT 1 FROM dbo.Courses WHERE Id = @c AND UserId = @u);\n\nDECLARE @id INT = (SELECT Id FROM @t);\nIF @id IS NULL\nBEGIN\n    ROLLBACK;\n    SELECT CAST(NULL AS INT) AS noteId;\n    RETURN;\nEND\n\nINSERT dbo.NoteChunks (NoteId, ChunkIndex, Content)\nSELECT @id, chunkIndex, content FROM OPENJSON(@j, '$.chunks') WITH (chunkIndex INT, content NVARCHAR(MAX));\nCOMMIT;\nSELECT @id AS noteId;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n11 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Yanıtı biçimle", "position": [2400,60],
  "parameters": { "jsCode": "const v = $('Girdiyi doğrula + temizle').first().json;\nconst noteId = $input.first().json.noteId;\nif (!noteId) return [{ json: { status: 404, body: { error: 'Ders bulunamadı.' } } }];\nreturn [{ json: { status: 201, body: { noteId, courseId: v.courseId, title: v.title, summary: $('Özeti al').first().json.summary } } }];" }
}, output: [{}] });
const n12 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: veritabanı", "position": [2400,460],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];" }
}, output: [{}] });
const n13 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: Ollama", "position": [1680,380],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[llm-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 502, body: { error: 'Yapay zekâ servisine ulaşılamadı veya yanıt zaman aşımına uğradı. Ollama çalışıyor mu?' } } }];" }
}, output: [{}] });
const n14 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [2640,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akSummarizeNote1", "04 - Not Özetleme (POST /webhook/summarize)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n2))
  .add(n2.output(0).to(n3))
  .add(n2.output(1).to(n14))
  .add(n3.output(0).to(n4))
  .add(n3.onError(n12))
  .add(n4.output(0).to(n5))
  .add(n4.output(1).to(n6))
  .add(n5.output(0).to(n7))
  .add(n7.output(0).to(n8))
  .add(n7.onError(n13))
  .add(n8.output(0).to(n9))
  .add(n9.output(0).to(n10))
  .add(n9.output(1).to(n14))
  .add(n10.output(0).to(n11))
  .add(n10.onError(n12))
  .add(n11.output(0).to(n14))
  .add(n6.output(0).to(n14))
  .add(n12.output(0).to(n14))
  .add(n13.output(0).to(n14));
