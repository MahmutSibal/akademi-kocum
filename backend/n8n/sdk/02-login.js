import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const L0 = "const crypto = require('crypto');\n\n";
const L1 = "const JWT_SECRET = $env.JWT_SECRET || '';\n\n";
const L2 = "const TOKEN_TTL_SEC = 7 * 24 * 3600;\n\n";
const L3 = "const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');\n\n";
const L5 = "function signToken(claims) {\n  if (!JWT_SECRET) throw new Error('JWT_SECRET tanımlı değil (.env)');\n  const now = Math.floor(Date.now() / 1000);\n  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));\n  const pay = b64url(JSON.stringify({ ...claims, iat: now, exp: now + TOKEN_TTL_SEC }));\n  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${pay}`).digest());\n  return `${head}.${pay}.${sig}`;\n}\n\n";
const L7 = "/** Doğrulama hatası: IF düğümü ok=false görünce doğrudan yanıtlar. */\nconst fail = (status, error, extra = {}) => [{ json: { ok: false, status, body: { error, ...extra } } }];\n\n";
const L8 = "/** SQL'e gidecek veri: UTF-16LE JSON -> base64 (dbo.fn_DecodePayload çözer). */\nconst toPayload = (obj) => Buffer.from(JSON.stringify(obj), 'utf16le').toString('base64');\n\n";

const n0 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: login", "position": [0,300], "webhookId": "617973c0-ebfa-d9a7-302b-9f852bf9000d",
  "parameters": { "httpMethod": "POST", "path": "login", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Girdiyi doğrula", "position": [240,300],
  "parameters": { "jsCode": L7 + L8 + "const body = $input.first().json.body || {};\nconst email = String(body.email || '').trim().toLowerCase();\nconst password = String(body.password || '');\nif (!email || !password) return fail(400, 'E-posta ve şifre zorunludur.');\nreturn [{ json: { ok: true, password, payload: toPayload({ email }) } }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: kullanıcıyı bul", "position": [720,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @email NVARCHAR(256) = JSON_VALUE(@j, '$.email');\nSELECT u.Id AS id, u.Email AS email, u.Name AS name, u.PasswordHash AS passwordHash\nFROM (SELECT 1 AS x) d\nLEFT JOIN dbo.Users u ON u.Email = @email;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Şifreyi doğrula + token", "position": [960,220],
  "parameters": { "jsCode": L0 + L1 + L2 + L3 + L5 + "const r = $input.first().json;\nconst password = $('Girdiyi doğrula').first().json.password;\nconst denied = [{ json: { status: 401, body: { error: 'E-posta veya şifre hatalı.' } } }];\nif (!r.id) return denied;\n\nconst [algo, saltHex, hashHex] = String(r.passwordHash || '').split('$');\nif (algo !== 'scrypt' || !saltHex || !hashHex) return denied;\nconst expected = Buffer.from(hashHex, 'hex');\nconst actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });\nif (!crypto.timingSafeEqual(expected, actual)) return denied;\n\nconst user = { id: r.id, email: r.email, name: r.name };\nreturn [{ json: { status: 200, body: { token: signToken({ sub: r.id, email: r.email }), user } } }];" }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: veritabanı", "position": [960,400],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];" }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [1200,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akAuthLogin00001", "02 - Giriş (POST /webhook/login)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n2))
  .add(n2.output(0).to(n3))
  .add(n2.output(1).to(n6))
  .add(n3.output(0).to(n4))
  .add(n3.onError(n5))
  .add(n4.output(0).to(n6))
  .add(n5.output(0).to(n6));
