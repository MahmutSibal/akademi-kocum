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
const L18 = "const truncate = (s, n = OLLAMA.maxInputChars) => (s.length > n ? `${s.slice(0, n)}\\n[... metin kısaltıldı ...]` : s);\n\n";
const L19 = "/** Modelin JSON yanıtını ayrıştırır; ```json bloklarını da tolere eder. */\nfunction parseModelJson(raw) {\n  const text = fixTurkish(raw).trim().replace(/^```(?:json)?\\s*/i, '').replace(/```$/, '');\n  try {\n    return JSON.parse(text);\n  } catch {\n    const s = text.indexOf('{');\n    const e = text.lastIndexOf('}');\n    if (s >= 0 && e > s) {\n      try {\n        return JSON.parse(text.slice(s, e + 1));\n      } catch {\n        /* aşağıda null */\n      }\n    }\n    return null;\n  }\n}\n\n";

const n0 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: flashcards", "position": [0,300], "webhookId": "b77dd5ed-67e8-caa8-6663-3fff4029509d",
  "parameters": { "httpMethod": "POST", "path": "flashcards", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Girdiyi doğrula", "position": [240,300],
  "parameters": { "jsCode": L0 + L1 + L3 + L4 + L6 + L7 + L8 + L9 + L10 + "const req = $input.first().json;\nconst auth = requireUser(req);\nif (auth.error) return auth.error;\nconst body = req.body || {};\nconst noteId = toId(body.noteId);\nconst count = body.count === undefined ? 10 : Number(body.count);\nif (!noteId) return fail(400, 'noteId geçersiz.');\nif (!Number.isInteger(count) || count < 5 || count > 20) return fail(400, 'Kart sayısı 5 ile 20 arasında olmalı.');\nreturn [{ json: { ok: true, userId: auth.userId, noteId, count, payload: toPayload({ userId: auth.userId, noteId }) } }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: notu getir", "position": [720,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nSELECT n.Id AS noteId, n.Title AS title, n.Content AS content,\n       (SELECT COUNT(*) FROM dbo.Flashcards f WHERE f.NoteId = n.Id) AS existingCards,\n       (SELECT f.Front AS front FROM dbo.Flashcards f WHERE f.NoteId = n.Id FOR JSON PATH) AS existingFronts\nFROM (SELECT 1 AS x) d\nLEFT JOIN dbo.Notes n ON n.Id = JSON_VALUE(@j, '$.noteId') AND n.UserId = JSON_VALUE(@j, '$.userId');", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
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
  "parameters": { "jsCode": L12 + L13 + L18 + "const v = $('Girdiyi doğrula').first().json;\nconst note = $input.first().json;\nconst existing = JSON.parse(note.existingFronts || '[]').map((c) => c.front);\n\n// PROMPT (kart): tek bir bilgiyi soran kısa ön yüz, net ve kısa arka yüz\nconst system = 'Sen öğrencilerin aralıklı tekrarla çalışması için ezber kartı (flashcard) hazırlayan bir eğitim uzmanısın. Türkçe ve yalnızca Latin alfabesiyle yazarsın. Yalnızca geçerli JSON üretirsin.';\nconst user = [\n  `Aşağıdaki ders notundan ${v.count} adet ezber kartı hazırla.`,\n  '',\n  'Kurallar:',\n  '- \"front\": tek bir kavramı veya bilgiyi soran kısa bir soru (en fazla 120 karakter).',\n  '- \"back\": doğru ve kısa cevap (1-2 cümle, en fazla 250 karakter).',\n  '- \"topic\": kartın konusu, 2-4 kelime.',\n  '- Kartlar notun farklı bölümlerini kapsasın; aynı bilgiyi iki kez sorma; yalnızca notta geçen bilgileri kullan.',\n  existing.length ? `- Şu kartlar zaten var, bunları tekrar etme: ${existing.slice(0, 30).join(' | ')}` : '',\n  '',\n  'JSON biçimi: {\"cards\":[{\"front\":\"...\",\"back\":\"...\",\"topic\":\"...\"}]}',\n  '',\n  `DERS NOTU (\"${note.title}\"):`,\n  '\"\"\"',\n  truncate(note.content),\n  '\"\"\"',\n].filter((l) => l !== '').join('\\n');\nconst format = {\n  type: 'object',\n  properties: {\n    cards: { type: 'array', minItems: v.count, maxItems: v.count, items: {\n      type: 'object',\n      properties: { front: { type: 'string' }, back: { type: 'string' }, topic: { type: 'string' } },\n      required: ['front', 'back', 'topic'],\n    } },\n  },\n  required: ['cards'],\n};\nreturn [{ json: { title: note.title, existing, ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.4, format }) } }];" }
}, output: [{}] });
const n7 = node({ type: "n8n-nodes-base.httpRequest", version: 4.2, config: {
  "name": "Ollama: kart üret", "position": [1440,220], "onError": "continueErrorOutput", "notes": "format: JSON şeması", "notesInFlow": true,
  "parameters": { "method": "POST", "url": expr("{{ $json.ollama.url }}"), "sendBody": true, "specifyBody": "json", "jsonBody": expr("{{ JSON.stringify($json.ollama.body) }}"), "options": { "timeout": expr("{{ $json.ollama.timeout }}") } }
}, output: [{}] });
const n8 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Kartları doğrula", "position": [1680,220],
  "parameters": { "jsCode": L7 + L8 + L14 + L15 + L16 + L19 + "const v = $('Girdiyi doğrula').first().json;\nconst base = $('Prompt hazırla').first().json;\nconst data = parseModelJson(($input.first().json.message || {}).content);\nconst seen = new Set(base.existing.map((f) => f.toLocaleLowerCase('tr')));\nconst cards = [];\nfor (const c of (data && Array.isArray(data.cards) ? data.cards : [])) {\n  const front = String((c && c.front) || '').trim().slice(0, 500);\n  const back = String((c && c.back) || '').trim().slice(0, 1000);\n  const topic = String((c && c.topic) || '').trim().slice(0, 200) || null;\n  const key = front.toLocaleLowerCase('tr');\n  if (!front || !back || seen.has(key)) continue;\n  seen.add(key);\n  cards.push({ front, back, topic });\n}\nif (cards.length < 3) return fail(502, 'Model yeterli sayıda geçerli kart üretemedi, lütfen tekrar deneyin.');\nreturn [{ json: { ok: true, cards, payload: toPayload({ userId: v.userId, noteId: v.noteId, cards }) } }];" }
}, output: [{}] });
const n9 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Kart var mı?", "position": [1920,220],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "7077c26a-05fa-00c5-a9a9-733552221eab", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n10 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: kartları kaydet", "position": [2160,140], "onError": "continueErrorOutput", "alwaysOutputData": true, "notes": "Yeni kartlar hemen tekrar listesine girer", "notesInFlow": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON; SET XACT_ABORT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @u INT = JSON_VALUE(@j, '$.userId'), @n INT = JSON_VALUE(@j, '$.noteId');\n\nBEGIN TRAN;\nINSERT dbo.Flashcards (UserId, NoteId, Front, Back, Topic)\nSELECT @u, @n, front, back, topic\nFROM OPENJSON(@j, '$.cards') WITH (front NVARCHAR(500), back NVARCHAR(1000), topic NVARCHAR(200));\nDECLARE @created INT = @@ROWCOUNT;\nCOMMIT;\nSELECT @created AS created,\n       (SELECT COUNT(*) FROM dbo.Flashcards WHERE UserId = @u AND DueAt <= SYSUTCDATETIME()) AS dueCards;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n11 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Yanıtı biçimle", "position": [2400,140],
  "parameters": { "jsCode": "const r = $input.first().json;\nreturn [{ json: { status: 201, body: {\n  created: r.created, dueCards: r.dueCards, noteTitle: $('Prompt hazırla').first().json.title,\n  cards: $('Kartları doğrula').first().json.cards,\n} } }];" }
}, output: [{}] });
const n12 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: veritabanı", "position": [2400,520],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];" }
}, output: [{}] });
const n13 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: Ollama", "position": [1680,420],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[llm-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 502, body: { error: 'Yapay zekâ servisine ulaşılamadı veya yanıt zaman aşımına uğradı. Ollama çalışıyor mu?' } } }];" }
}, output: [{}] });
const n14 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [2640,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akFlashcards0001", "10 - Kart Üretimi (POST /webhook/flashcards)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n2))
  .add(n2.output(0).to(n3))
  .add(n2.output(1).to(n14))
  .add(n3.output(0).to(n4))
  .add(n3.onError(n12))
  .add(n4.output(0).to(n6))
  .add(n4.output(1).to(n5))
  .add(n6.output(0).to(n7))
  .add(n7.output(0).to(n8))
  .add(n7.onError(n13))
  .add(n8.output(0).to(n9))
  .add(n9.output(0).to(n10))
  .add(n9.output(1).to(n14))
  .add(n10.output(0).to(n11))
  .add(n10.onError(n12))
  .add(n11.output(0).to(n14))
  .add(n5.output(0).to(n14))
  .add(n12.output(0).to(n14))
  .add(n13.output(0).to(n14));
