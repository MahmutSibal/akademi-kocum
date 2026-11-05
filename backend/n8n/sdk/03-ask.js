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
  "name": "Webhook: ask", "position": [0,300], "webhookId": "5b127709-b6ec-7b60-d9c9-cd342477b59f",
  "parameters": { "httpMethod": "POST", "path": "ask", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Girdiyi doğrula", "position": [240,300],
  "parameters": { "jsCode": L0 + L1 + L3 + L4 + L6 + L7 + L8 + L9 + L10 + L11 + "const req = $input.first().json;\nconst auth = requireUser(req);\nif (auth.error) return auth.error;\nconst body = req.body || {};\nconst question = cleanText(body.question);\nconst courseId = body.courseId === null || body.courseId === undefined || body.courseId === '' ? null : toId(body.courseId);\nif (body.courseId && !courseId) return fail(400, 'courseId geçersiz.');\nif (question.length < 2) return fail(400, 'Lütfen bir soru yazın.');\nif (question.length > 2000) return fail(400, 'Soru en fazla 2000 karakter olabilir.');\n\n// RAG: sorudan anahtar kelimeler (Türkçe ekleri kabaca atmak için 6 harfe kısaltılır)\nconst STOP = new Set(['nedir', 'nasıl', 'neden', 'hangi', 'için', 'gibi', 'olan', 'olarak', 'ile', 'bir', 'bu', 'şu', 've', 'veya',\n  'ama', 'daha', 'çok', 'ne', 'kadar', 'arasındaki', 'fark', 'farkı', 'açıkla', 'anlat', 'nelerdir', 'midir', 'mıdır', 'var', 'yok']);\nconst words = question.toLocaleLowerCase('tr').match(/[\\p{L}\\p{N}]+/gu) || [];\nconst keywords = [...new Set(words.filter((x) => x.length >= 3 && !STOP.has(x)).map((x) => (x.length > 6 ? x.slice(0, 6) : x)))].slice(0, 8);\nconst ftsQuery = keywords.map((k) => `\"${k}*\"`).join(' OR ');\nconst limit = Math.min(Math.max(Number($env.CHAT_HISTORY_LIMIT || 10), 0), 50);\n\nreturn [{ json: { ok: true, userId: auth.userId, courseId, question, payload: toPayload({ userId: auth.userId, courseId, limit, keywords, ftsQuery }) } }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: geçmiş + not bağlamı", "position": [720,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "notes": "Son N mesaj + RAG parçaları", "notesInFlow": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @u INT = JSON_VALUE(@j, '$.userId'),\n        @c INT = TRY_CAST(JSON_VALUE(@j, '$.courseId') AS INT),\n        @n INT = JSON_VALUE(@j, '$.limit'),\n        @fts NVARCHAR(4000) = JSON_VALUE(@j, '$.ftsQuery');\n\nIF @c IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Courses WHERE Id = @c AND UserId = @u)\nBEGIN\n    SELECT CAST(0 AS BIT) AS courseOk, CAST(NULL AS NVARCHAR(150)) AS courseName, CAST(NULL AS NVARCHAR(MAX)) AS history, CAST(NULL AS NVARCHAR(MAX)) AS chunks;\n    RETURN;\nEND\n\n-- RAG: soruyla ilgili not parçaları. Full-Text index varsa CONTAINSTABLE, yoksa anahtar kelime eşleşmesi.\nDECLARE @chunks TABLE (NoteId INT, Title NVARCHAR(200), Content NVARCHAR(MAX), Score INT);\nIF LEN(ISNULL(@fts, N'')) > 0\nBEGIN\n    IF OBJECTPROPERTY(OBJECT_ID(N'dbo.NoteChunks'), 'TableHasActiveFulltextIndex') = 1\n        INSERT @chunks\n        EXEC sp_executesql N'\n            SELECT TOP 4 n.Id, n.Title, ch.Content, ft.[RANK]\n            FROM CONTAINSTABLE(dbo.NoteChunks, Content, @q) ft\n            JOIN dbo.NoteChunks ch ON ch.Id = ft.[KEY]\n            JOIN dbo.Notes n ON n.Id = ch.NoteId\n            WHERE n.UserId = @u AND (@c IS NULL OR n.CourseId = @c)\n            ORDER BY ft.[RANK] DESC',\n            N'@q NVARCHAR(4000), @u INT, @c INT', @q = @fts, @u = @u, @c = @c;\n    ELSE\n        INSERT @chunks\n        SELECT TOP 4 n.Id, n.Title, ch.Content, s.Score\n        FROM (\n            SELECT ch2.Id, SUM(CASE WHEN ch2.Content LIKE N'%' + k.[value] + N'%' THEN 1 ELSE 0 END) AS Score\n            FROM dbo.NoteChunks ch2\n            JOIN dbo.Notes n2 ON n2.Id = ch2.NoteId\n            CROSS JOIN OPENJSON(@j, '$.keywords') k\n            WHERE n2.UserId = @u AND (@c IS NULL OR n2.CourseId = @c)\n            GROUP BY ch2.Id\n        ) s\n        JOIN dbo.NoteChunks ch ON ch.Id = s.Id\n        JOIN dbo.Notes n ON n.Id = ch.NoteId\n        WHERE s.Score > 0\n        ORDER BY s.Score DESC;\nEND\n\nSELECT\n    CAST(1 AS BIT) AS courseOk,\n    (SELECT Name FROM dbo.Courses WHERE Id = @c) AS courseName,\n    (SELECT h.Role AS role, h.Content AS content\n       FROM (SELECT TOP (@n) Id, Role, Content FROM dbo.ChatMessages\n             WHERE UserId = @u AND ((@c IS NULL AND CourseId IS NULL) OR CourseId = @c)\n             ORDER BY Id DESC) h\n      ORDER BY h.Id\n      FOR JSON PATH) AS history,\n    (SELECT NoteId AS noteId, Title AS title, Content AS content FROM @chunks ORDER BY Score DESC FOR JSON PATH) AS chunks;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Prompt hazırla", "position": [960,300],
  "parameters": { "jsCode": L7 + L12 + L13 + L18 + "const v = $('Girdiyi doğrula').first().json;\nconst ctx = $input.first().json;\nif (!ctx.courseOk) return fail(404, 'Ders bulunamadı.');\n\nconst history = JSON.parse(ctx.history || '[]');\nconst chunks = JSON.parse(ctx.chunks || '[]');\n\n// PROMPT (soru-cevap): Türkçe, öğretici, notlara dayalı, uydurmayan asistan\nconst system = [\n  'Sen \"Akademi Koçum\" adlı, üniversite öğrencilerine ders çalışmada yardım eden bir yapay zekâ asistanısın.',\n  'Kurallar:',\n  '- Her zaman Türkçe yanıt ver ve yalnızca Latin alfabesi kullan (Çince veya başka alfabeden karakter kullanma).',\n  '- Açık, doğru ve öğretici ol; gerektiğinde kısa bir örnek ver.',\n  '- Kalın yazı (**) veya başlık (#) kullanma; liste için satır başında \"- \" kullan.',\n  '- Sana \"Öğrencinin ders notlarından ilgili bölümler\" verildiyse öncelikle onlara dayan. Notta olmayan bilgiyi verirsen bunun genel bilgi olduğunu belirt.',\n  '- Notlardaki bir bölümden aldığın her bilginin cümle sonuna o bölümün numarasını köşeli parantezle yaz, ör. \"... yeniden çizilir [1].\" Notta olmayan bilgiye numara koyma.',\n  '- Bilmediğin bir şeyi uydurma; emin değilsen bunu söyle.',\n  '- Yanıtını en fazla 250 kelimede tut; gerekirse madde işaretleri kullan.',\n  ctx.courseName ? `- Öğrenci şu an \"${ctx.courseName}\" dersi hakkında soru soruyor.` : '',\n].filter(Boolean).join('\\n');\n\nconst messages = [{ role: 'system', content: system }];\nif (chunks.length) {\n  const context = chunks.map((c, i) => `[${i + 1}] (${c.title})\\n${c.content}`).join('\\n\\n');\n  messages.push({ role: 'system', content: `Öğrencinin ders notlarından ilgili bölümler:\\n\\n${truncate(context, 6000)}` });\n}\nfor (const m of history) messages.push({ role: m.role, content: m.content });\nmessages.push({ role: 'user', content: v.question });\n\n// Atıf için: [n] -> hangi notun hangi parçası (istemcide kaynak kartı olarak gösterilir)\nconst sources = chunks.map((c, i) => ({ index: i + 1, noteId: c.noteId, title: c.title, excerpt: c.content.slice(0, 400) }));\nreturn [{ json: { ok: true, usedNotes: chunks.length, sources, ollama: chatRequest(messages, { temperature: 0.4 }) } }];" }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Ders var mı?", "position": [1200,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "08015c8a-45d2-7fe8-b040-ab1c93c42ecc", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.httpRequest", version: 4.2, config: {
  "name": "Ollama: yanıt üret", "position": [1440,300], "onError": "continueErrorOutput", "notes": "POST /api/chat", "notesInFlow": true,
  "parameters": { "method": "POST", "url": expr("{{ $json.ollama.url }}"), "sendBody": true, "specifyBody": "json", "jsonBody": expr("{{ JSON.stringify($json.ollama.body) }}"), "options": { "timeout": expr("{{ $json.ollama.timeout }}") } }
}, output: [{}] });
const n7 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Yanıtı al", "position": [1680,220],
  "parameters": { "jsCode": L7 + L8 + L14 + L15 + L16 + L17 + "const v = $('Girdiyi doğrula').first().json;\nconst available = $('Prompt hazırla').first().json.sources || [];\nlet answer = modelText($input.first().json).replace(/\\*\\*/g, '');\nif (!answer) return fail(502, 'Model boş yanıt döndürdü, lütfen tekrar deneyin.');\n// Yalnızca yanıtta gerçekten atıf yapılan ([1], [2] ...) parçalar kaynak olarak döner;\n// olmayan bir numaraya yapılan atıf metinden silinir.\nconst cited = new Set([...answer.matchAll(/\\[(\\d+)\\]/g)].map((m) => Number(m[1])));\nanswer = answer.replace(/\\s?\\[(\\d+)\\]/g, (m, n) => (available.some((s) => s.index === Number(n)) ? m : ''));\nconst sources = available.filter((s) => cited.has(s.index));\nreturn [{ json: { ok: true, answer, sources, payload: toPayload({ userId: v.userId, courseId: v.courseId, question: v.question, answer, sources: JSON.stringify(sources) }) } }];" }
}, output: [{}] });
const n8 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Yanıt var mı?", "position": [1920,220],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "f7bba84b-2f0d-e055-4cfb-00d705ffb4e5", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n9 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: mesajları kaydet", "position": [2160,220], "onError": "continueErrorOutput", "alwaysOutputData": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON; SET XACT_ABORT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @u INT, @c INT, @q NVARCHAR(MAX), @a NVARCHAR(MAX), @src NVARCHAR(MAX);\nSELECT @u = userId, @c = courseId, @q = question, @a = answer, @src = sources\nFROM OPENJSON(@j) WITH (userId INT, courseId INT, question NVARCHAR(MAX), answer NVARCHAR(MAX), sources NVARCHAR(MAX));\n\nBEGIN TRAN;\nINSERT dbo.ChatMessages (UserId, CourseId, Role, Content) VALUES (@u, @c, N'user', @q);\nINSERT dbo.ChatMessages (UserId, CourseId, Role, Content, Sources) VALUES (@u, @c, N'assistant', @a, NULLIF(@src, N'[]'));\nDECLARE @mid INT = SCOPE_IDENTITY();\nCOMMIT;\nSELECT @mid AS messageId;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n10 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Yanıtı biçimle", "position": [2400,140],
  "parameters": { "jsCode": "const a = $('Yanıtı al').first().json;\nconst p = $('Prompt hazırla').first().json;\nreturn [{ json: { status: 200, body: { answer: a.answer, sources: a.sources, messageId: $input.first().json.messageId, usedNotes: p.usedNotes } } }];" }
}, output: [{}] });
const n11 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: veritabanı", "position": [2400,460],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];" }
}, output: [{}] });
const n12 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: Ollama", "position": [1680,460],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[llm-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 502, body: { error: 'Yapay zekâ servisine ulaşılamadı veya yanıt zaman aşımına uğradı. Ollama çalışıyor mu?' } } }];" }
}, output: [{}] });
const n13 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [2640,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akAskQuestion001", "03 - Soru-Cevap (POST /webhook/ask)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n2))
  .add(n2.output(0).to(n3))
  .add(n2.output(1).to(n13))
  .add(n3.output(0).to(n4))
  .add(n3.onError(n11))
  .add(n4.output(0).to(n5))
  .add(n5.output(0).to(n6))
  .add(n5.output(1).to(n13))
  .add(n6.output(0).to(n7))
  .add(n6.onError(n12))
  .add(n7.output(0).to(n8))
  .add(n8.output(0).to(n9))
  .add(n8.output(1).to(n13))
  .add(n9.output(0).to(n10))
  .add(n9.onError(n11))
  .add(n10.output(0).to(n13))
  .add(n11.output(0).to(n13))
  .add(n12.output(0).to(n13));
