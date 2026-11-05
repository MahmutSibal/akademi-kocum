import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const L0 = "const crypto = require('crypto');\n\n";
const L1 = "const JWT_SECRET = $env.JWT_SECRET || '';\n\n";
const L3 = "const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');\n\n";
const L4 = "const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');\n\n";
const L6 = "/** Authorization: Bearer <jwt> başlığını doğrular; geçerliyse claim'leri döndürür. */\nfunction verifyToken(headers) {\n  const m = /^Bearer\\s+(.+)$/i.exec((headers && headers.authorization) || '');\n  if (!m || !JWT_SECRET) return null;\n  const parts = m[1].split('.');\n  if (parts.length !== 3) return null;\n  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());\n  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;\n  try {\n    const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));\n    return claims.exp > Date.now() / 1000 ? claims : null;\n  } catch {\n    return null;\n  }\n}\n\n";
const L7 = "/** Doğrulama hatası: IF düğümü ok=false görünce doğrudan yanıtlar. */\nconst fail = (status, error, extra = {}) => [{ json: { ok: false, status, body: { error, ...extra } } }];\n\n";
const L10 = "/** Token'ı doğrular, gövdede userId varsa token ile eşleştiğini kontrol eder. */\nfunction requireUser(req) {\n  const claims = verifyToken(req.headers);\n  if (!claims) return { error: fail(401, 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.') };\n  const bodyUser = req.body && req.body.userId;\n  if (bodyUser !== undefined && bodyUser !== null && Number(bodyUser) !== Number(claims.sub)) {\n    return { error: fail(403, 'Bu işlem için yetkiniz yok.') };\n  }\n  return { userId: Number(claims.sub) };\n}\n\n";
const L11 = "/** Metni temizler: kontrol karakterleri, fazla boşluk ve satırlar. */\nconst cleanText = (s) =>\n  String(s || '')\n    .replace(/\\r\\n?/g, '\\n')\n    .replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, '')\n    .replace(/[ \\t ]+/g, ' ')\n    .replace(/ *\\n */g, '\\n')\n    .replace(/\\n{3,}/g, '\\n\\n')\n    .trim();\n\n";

const n0 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: extract-pdf", "position": [0,300], "webhookId": "d49428e2-1326-95b9-c50e-5aba96f33e3a",
  "parameters": { "httpMethod": "POST", "path": "extract-pdf", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Dosyayı doğrula", "position": [240,300],
  "parameters": { "jsCode": L0 + L1 + L3 + L4 + L6 + L7 + L10 + "const item = $input.first();\nconst auth = requireUser(item.json);\nif (auth.error) return auth.error;\nconst files = item.binary || {};\nconst file = files.file || Object.values(files)[0];\nif (!file) return fail(400, 'multipart/form-data ile \"file\" alanında bir PDF gönderin.');\nconst isPdf = /pdf/i.test(file.mimeType || '') || /\\.pdf$/i.test(file.fileName || '');\nif (!isPdf) return fail(415, 'Yalnızca PDF dosyası yüklenebilir.');\nreturn [{ json: { ok: true, fileName: file.fileName }, binary: { data: file } }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.extractFromFile", version: 1, config: {
  "name": "PDF metnini çıkar", "position": [720,220], "onError": "continueErrorOutput",
  "parameters": { "operation": "pdf", "binaryPropertyName": "data", "options": {  } }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Metni temizle", "position": [960,220],
  "parameters": { "jsCode": L11 + "const fileName = $('Dosyayı doğrula').first().json.fileName;\nconst r = $input.first().json;\nconst text = cleanText(r.text).slice(0, 100000);\nif (text.length < 20) return [{ json: { status: 422, body: { error: 'PDF içinden metin çıkarılamadı (taranmış görüntü olabilir).' } } }];\nreturn [{ json: { status: 200, body: { fileName, pages: r.numpages || null, characters: text.length, text } } }];" }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "PDF okunamadı", "position": [960,420],
  "parameters": { "jsCode": "return [{ json: { status: 422, body: { error: 'PDF dosyası okunamadı. Dosya bozuk veya şifreli olabilir.' } } }];" }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [1200,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akExtractPdf0001", "09 - PDF Metin Çıkarma (POST /webhook/extract-pdf)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n2))
  .add(n2.output(0).to(n3))
  .add(n2.output(1).to(n6))
  .add(n3.output(0).to(n4))
  .add(n3.onError(n5))
  .add(n4.output(0).to(n6))
  .add(n5.output(0).to(n6));
