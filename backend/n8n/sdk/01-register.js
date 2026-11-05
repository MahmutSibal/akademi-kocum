import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const L0 = "const crypto = require('crypto');\n\n";
const L1 = "const JWT_SECRET = $env.JWT_SECRET || '';\n\n";
const L2 = "const TOKEN_TTL_SEC = 7 * 24 * 3600;\n\n";
const L3 = "const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');\n\n";
const L5 = "function signToken(claims) {\n  if (!JWT_SECRET) throw new Error('JWT_SECRET tanımlı değil (.env)');\n  const now = Math.floor(Date.now() / 1000);\n  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));\n  const pay = b64url(JSON.stringify({ ...claims, iat: now, exp: now + TOKEN_TTL_SEC }));\n  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${pay}`).digest());\n  return `${head}.${pay}.${sig}`;\n}\n\n";
const L7 = "/** Doğrulama hatası: IF düğümü ok=false görünce doğrudan yanıtlar. */\nconst fail = (status, error, extra = {}) => [{ json: { ok: false, status, body: { error, ...extra } } }];\n\n";
const L8 = "/** SQL'e gidecek veri: UTF-16LE JSON -> base64 (dbo.fn_DecodePayload çözer). */\nconst toPayload = (obj) => Buffer.from(JSON.stringify(obj), 'utf16le').toString('base64');\n\n";

const n0 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: register", "position": [0,300], "webhookId": "1ac6a7cf-47e9-48cd-9054-8b1eb26f7413",
  "parameters": { "httpMethod": "POST", "path": "register", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Girdiyi doğrula + hash", "position": [240,300],
  "parameters": { "jsCode": L0 + L7 + L8 + "const body = $input.first().json.body || {};\nconst email = String(body.email || '').trim().toLowerCase();\nconst password = String(body.password || '');\nconst name = String(body.name || '').trim();\n\nif (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email) || email.length > 256) return fail(400, 'Geçerli bir e-posta adresi girin.');\nif (password.length < 6 || password.length > 128) return fail(400, 'Şifre en az 6 karakter olmalı.');\nif (name.length < 2 || name.length > 100) return fail(400, 'Ad en az 2 karakter olmalı.');\n\n// scrypt: tuzlu ve kasıtlı olarak yavaş KDF (bcrypt eşdeğeri). Düz şifre saklanmaz.\nconst salt = crypto.randomBytes(16);\nconst hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });\nconst passwordHash = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;\nreturn [{ json: { ok: true, payload: toPayload({ email, name, passwordHash }) } }];" }
}, output: [{}] });
const n2 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: kullanıcı + varsayılan ders", "position": [720,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "notes": "Parametreli: tüm veri $1 içinde", "notesInFlow": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON; SET XACT_ABORT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @email NVARCHAR(256), @name NVARCHAR(100), @hash NVARCHAR(512);\nSELECT @email = email, @name = name, @hash = passwordHash\nFROM OPENJSON(@j) WITH (email NVARCHAR(256), name NVARCHAR(100), passwordHash NVARCHAR(512));\n\nIF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @email)\nBEGIN\n    SELECT N'exists' AS status, CAST(NULL AS INT) AS id, @email AS email, @name AS name;\n    RETURN;\nEND\n\n-- Kullanıcı ve \"Genel\" dersi tek transaction içinde\nBEGIN TRAN;\nDECLARE @t TABLE (Id INT);\nINSERT dbo.Users (Email, PasswordHash, Name) OUTPUT inserted.Id INTO @t VALUES (@email, @hash, @name);\nDECLARE @id INT = (SELECT Id FROM @t);\nINSERT dbo.Courses (UserId, Name, Description) VALUES (@id, N'Genel', N'Derse bağlı olmayan notlar ve sorular');\nCOMMIT;\nSELECT N'created' AS status, @id AS id, @email AS email, @name AS name;", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Token üret", "position": [960,220],
  "parameters": { "jsCode": L0 + L1 + L2 + L3 + L5 + "const r = $input.first().json;\nif (r.status === 'exists') return [{ json: { status: 409, body: { error: 'Bu e-posta ile kayıtlı bir hesap zaten var.' } } }];\nconst user = { id: r.id, email: r.email, name: r.name };\nreturn [{ json: { status: 201, body: { token: signToken({ sub: r.id, email: r.email }), user } } }];" }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: veritabanı", "position": [960,400],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];" }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [1200,300],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akAuthRegister01", "01 - Kayıt (POST /webhook/register)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n2))
  .add(n2.output(0).to(n3))
  .add(n2.output(1).to(n6))
  .add(n3.output(0).to(n4))
  .add(n3.onError(n5))
  .add(n4.output(0).to(n6))
  .add(n5.output(0).to(n6));
