import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const L0 = "const crypto = require('crypto');\n\n";
const L1 = "const JWT_SECRET = $env.JWT_SECRET || '';\n\n";
const L3 = "const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');\n\n";
const L4 = "const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');\n\n";
const L6 = "/** Authorization: Bearer <jwt> başlığını doğrular; geçerliyse claim'leri döndürür. */\nfunction verifyToken(headers) {\n  const m = /^Bearer\\s+(.+)$/i.exec((headers && headers.authorization) || '');\n  if (!m || !JWT_SECRET) return null;\n  const parts = m[1].split('.');\n  if (parts.length !== 3) return null;\n  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());\n  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;\n  try {\n    const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));\n    return claims.exp > Date.now() / 1000 ? claims : null;\n  } catch {\n    return null;\n  }\n}\n\n";
const L7 = "/** Doğrulama hatası: IF düğümü ok=false görünce doğrudan yanıtlar. */\nconst fail = (status, error, extra = {}) => [{ json: { ok: false, status, body: { error, ...extra } } }];\n\n";
const L8 = "/** SQL'e gidecek veri: UTF-16LE JSON -> base64 (dbo.fn_DecodePayload çözer). */\nconst toPayload = (obj) => Buffer.from(JSON.stringify(obj), 'utf16le').toString('base64');\n\n";
const L10 = "/** Token'ı doğrular, gövdede userId varsa token ile eşleştiğini kontrol eder. */\nfunction requireUser(req) {\n  const claims = verifyToken(req.headers);\n  if (!claims) return { error: fail(401, 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.') };\n  const bodyUser = req.body && req.body.userId;\n  if (bodyUser !== undefined && bodyUser !== null && Number(bodyUser) !== Number(claims.sub)) {\n    return { error: fail(403, 'Bu işlem için yetkiniz yok.') };\n  }\n  return { userId: Number(claims.sub) };\n}\n\n";
const L12 = "const OLLAMA = {\n  url: `${($env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\\/$/, '')}/api/chat`,\n  model: $env.OLLAMA_MODEL || 'qwen2.5:7b',\n  numCtx: Number($env.OLLAMA_NUM_CTX || 8192),\n  timeout: Number($env.OLLAMA_TIMEOUT_MS || 180000),\n  // Modele verilecek en uzun not metni (bağlam penceresini aşmamak için)\n  maxInputChars: Number($env.MAX_LLM_INPUT_CHARS || 12000),\n};\n\n";
const L13 = "/** format: undefined (serbest metin), 'json' veya bir JSON şeması. */\nfunction chatRequest(messages, { temperature = 0.4, format } = {}) {\n  const body = {\n    model: OLLAMA.model,\n    messages,\n    stream: false,\n    keep_alive: $env.OLLAMA_KEEP_ALIVE || '30m',\n    options: { temperature, num_ctx: OLLAMA.numCtx },\n  };\n  if (format) body.format = format;\n  return { url: OLLAMA.url, body, timeout: OLLAMA.timeout };\n}\n\n";
const L14 = "// Qwen modelleri bazen Türkçe harfleri, UTF-8 baytlarının GBK okunuşu olan\n// Çince karakterlerle yazar (ı -> 谋, ş -> 艧 ...). Bunları geri çeviririz.\nconst MOJIBAKE = { '莽': 'ç', '脟': 'Ç', '臒': 'ğ', '臑': 'Ğ', '谋': 'ı', '陌': 'İ', '枚': 'ö', '脰': 'Ö', '艧': 'ş', '艦': 'Ş', '眉': 'ü', '脺': 'Ü', '芒': 'â', '脗': 'Â', '卯': 'î', '脦': 'Î', '没': 'û', '脹': 'Û' };\n\n";
const L15 = "const MOJIBAKE_RE = new RegExp(`[${Object.keys(MOJIBAKE).join('')}]`, 'g');\n\n";
const L16 = "const fixTurkish = (s) => String(s || '').replace(MOJIBAKE_RE, (c) => MOJIBAKE[c]);\n\n";
const L19 = "/** Modelin JSON yanıtını ayrıştırır; ```json bloklarını da tolere eder. */\nfunction parseModelJson(raw) {\n  const text = fixTurkish(raw).trim().replace(/^```(?:json)?\\s*/i, '').replace(/```$/, '');\n  try {\n    return JSON.parse(text);\n  } catch {\n    const s = text.indexOf('{');\n    const e = text.lastIndexOf('}');\n    if (s >= 0 && e > s) {\n      try {\n        return JSON.parse(text.slice(s, e + 1));\n      } catch {\n        /* aşağıda null */\n      }\n    }\n    return null;\n  }\n}\n\n";

const n0 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: study-plan", "position": [0,300], "webhookId": "57a5f585-3fcd-3594-2bc5-69161486ae8e",
  "parameters": { "httpMethod": "POST", "path": "study-plan", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Girdiyi doğrula", "position": [240,300],
  "parameters": { "jsCode": L0 + L1 + L3 + L4 + L6 + L7 + L8 + L10 + "const req = $input.first().json;\nconst auth = requireUser(req);\nif (auth.error) return auth.error;\nconst body = req.body || {};\nconst hoursPerDay = body.hoursPerDay === undefined ? 2 : Number(body.hoursPerDay);\nif (!(hoursPerDay >= 0.5 && hoursPerDay <= 8)) return fail(400, 'Günlük çalışma süresi 0,5-8 saat arasında olmalı.');\nreturn [{ json: { ok: true, userId: auth.userId, hoursPerDay, payload: toPayload({ userId: auth.userId }) } }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: performans verisi", "position": [720,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @u INT = JSON_VALUE(@j, '$.userId');\nSELECT\n    (SELECT s.CourseName AS course, s.NoteCount AS notes, s.SuccessRate AS successRate,\n            JSON_QUERY((SELECT TOP 5 n.Title AS title FROM dbo.Notes n WHERE n.CourseId = s.CourseId ORDER BY n.CreatedAt DESC FOR JSON PATH)) AS recentNotes\n     FROM dbo.vw_CourseStats s WHERE s.UserId = @u FOR JSON PATH, INCLUDE_NULL_VALUES) AS courses,\n    (SELECT TOP 8 t.Topic AS topic, c.Name AS course, t.SuccessRate AS successRate\n     FROM dbo.vw_TopicPerformance t JOIN dbo.Courses c ON c.Id = t.CourseId\n     WHERE t.UserId = @u AND t.Wrong > 0 ORDER BY t.SuccessRate ASC FOR JSON PATH) AS weakTopics;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Prompt hazırla", "position": [960,300],
  "parameters": { "jsCode": L7 + L12 + L13 + "const v = $('Girdiyi doğrula').first().json;\nconst r = $input.first().json;\nconst courses = JSON.parse(r.courses || '[]').filter((c) => c.notes > 0);\nconst weak = JSON.parse(r.weakTopics || '[]');\nif (!courses.length) return fail(422, 'Program oluşturmak için önce en az bir ders notu ekleyin.');\n\nconst DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];\nconst days = [...Array(7)].map((_, i) => {\n  const d = new Date(Date.now() + i * 86400000);\n  return { day: DAYS[d.getDay()], date: d.toISOString().slice(0, 10) };\n});\nconst courseLines = courses.map((c) =>\n  `- ${c.course}: başarı ${c.successRate === null ? 'henüz test yok' : `%${c.successRate}`}; notlar: ${(c.recentNotes || []).map((n) => n.title).join(', ')}`).join('\\n');\nconst weakLines = weak.length ? weak.map((t) => `- ${t.topic} (${t.course}): %${t.successRate}`).join('\\n') : '- (henüz yanlış yapılan konu yok)';\n\n// PROMPT (haftalık program): zayıf konulara ağırlık veren 7 günlük plan (JSON)\nconst system = 'Sen üniversite öğrencileri için gerçekçi haftalık çalışma programları hazırlayan bir eğitim koçusun. Türkçe yazarsın ve yalnızca geçerli JSON üretirsin.';\nconst user = [\n  'Öğrencinin dersleri:', courseLines, '',\n  'Zayıf olduğu konular (test sonuçlarına göre):', weakLines, '',\n  `Günlük çalışma süresi: yaklaşık ${v.hoursPerDay} saat (${Math.round(v.hoursPerDay * 60)} dakika).`,\n  `Program günleri: ${days.map((d) => `${d.day} (${d.date})`).join(', ')}.`, '',\n  'Kurallar:',\n  '- Tam 7 gün olsun, sırası yukarıdaki gibi.',\n  '- Zayıf konulara daha fazla zaman ayır; her gün 2-4 görev olsun ve dakikaların toplamı günlük süreyi aşmasın.',\n  '- Görevler somut olsun ve öğrencinin kendi not başlıklarını/konularını kullansın (ör. \"<not başlığı> notunu tekrar oku ve 5 soruluk test çöz\").',\n  '- Son gün genel tekrar ve deneme testi olsun.',\n  '',\n  'JSON biçimi:',\n  '{\"overview\":\"2 cümlelik genel strateji\",\"days\":[{\"focus\":\"günün odağı\",\"tasks\":[{\"title\":\"...\",\"course\":\"...\",\"minutes\":30}]}],\"tips\":[\"...\",\"...\"]}',\n].join('\\n');\nconst format = {\n  type: 'object',\n  properties: {\n    overview: { type: 'string' },\n    days: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', properties: {\n      focus: { type: 'string' },\n      tasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, course: { type: 'string' }, minutes: { type: 'integer' } }, required: ['title', 'course', 'minutes'] } },\n    }, required: ['focus', 'tasks'] } },\n    tips: { type: 'array', items: { type: 'string' } },\n  },\n  required: ['overview', 'days', 'tips'],\n};\nreturn [{ json: { ok: true, days, ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.5, format }) } }];" }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Veri yeterli mi?", "position": [1200,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "641d5876-feaa-d78a-f55c-587221858328", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.httpRequest", version: 4.2, config: {
  "name": "Ollama: program üret", "position": [1440,220], "onError": "continueErrorOutput",
  "parameters": { "method": "POST", "url": expr("{{ $json.ollama.url }}"), "sendBody": true, "specifyBody": "json", "jsonBody": expr("{{ JSON.stringify($json.ollama.body) }}"), "options": { "timeout": expr("{{ $json.ollama.timeout }}") } }
}, output: [{}] });
const n7 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Programı doğrula", "position": [1680,220],
  "parameters": { "jsCode": L14 + L15 + L16 + L19 + "const { days } = $('Prompt hazırla').first().json;\nconst plan = parseModelJson(($input.first().json.message || {}).content);\nif (!plan || !Array.isArray(plan.days) || plan.days.length < 7) {\n  return [{ json: { status: 502, body: { error: 'Model geçerli bir program üretemedi, lütfen tekrar deneyin.' } } }];\n}\n// Gün adı ve tarihleri modele bırakılmaz, kod belirler\nconst outDays = days.map((d, i) => {\n  const src = plan.days[i] || {};\n  const tasks = (Array.isArray(src.tasks) ? src.tasks : []).slice(0, 6).map((t) => ({\n    title: String(t.title || '').trim(), course: String(t.course || '').trim(), minutes: Math.max(5, Math.min(240, Math.round(Number(t.minutes) || 30))),\n  })).filter((t) => t.title);\n  return { ...d, focus: String(src.focus || '').trim(), tasks, totalMinutes: tasks.reduce((s, t) => s + t.minutes, 0) };\n});\nreturn [{ json: { status: 200, body: { overview: String(plan.overview || ''), days: outDays, tips: (plan.tips || []).map(String).slice(0, 5) } } }];" }
}, output: [{}] });
const n8 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: veritabanı", "position": [960,520],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];" }
}, output: [{}] });
const n9 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: Ollama", "position": [1680,420],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[llm-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 502, body: { error: 'Yapay zekâ servisine ulaşılamadı veya yanıt zaman aşımına uğradı. Ollama çalışıyor mu?' } } }];" }
}, output: [{}] });
const n10 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [1920,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akStudyPlan00001", "08 - Haftalık Çalışma Programı (POST /webhook/study-plan)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n2))
  .add(n2.output(0).to(n3))
  .add(n2.output(1).to(n10))
  .add(n3.output(0).to(n4))
  .add(n3.onError(n8))
  .add(n4.output(0).to(n5))
  .add(n5.output(0).to(n6))
  .add(n5.output(1).to(n10))
  .add(n6.output(0).to(n7))
  .add(n6.onError(n9))
  .add(n7.output(0).to(n10))
  .add(n8.output(0).to(n10))
  .add(n9.output(0).to(n10));
