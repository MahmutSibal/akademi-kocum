import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';

const L0 = "const crypto = require('crypto');\n\n";
const L1 = "const JWT_SECRET = $env.JWT_SECRET || '';\n\n";
const L3 = "const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');\n\n";
const L4 = "const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');\n\n";
const L6 = "/** Authorization: Bearer <jwt> başlığını doğrular; geçerliyse claim'leri döndürür. */\nfunction verifyToken(headers) {\n  const m = /^Bearer\\s+(.+)$/i.exec((headers && headers.authorization) || '');\n  if (!m || !JWT_SECRET) return null;\n  const parts = m[1].split('.');\n  if (parts.length !== 3) return null;\n  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());\n  if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;\n  try {\n    const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));\n    return claims.exp > Date.now() / 1000 ? claims : null;\n  } catch {\n    return null;\n  }\n}\n\n";
const L7 = "/** Doğrulama hatası: IF düğümü ok=false görünce doğrudan yanıtlar. */\nconst fail = (status, error, extra = {}) => [{ json: { ok: false, status, body: { error, ...extra } } }];\n\n";
const L8 = "/** SQL'e gidecek veri: UTF-16LE JSON -> base64 (dbo.fn_DecodePayload çözer). */\nconst toPayload = (obj) => Buffer.from(JSON.stringify(obj), 'utf16le').toString('base64');\n\n";
const L10 = "/** Token'ı doğrular, gövdede userId varsa token ile eşleştiğini kontrol eder. */\nfunction requireUser(req) {\n  const claims = verifyToken(req.headers);\n  if (!claims) return { error: fail(401, 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.') };\n  const bodyUser = req.body && req.body.userId;\n  if (bodyUser !== undefined && bodyUser !== null && Number(bodyUser) !== Number(claims.sub)) {\n    return { error: fail(403, 'Bu işlem için yetkiniz yok.') };\n  }\n  return { userId: Number(claims.sub) };\n}\n\n";

const n0 = trigger({ type: "n8n-nodes-base.scheduleTrigger", version: 1.2, config: {
  "name": "Her pazartesi 09:00", "position": [0,160],
  "parameters": { "rule": { "interval": [{ "field": "weeks", "weeksInterval": 1, "triggerAtDay": [1], "triggerAtHour": 9, "triggerAtMinute": 0 }] } }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Zamanlanmış mod", "position": [240,160],
  "parameters": { "jsCode": L8 + "// Varsayılan kapalı: yanlışlıkla gerçek/sahte adreslere toplu e-posta gitmesin\nif (String($env.WEEKLY_REPORT_ENABLED).toLowerCase() !== 'true') return [];\nreturn [{ json: { payload: toPayload({ mode: 'all', dryRun: false }) } }];" }
}, output: [{}] });
const n2 = trigger({ type: "n8n-nodes-base.webhook", version: 2, config: {
  "name": "Webhook: weekly-report", "position": [0,440], "webhookId": "7508d07e-68a2-6232-4be4-b7f0368dab4d",
  "parameters": { "httpMethod": "POST", "path": "weekly-report", "responseMode": "responseNode", "options": { "allowedOrigins": "*" } }
}, output: [{}] });
const n3 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Girdiyi doğrula", "position": [240,440],
  "parameters": { "jsCode": L0 + L1 + L3 + L4 + L6 + L7 + L8 + L10 + "const req = $input.first().json;\nconst auth = requireUser(req);\nif (auth.error) return auth.error;\n// dryRun: true -> e-posta gönderilmez, HTML önizlemesi döner\nconst dryRun = !!(req.body && req.body.dryRun);\nreturn [{ json: { ok: true, payload: toPayload({ mode: 'single', userId: auth.userId, dryRun }) } }];" }
}, output: [{}] });
const n4 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Geçerli mi?", "position": [480,440],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "178992ac-84bc-b798-5884-f07fb2eac257", "leftValue": expr("{{ $json.ok }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n5 = node({ type: "n8n-nodes-base.microsoftSql", version: 1.2, config: {
  "name": "SQL: haftalık veriler", "position": [720,300], "onError": "continueErrorOutput", "alwaysOutputData": true, "notes": "Son 7 gün vs önceki 7 gün", "notesInFlow": true, "credentials": { "microsoftSql": newCredential("StudyAssistant SQL") },
  "parameters": { "operation": "executeQuery", "query": "SET NOCOUNT ON;\nDECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);\nDECLARE @mode NVARCHAR(10) = JSON_VALUE(@j, '$.mode'),\n        @uid INT = TRY_CAST(JSON_VALUE(@j, '$.userId') AS INT),\n        @dry BIT = CASE WHEN JSON_VALUE(@j, '$.dryRun') = 'true' THEN 1 ELSE 0 END,\n        @since DATETIME2 = DATEADD(DAY, -7, SYSUTCDATETIME()),\n        @prev DATETIME2 = DATEADD(DAY, -14, SYSUTCDATETIME());\n\nSELECT @mode AS mode, @dry AS dryRun, u.Id AS userId, u.Email AS email, u.Name AS name,\n    (SELECT COUNT(*) FROM dbo.Notes WHERE UserId = u.Id AND CreatedAt >= @since) AS notesWeek,\n    (SELECT COUNT(*) FROM dbo.QuizResults WHERE UserId = u.Id AND CreatedAt >= @since) AS quizzesWeek,\n    (SELECT COUNT(*) FROM dbo.ChatMessages WHERE UserId = u.Id AND Role = N'user' AND CreatedAt >= @since) AS questionsWeek,\n    (SELECT CAST(100.0 * SUM(Score) / NULLIF(SUM(Total), 0) AS DECIMAL(5,1)) FROM dbo.QuizResults WHERE UserId = u.Id AND CreatedAt >= @since) AS rateWeek,\n    (SELECT CAST(100.0 * SUM(Score) / NULLIF(SUM(Total), 0) AS DECIMAL(5,1)) FROM dbo.QuizResults WHERE UserId = u.Id AND CreatedAt >= @prev AND CreatedAt < @since) AS ratePrev,\n    (SELECT COUNT(*) FROM dbo.Flashcards WHERE UserId = u.Id AND DueAt <= DATEADD(DAY, 1, SYSUTCDATETIME())) AS dueCards,\n    (SELECT TOP 5 t.Topic AS topic, c.Name AS course, t.SuccessRate AS successRate\n       FROM dbo.vw_TopicPerformance t JOIN dbo.Courses c ON c.Id = t.CourseId\n      WHERE t.UserId = u.Id AND t.Wrong > 0 ORDER BY t.SuccessRate ASC, t.Wrong DESC FOR JSON PATH) AS weakTopics,\n    (SELECT s.CourseName AS course, s.SuccessRate AS successRate, s.QuizAttempts AS attempts\n       FROM dbo.vw_CourseStats s WHERE s.UserId = u.Id AND s.QuizAttempts > 0 ORDER BY s.SuccessRate FOR JSON PATH) AS courses\nFROM dbo.Users u\nWHERE (@mode = N'single' AND u.Id = @uid)\n   OR (@mode = N'all' AND (EXISTS (SELECT 1 FROM dbo.QuizResults r WHERE r.UserId = u.Id AND r.CreatedAt >= @prev)\n                        OR EXISTS (SELECT 1 FROM dbo.Notes n WHERE n.UserId = u.Id AND n.CreatedAt >= @prev)\n                        OR EXISTS (SELECT 1 FROM dbo.Flashcards f WHERE f.UserId = u.Id AND f.DueAt <= SYSUTCDATETIME())));", "options": { "queryReplacement": expr("{{ $json.payload }}") } }
}, output: [{}] });
const n6 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "E-postaları hazırla", "position": [960,300],
  "parameters": { "jsCode": "    const esc = (s) => String(s ?? '').replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]));\n    const pct = (x) => (x === null || x === undefined ? '—' : `%${Math.round(Number(x))}`);\n    const rows = $input.all().map((i) => i.json).filter((r) => r.userId);\n    return rows.map((r) => {\n      const weak = JSON.parse(r.weakTopics || '[]');\n      const courses = JSON.parse(r.courses || '[]');\n      const first = String(r.name || '').split(' ')[0];\n      const diff = r.rateWeek !== null && r.ratePrev !== null ? Math.round(r.rateWeek - r.ratePrev) : null;\n      const trend = diff === null ? '' : diff >= 0 ? `<span style=\"color:#1b8a3a\">▲ ${diff} puan</span>` : `<span style=\"color:#c62828\">▼ ${-diff} puan</span>`;\n      const tile = (label, value, extra = '') =>\n        `<td style=\"padding:12px;background:#f4f1fb;border-radius:14px;text-align:center;width:25%\"><div style=\"font-size:22px;font-weight:700;color:#4a3aa8\">${value}</div><div style=\"font-size:12px;color:#555\">${label}</div>${extra ? `<div style=\"font-size:12px\">${extra}</div>` : ''}</td>`;\n      const weakHtml = weak.length\n        ? `<ul style=\"padding-left:18px;margin:8px 0\">${weak.map((t) => `<li><b>${esc(t.topic)}</b> <span style=\"color:#777\">(${esc(t.course)}, başarı ${pct(t.successRate)})</span></li>`).join('')}</ul>`\n        : '<p style=\"color:#555\">Bu hafta belirgin bir zayıf konun yok, harika! 🎉</p>';\n      const courseHtml = courses.length\n        ? courses.map((c) => `<tr><td style=\"padding:4px 0\">${esc(c.course)}</td><td style=\"text-align:right\">${pct(c.successRate)}</td><td style=\"text-align:right;color:#777\">${c.attempts} test</td></tr>`).join('')\n        : '';\n      const html = `<!doctype html><html><body style=\"margin:0;background:#f8f7fc;font-family:Segoe UI,Arial,sans-serif;color:#222\">\n<div style=\"max-width:560px;margin:0 auto;padding:24px\">\n  <div style=\"background:linear-gradient(135deg,#cfc6ff,#f3b8cf);border-radius:24px;padding:24px\">\n    <div style=\"font-size:13px;color:#4a3aa8;font-weight:600\">AKADEMİ KOÇUM · HAFTALIK RAPOR</div>\n    <h1 style=\"margin:6px 0 0;font-size:24px\">Merhaba ${esc(first)} 👋</h1>\n    <p style=\"margin:6px 0 0\">Son 7 günde neler yaptığına bir bakalım.</p>\n  </div>\n  <table style=\"width:100%;border-spacing:8px;margin-top:12px\"><tr>\n    ${tile('çözülen test', r.quizzesWeek)}${tile('başarı', pct(r.rateWeek), trend)}${tile('sorulan soru', r.questionsWeek)}${tile('yeni not', r.notesWeek)}\n  </tr></table>\n  <div style=\"background:#fff;border-radius:20px;padding:20px;margin-top:8px\">\n    <h3 style=\"margin:0\">📌 Odaklanman gereken konular</h3>${weakHtml}\n    ${courseHtml ? `<h3 style=\"margin:16px 0 4px\">📚 Ders bazlı başarı</h3><table style=\"width:100%;font-size:14px\">${courseHtml}</table>` : ''}\n    <h3 style=\"margin:16px 0 4px\">🔁 Bugün tekrar zamanı</h3>\n    <p style=\"margin:0\">${r.dueCards > 0 ? `<b>${r.dueCards}</b> kartın tekrar zamanı geldi. Uygulamada \"Bugün tekrar\" kartına dokunarak 5 dakikada bitirebilirsin.` : 'Tekrar bekleyen kartın yok. Bir notundan yeni kart oluşturmayı dene.'}</p>\n  </div>\n  <p style=\"font-size:12px;color:#888;text-align:center;margin-top:16px\">Bu e-posta Akademi Koçum tarafından otomatik oluşturuldu. Verilerin yalnızca senin bilgisayarında, yerel olarak işlenir.</p>\n</div></body></html>`;\n      return { json: {\n        mode: r.mode, dryRun: r.dryRun === true || r.dryRun === 1, userId: r.userId, to: r.email,\n        subject: `📊 Haftalık raporun: ${r.quizzesWeek} test, başarı ${pct(r.rateWeek)}`, html,\n      } };\n    });" }
}, output: [{}] });
const n7 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Önizleme mi?", "position": [1200,300],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "64dbb6de-9c4b-81b2-cccf-ef984eacbc03", "leftValue": expr("{{ $json.dryRun }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n8 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Önizleme yanıtı", "position": [1440,200],
  "parameters": { "jsCode": "const m = $input.first().json;\nreturn [{ json: { status: 200, body: { dryRun: true, sent: false, to: m.to, subject: m.subject, html: m.html } } }];" }
}, output: [{}] });
const n9 = node({ type: "n8n-nodes-base.emailSend", version: 2.1, config: {
  "name": "E-posta gönder (Brevo)", "position": [1440,400], "onError": "continueErrorOutput", "credentials": { "smtp": newCredential("Brevo SMTP") },
  "parameters": { "fromEmail": expr("{{ ($env.BREVO_SMTP_FROM_NAME || 'Akademi Koçum') + ' <' + $env.BREVO_SMTP_FROM_EMAIL + '>' }}"), "toEmail": expr("{{ $json.to }}"), "subject": expr("{{ $json.subject }}"), "emailFormat": "html", "html": expr("{{ $json.html }}"), "options": { "appendAttribution": false } }
}, output: [{}] });
const n10 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Gönderim özeti", "position": [1680,340],
  "parameters": { "jsCode": "const mails = $('E-postaları hazırla').all().map((i) => i.json);\nreturn [{ json: {\n  mode: mails[0] && mails[0].mode, status: 200,\n  body: { dryRun: false, sent: true, count: $input.all().length, to: mails.length === 1 ? mails[0].to : undefined },\n} }];" }
}, output: [{}] });
const n11 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: e-posta", "position": [1680,500],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[email-error]', typeof err === 'string' ? err : JSON.stringify(err));\nconst mode = ($('E-postaları hazırla').first().json || {}).mode;\nreturn [{ json: { mode, status: 502, body: { error: 'E-posta gönderilemedi. Brevo SMTP ayarlarını (.env) kontrol edin.' } } }];" }
}, output: [{}] });
const n12 = node({ type: "n8n-nodes-base.if", version: 2.2, config: {
  "name": "Uygulamadan mı?", "position": [1920,420],
  "parameters": { "conditions": { "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose", "version": 2 }, "conditions": [{ "id": "3949ef1d-0220-b75b-5a93-19f570fb1223", "leftValue": expr("{{ $json.mode === 'single' }}"), "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }], "combinator": "and" }, "looseTypeValidation": true, "options": {  } }
}, output: [{}] });
const n13 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hata: veritabanı", "position": [960,560],
  "parameters": { "jsCode": "const err = $input.first().json.error;\nconsole.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));\nreturn [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];" }
}, output: [{}] });
const n14 = node({ type: "n8n-nodes-base.respondToWebhook", version: 1.1, config: {
  "name": "Yanıtla", "position": [2160,440],
  "parameters": { "respondWith": "json", "responseBody": expr("{{ JSON.stringify($json.body) }}"), "options": { "responseCode": expr("{{ $json.status || 200 }}") } }
}, output: [{}] });

export default workflow("akWeeklyReport01", "12 - Haftalık E-posta Raporu (Schedule + POST /webhook/weekly-report)")
  .add(n0)
  .add(n0.output(0).to(n1))
  .add(n1.output(0).to(n5))
  .add(n2.output(0).to(n3))
  .add(n3.output(0).to(n4))
  .add(n4.output(0).to(n5))
  .add(n4.output(1).to(n14))
  .add(n5.output(0).to(n6))
  .add(n5.onError(n13))
  .add(n6.output(0).to(n7))
  .add(n7.output(0).to(n8))
  .add(n7.output(1).to(n9))
  .add(n9.output(0).to(n10))
  .add(n9.onError(n11))
  .add(n10.output(0).to(n12))
  .add(n11.output(0).to(n12))
  .add(n12.output(0).to(n14))
  .add(n8.output(0).to(n14))
  .add(n13.output(0).to(n14));
