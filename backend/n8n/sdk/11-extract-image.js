import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const L0 = "const crypto = require('crypto');\n\n";
const L1 = "const JWT_SECRET = $env.JWT_SECRET || '';\n\n";
const L3 = "const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');\n\n";
const L4 = "const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');\n\n";
const L6 = "/** Authorization: Bearer <jwt> başlığını doğrular; geçerliyse claim'leri döndürür. */\nfunction verifyToken(headers) {\n  const m = /^Bearer\\s+(.+)$/i.exec((headers && headers.authorization) || '');\n  if (!m || !JWT_SECRET) return null;\n  const parts = m[1].split('.');\n  if (parts.length !== 3) return null;\n  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());\n  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;\n  try {\n    const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));\n    return claims.exp > Date.now() / 1000 ? claims : null;\n  } catch {\n    return null;\n  }\n}\n\n";
const L7 = "/** Doğrulama hatası: IF düğümü ok=false görünce doğrudan yanıtlar. */\nconst fail = (status, error, extra = {}) => [{ json: { ok: false, status, body: { error, ...extra } } }];\n\n";
const L10 = "/** Token'ı doğrular, gövdede userId varsa token ile eşleştiğini kontrol eder. */\nfunction requireUser(req) {\n  const claims = verifyToken(req.headers);\n  if (!claims) return { error: fail(401, 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.') };\n  const bodyUser = req.body && req.body.userId;\n  if (bodyUser !== undefined && bodyUser !== null && Number(bodyUser) !== Number(claims.sub)) {\n    return { error: fail(403, 'Bu işlem için yetkiniz yok.') };\n  }\n  return { userId: Number(claims.sub) };\n}\n\n";
const L11 = "/** Metni temizler: kontrol karakterleri, fazla boşluk ve satırlar. */\nconst cleanText = (s) =>\n  String(s || '')\n    .replace(/\\r\\n?/g, '\\n')\n    .replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, '')\n    .replace(/[ \\t ]+/g, ' ')\n    .replace(/ *\\n */g, '\\n')\n    .replace(/\\n{3,}/g, '\\n\\n')\n    .trim();\n\n";
const L12 = "const OLLAMA = {\n  url: `${($env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\\/$/, '')}/api/chat`,\n  model: $env.OLLAMA_MODEL || 'qwen2.5:7b',\n  numCtx: Number($env.OLLAMA_NUM_CTX || 8192),\n  timeout: Number($env.OLLAMA_TIMEOUT_MS || 180000),\n  // Modele verilecek en uzun not metni (bağlam penceresini aşmamak için)\n  maxInputChars: Number($env.MAX_LLM_INPUT_CHARS || 12000),\n};\n\n";
const L14 = "// Qwen modelleri bazen Türkçe harfleri, UTF-8 baytlarının GBK okunuşu olan\n// Çince karakterlerle yazar (ı -> 谋, ş -> 艧 ...). Bunları geri çeviririz.\nconst MOJIBAKE = { '莽': 'ç', '脟': 'Ç', '臒': 'ğ', '臑': 'Ğ', '谋': 'ı', '陌': 'İ', '枚': 'ö', '脰': 'Ö', '艧': 'ş', '艦': 'Ş', '眉': 'ü', '脺': 'Ü', '芒': 'â', '脗': 'Â', '卯': 'î', '脦': 'Î', '没': 'û', '脹': 'Û' };\n\n";
const L15 = "const MOJIBAKE_RE = new RegExp(`[${Object.keys(MOJIBAKE).join('')}]`, 'g');\n\n";
const L16 = "const fixTurkish = (s) => String(s || '').replace(MOJIBAKE_RE, (c) => MOJIBAKE[c]);\n\n";
const L17 = "/** Ollama /api/chat yanıtındaki metin (Türkçe karakter düzeltmesiyle). */\nconst modelText = (res) => fixTurkish(((res && res.message) || {}).content).trim();\n\n";

const n0 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: extract-image", "position": [0,300], "webhookId": "0045ecd9-2b6d-8706-3a0e-52dd8657efb6",
  "parameters": { "httpMethod": "POST", "path": "extract-image", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Görseli doğrula", "position": [240,300],
  "parameters": { "jsCode": L0 + L1 + L3 + L4 + L6 + L7 + L10 + "const item = $input.first();\nconst auth = requireUser(item.json);\nif (auth.error) return auth.error;\nconst files = item.binary || {};\nconst file = files.file || Object.values(files)[0];\nif (!file) return fail(400, 'multipart/form-data ile \"file\" alanında bir fotoğraf gönderin.');\nconst isImage = /^image\\/(jpeg|png|webp|heic|heif)$/i.test(file.mimeType || '') || /\\.(jpe?g|png|webp|heic)$/i.test(file.fileName || '');\nif (!isImage) return fail(415, 'Yalnızca JPG, PNG veya WEBP fotoğraf yüklenebilir.');\nreturn [{ json: { ok: true, fileName: file.fileName }, binary: { data: file } }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.extractFromFile", version: 1, config: {
  "name": "Görseli base64 yap", "position": [720,220], "onError": "continueErrorOutput",
  "parameters": { "operation": "binaryToPropery", "binaryPropertyName": "data", "destinationKey": "imageBase64", "options": {  } }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Prompt hazırla", "position": [960,220],
  "parameters": { "jsCode": L7 + L12 + "const image = $input.first().json.imageBase64;\nif (!image) return fail(422, 'Fotoğraf okunamadı.');\nif (image.length > 14 * 1024 * 1024) return fail(413, 'Fotoğraf çok büyük (en fazla ~10 MB).');\n// PROMPT (görsel -> metin): yorum katmadan, Türkçe karakterleri koruyarak birebir aktar\nconst system = 'Sen ders notlarını dijitalleştiren bir OCR asistanısın. Fotoğraftaki el yazısı veya basılı ders notunu Türkçe karakterleri (ç, ğ, ı, İ, ö, ş, ü) koruyarak birebir metne dökersin. Yorum, açıklama veya özet eklemezsin; okuyamadığın kelimeyi [?] ile belirtirsin.';\nconst user = 'Bu fotoğraftaki tüm ders notunu satır satır, madde işaretleri ve başlıklarla birlikte aynen yaz.';\nconst body = {\n  model: $env.OLLAMA_VISION_MODEL || 'gemma4:12b',\n  stream: false,\n  think: false, // görsel modelin düşünme modu kapalı: yalnızca metni üretsin\n  keep_alive: $env.OLLAMA_KEEP_ALIVE || '30m',\n  options: { temperature: 0.1, num_ctx: 8192, num_predict: 3000 },\n  messages: [{ role: 'system', content: system }, { role: 'user', content: user, images: [image] }],\n};\nreturn [{ json: { ok: true, ollama: { url: OLLAMA.url, body, timeout: Number($env.OLLAMA_VISION_TIMEOUT_MS || 600000) } } }];" }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Görsel hazır mı?", "position": [1200,220],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "c93b5172-b591-6cd1-38e3-b0a0ff64eb68", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.httpRequest", version: 4.2, config: {
  "name": "Ollama: görseli oku", "position": [1440,140], "onError": "continueErrorOutput", "notes": "Görsel model (vision)", "notesInFlow": true,
  "parameters": { "method": "POST", "url": expr("{{ $json.ollama.url }}"), "sendBody": true, "specifyBody": "json", "jsonBody": expr("{{ JSON.stringify($json.ollama.body) }}"), "options": { "timeout": expr("{{ $json.ollama.timeout }}") } }
}, output: [{}] });
const n7 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Metni temizle", "position": [1680,140],
  "parameters": { "jsCode": L11 + L14 + L15 + L16 + L17 + "const text = cleanText(modelText($input.first().json)).replace(/^```[a-z]*\\n?|```$/g, '').trim();\nif (text.length < 20) return [{ json: { status: 422, body: { error: 'Fotoğrafta okunabilir metin bulunamadı. Daha net ve aydınlık bir fotoğraf deneyin.' } } }];\nreturn [{ json: { status: 200, body: {\n  fileName: $('Görseli doğrula').first().json.fileName, characters: text.length,\n  model: $env.OLLAMA_VISION_MODEL || 'gemma4:12b', text,\n} } }];" }
}, output: [{}] });
const n8 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Fotoğraf okunamadı", "position": [960,460],
  "parameters": { "jsCode": "return [{ json: { status: 422, body: { error: 'Fotoğraf dosyası okunamadı.' } } }];" }
}, output: [{}] });
const n9 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: Ollama", "position": [1680,360],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[llm-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 502, body: { error: 'Yapay zekâ servisine ulaşılamadı veya yanıt zaman aşımına uğradı. Ollama çalışıyor mu?' } } }];" }
}, output: [{}] });
const n10 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [1920,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akExtractImage01", "11 - Fotoğraftan Not (POST /webhook/extract-image)")
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
