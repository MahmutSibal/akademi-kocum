/* eslint-disable no-undef */
import { Workflow, webhook, code, ifTrue, sql, ollama, respond, fileToBase64, weeklySchedule, emailSend } from './lib.mjs';
import { authLib, ollamaLib, dbError, llmError } from './common.mjs';

const AUTH = [authLib];
const AI = [authLib, ollamaLib];

// ============================================================ /flashcards
// Nottan soru-cevap kartları üretir; tekrarları data API'deki cards.due / cards.review (SM-2) yönetir.
export function flashcardsWorkflow() {
  const w = new Workflow('akFlashcards0001', '10 - Kart Üretimi (POST /webhook/flashcards)');
  w.add(webhook('Webhook: flashcards', 'flashcards', [0, 300]));
  w.add(code('Girdiyi doğrula', function () {
    const req = $input.first().json;
    const auth = requireUser(req);
    if (auth.error) return auth.error;
    const body = req.body || {};
    const noteId = toId(body.noteId);
    const count = body.count === undefined ? 10 : Number(body.count);
    if (!noteId) return fail(400, 'noteId geçersiz.');
    if (!Number.isInteger(count) || count < 5 || count > 20) return fail(400, 'Kart sayısı 5 ile 20 arasında olmalı.');
    return [{ json: { ok: true, userId: auth.userId, noteId, count, payload: toPayload({ userId: auth.userId, noteId }) } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(sql('SQL: notu getir', `
SET NOCOUNT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
SELECT n.Id AS noteId, n.Title AS title, n.Content AS content,
       (SELECT COUNT(*) FROM dbo.Flashcards f WHERE f.NoteId = n.Id) AS existingCards,
       (SELECT f.Front AS front FROM dbo.Flashcards f WHERE f.NoteId = n.Id FOR JSON PATH) AS existingFronts
FROM (SELECT 1 AS x) d
LEFT JOIN dbo.Notes n ON n.Id = JSON_VALUE(@j, '$.noteId') AND n.UserId = JSON_VALUE(@j, '$.userId');
`, [720, 300]));
  w.add(ifTrue('Not var mı?', '!!$json.noteId', [960, 300]));
  w.add(code('Not bulunamadı', function () {
    return [{ json: { status: 404, body: { error: 'Not bulunamadı.' } } }];
  }, [1200, 520]));
  w.add(code('Prompt hazırla', function () {
    const v = $('Girdiyi doğrula').first().json;
    const note = $input.first().json;
    const existing = JSON.parse(note.existingFronts || '[]').map((c) => c.front);

    // PROMPT (kart): tek bir bilgiyi soran kısa ön yüz, net ve kısa arka yüz
    const system = 'Sen öğrencilerin aralıklı tekrarla çalışması için ezber kartı (flashcard) hazırlayan bir eğitim uzmanısın. Türkçe ve yalnızca Latin alfabesiyle yazarsın. Yalnızca geçerli JSON üretirsin.';
    const user = [
      `Aşağıdaki ders notundan ${v.count} adet ezber kartı hazırla.`,
      '',
      'Kurallar:',
      '- "front": tek bir kavramı veya bilgiyi soran kısa bir soru (en fazla 120 karakter).',
      '- "back": doğru ve kısa cevap (1-2 cümle, en fazla 250 karakter).',
      '- "topic": kartın konusu, 2-4 kelime.',
      '- Kartlar notun farklı bölümlerini kapsasın; aynı bilgiyi iki kez sorma; yalnızca notta geçen bilgileri kullan.',
      existing.length ? `- Şu kartlar zaten var, bunları tekrar etme: ${existing.slice(0, 30).join(' | ')}` : '',
      '',
      'JSON biçimi: {"cards":[{"front":"...","back":"...","topic":"..."}]}',
      '',
      `DERS NOTU ("${note.title}"):`,
      '"""',
      truncate(note.content),
      '"""',
    ].filter((l) => l !== '').join('\n');
    const format = {
      type: 'object',
      properties: {
        cards: { type: 'array', minItems: v.count, maxItems: v.count, items: {
          type: 'object',
          properties: { front: { type: 'string' }, back: { type: 'string' }, topic: { type: 'string' } },
          required: ['front', 'back', 'topic'],
        } },
      },
      required: ['cards'],
    };
    return [{ json: { title: note.title, existing, ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.4, format }) } }];
  }, [1200, 220], { libs: AI }));
  w.add(ollama('Ollama: kart üret', [1440, 220], 'format: JSON şeması'));
  w.add(code('Kartları doğrula', function () {
    const v = $('Girdiyi doğrula').first().json;
    const base = $('Prompt hazırla').first().json;
    const data = parseModelJson(($input.first().json.message || {}).content);
    const seen = new Set(base.existing.map((f) => f.toLocaleLowerCase('tr')));
    const cards = [];
    for (const c of (data && Array.isArray(data.cards) ? data.cards : [])) {
      const front = String((c && c.front) || '').trim().slice(0, 500);
      const back = String((c && c.back) || '').trim().slice(0, 1000);
      const topic = String((c && c.topic) || '').trim().slice(0, 200) || null;
      const key = front.toLocaleLowerCase('tr');
      if (!front || !back || seen.has(key)) continue;
      seen.add(key);
      cards.push({ front, back, topic });
    }
    if (cards.length < 3) return fail(502, 'Model yeterli sayıda geçerli kart üretemedi, lütfen tekrar deneyin.');
    return [{ json: { ok: true, cards, payload: toPayload({ userId: v.userId, noteId: v.noteId, cards }) } }];
  }, [1680, 220], { libs: AI }));
  w.add(ifTrue('Kart var mı?', '$json.ok', [1920, 220]));
  w.add(sql('SQL: kartları kaydet', `
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @u INT = JSON_VALUE(@j, '$.userId'), @n INT = JSON_VALUE(@j, '$.noteId');

BEGIN TRAN;
INSERT dbo.Flashcards (UserId, NoteId, Front, Back, Topic)
SELECT @u, @n, front, back, topic
FROM OPENJSON(@j, '$.cards') WITH (front NVARCHAR(500), back NVARCHAR(1000), topic NVARCHAR(200));
DECLARE @created INT = @@ROWCOUNT;
COMMIT;
SELECT @created AS created,
       (SELECT COUNT(*) FROM dbo.Flashcards WHERE UserId = @u AND DueAt <= SYSUTCDATETIME()) AS dueCards;
`, [2160, 140], 'Yeni kartlar hemen tekrar listesine girer'));
  w.add(code('Yanıtı biçimle', function () {
    const r = $input.first().json;
    return [{ json: { status: 201, body: {
      created: r.created, dueCards: r.dueCards, noteTitle: $('Prompt hazırla').first().json.title,
      cards: $('Kartları doğrula').first().json.cards,
    } } }];
  }, [2400, 140]));
  w.add(code('Hata: veritabanı', dbError, [2400, 520]));
  w.add(code('Hata: Ollama', llmError, [1680, 420]));
  w.add(respond('Yanıtla', [2640, 300]));

  w.chain('Webhook: flashcards', 'Girdiyi doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: notu getir', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: notu getir', 'Not var mı?', 0).link('SQL: notu getir', 'Hata: veritabanı', 1);
  w.link('Not var mı?', 'Prompt hazırla', 0).link('Not var mı?', 'Not bulunamadı', 1);
  w.link('Prompt hazırla', 'Ollama: kart üret');
  w.link('Ollama: kart üret', 'Kartları doğrula', 0).link('Ollama: kart üret', 'Hata: Ollama', 1);
  w.link('Kartları doğrula', 'Kart var mı?');
  w.link('Kart var mı?', 'SQL: kartları kaydet', 0).link('Kart var mı?', 'Yanıtla', 1);
  w.link('SQL: kartları kaydet', 'Yanıtı biçimle', 0).link('SQL: kartları kaydet', 'Hata: veritabanı', 1);
  w.link('Yanıtı biçimle', 'Yanıtla').link('Not bulunamadı', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla').link('Hata: Ollama', 'Yanıtla');
  return w;
}

// ========================================================= /extract-image
// Defter / tahta fotoğrafını yerel görsel modelle (gemma4:12b) metne çevirir.
export function extractImageWorkflow() {
  const w = new Workflow('akExtractImage01', '11 - Fotoğraftan Not (POST /webhook/extract-image)');
  w.add(webhook('Webhook: extract-image', 'extract-image', [0, 300]));
  w.add(code('Görseli doğrula', function () {
    const item = $input.first();
    const auth = requireUser(item.json);
    if (auth.error) return auth.error;
    const files = item.binary || {};
    const file = files.file || Object.values(files)[0];
    if (!file) return fail(400, 'multipart/form-data ile "file" alanında bir fotoğraf gönderin.');
    const isImage = /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimeType || '') || /\.(jpe?g|png|webp|heic)$/i.test(file.fileName || '');
    if (!isImage) return fail(415, 'Yalnızca JPG, PNG veya WEBP fotoğraf yüklenebilir.');
    return [{ json: { ok: true, fileName: file.fileName }, binary: { data: file } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(fileToBase64('Görseli base64 yap', [720, 220]));
  w.add(code('Prompt hazırla', function () {
    const image = $input.first().json.imageBase64;
    if (!image) return fail(422, 'Fotoğraf okunamadı.');
    if (image.length > 14 * 1024 * 1024) return fail(413, 'Fotoğraf çok büyük (en fazla ~10 MB).');
    // PROMPT (görsel -> metin): yorum katmadan, Türkçe karakterleri koruyarak birebir aktar
    const system = 'Sen ders notlarını dijitalleştiren bir OCR asistanısın. Fotoğraftaki el yazısı veya basılı ders notunu Türkçe karakterleri (ç, ğ, ı, İ, ö, ş, ü) koruyarak birebir metne dökersin. Yorum, açıklama veya özet eklemezsin; okuyamadığın kelimeyi [?] ile belirtirsin.';
    const user = 'Bu fotoğraftaki tüm ders notunu satır satır, madde işaretleri ve başlıklarla birlikte aynen yaz.';
    const body = {
      model: $env.OLLAMA_VISION_MODEL || 'gemma4:12b',
      stream: false,
      think: false, // görsel modelin düşünme modu kapalı: yalnızca metni üretsin
      keep_alive: $env.OLLAMA_KEEP_ALIVE || '30m',
      options: { temperature: 0.1, num_ctx: 8192, num_predict: 3000 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user, images: [image] }],
    };
    return [{ json: { ok: true, ollama: { url: OLLAMA.url, body, timeout: Number($env.OLLAMA_VISION_TIMEOUT_MS || 600000) } } }];
  }, [960, 220], { libs: AI }));
  w.add(ifTrue('Görsel hazır mı?', '$json.ok', [1200, 220]));
  w.add(ollama('Ollama: görseli oku', [1440, 140], 'Görsel model (vision)'));
  w.add(code('Metni temizle', function () {
    const text = cleanText(modelText($input.first().json)).replace(/^```[a-z]*\n?|```$/g, '').trim();
    if (text.length < 20) return [{ json: { status: 422, body: { error: 'Fotoğrafta okunabilir metin bulunamadı. Daha net ve aydınlık bir fotoğraf deneyin.' } } }];
    return [{ json: { status: 200, body: {
      fileName: $('Görseli doğrula').first().json.fileName, characters: text.length,
      model: $env.OLLAMA_VISION_MODEL || 'gemma4:12b', text,
    } } }];
  }, [1680, 140], { libs: AI }));
  w.add(code('Fotoğraf okunamadı', function () {
    return [{ json: { status: 422, body: { error: 'Fotoğraf dosyası okunamadı.' } } }];
  }, [960, 460]));
  w.add(code('Hata: Ollama', llmError, [1680, 360]));
  w.add(respond('Yanıtla', [1920, 300]));

  w.chain('Webhook: extract-image', 'Görseli doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'Görseli base64 yap', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('Görseli base64 yap', 'Prompt hazırla', 0).link('Görseli base64 yap', 'Fotoğraf okunamadı', 1);
  w.link('Prompt hazırla', 'Görsel hazır mı?');
  w.link('Görsel hazır mı?', 'Ollama: görseli oku', 0).link('Görsel hazır mı?', 'Yanıtla', 1);
  w.link('Ollama: görseli oku', 'Metni temizle', 0).link('Ollama: görseli oku', 'Hata: Ollama', 1);
  w.link('Metni temizle', 'Yanıtla').link('Fotoğraf okunamadı', 'Yanıtla').link('Hata: Ollama', 'Yanıtla');
  return w;
}

// ========================================================= Haftalık rapor
// Her pazartesi 09:00 (WEEKLY_REPORT_ENABLED=true ise) aktif kullanıcılara;
// ya da uygulamadan POST /webhook/weekly-report ile yalnızca isteyen kullanıcıya.
export function weeklyReportWorkflow() {
  const w = new Workflow('akWeeklyReport01', '12 - Haftalık E-posta Raporu (Schedule + POST /webhook/weekly-report)');
  w.add(weeklySchedule('Her pazartesi 09:00', [0, 160], { day: 1, hour: 9 }));
  w.add(code('Zamanlanmış mod', function () {
    // Varsayılan kapalı: yanlışlıkla gerçek/sahte adreslere toplu e-posta gitmesin
    if (String($env.WEEKLY_REPORT_ENABLED).toLowerCase() !== 'true') return [];
    return [{ json: { payload: toPayload({ mode: 'all', dryRun: false }) } }];
  }, [240, 160], { libs: AUTH }));
  w.add(webhook('Webhook: weekly-report', 'weekly-report', [0, 440]));
  w.add(code('Girdiyi doğrula', function () {
    const req = $input.first().json;
    const auth = requireUser(req);
    if (auth.error) return auth.error;
    // dryRun: true -> e-posta gönderilmez, HTML önizlemesi döner
    const dryRun = !!(req.body && req.body.dryRun);
    return [{ json: { ok: true, payload: toPayload({ mode: 'single', userId: auth.userId, dryRun }) } }];
  }, [240, 440], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 440]));
  w.add(sql('SQL: haftalık veriler', `
SET NOCOUNT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @mode NVARCHAR(10) = JSON_VALUE(@j, '$.mode'),
        @uid INT = TRY_CAST(JSON_VALUE(@j, '$.userId') AS INT),
        @dry BIT = CASE WHEN JSON_VALUE(@j, '$.dryRun') = 'true' THEN 1 ELSE 0 END,
        @since DATETIME2 = DATEADD(DAY, -7, SYSUTCDATETIME()),
        @prev DATETIME2 = DATEADD(DAY, -14, SYSUTCDATETIME());

SELECT @mode AS mode, @dry AS dryRun, u.Id AS userId, u.Email AS email, u.Name AS name,
    (SELECT COUNT(*) FROM dbo.Notes WHERE UserId = u.Id AND CreatedAt >= @since) AS notesWeek,
    (SELECT COUNT(*) FROM dbo.QuizResults WHERE UserId = u.Id AND CreatedAt >= @since) AS quizzesWeek,
    (SELECT COUNT(*) FROM dbo.ChatMessages WHERE UserId = u.Id AND Role = N'user' AND CreatedAt >= @since) AS questionsWeek,
    (SELECT CAST(100.0 * SUM(Score) / NULLIF(SUM(Total), 0) AS DECIMAL(5,1)) FROM dbo.QuizResults WHERE UserId = u.Id AND CreatedAt >= @since) AS rateWeek,
    (SELECT CAST(100.0 * SUM(Score) / NULLIF(SUM(Total), 0) AS DECIMAL(5,1)) FROM dbo.QuizResults WHERE UserId = u.Id AND CreatedAt >= @prev AND CreatedAt < @since) AS ratePrev,
    (SELECT COUNT(*) FROM dbo.Flashcards WHERE UserId = u.Id AND DueAt <= DATEADD(DAY, 1, SYSUTCDATETIME())) AS dueCards,
    (SELECT TOP 5 t.Topic AS topic, c.Name AS course, t.SuccessRate AS successRate
       FROM dbo.vw_TopicPerformance t JOIN dbo.Courses c ON c.Id = t.CourseId
      WHERE t.UserId = u.Id AND t.Wrong > 0 ORDER BY t.SuccessRate ASC, t.Wrong DESC FOR JSON PATH) AS weakTopics,
    (SELECT s.CourseName AS course, s.SuccessRate AS successRate, s.QuizAttempts AS attempts
       FROM dbo.vw_CourseStats s WHERE s.UserId = u.Id AND s.QuizAttempts > 0 ORDER BY s.SuccessRate FOR JSON PATH) AS courses
FROM dbo.Users u
WHERE (@mode = N'single' AND u.Id = @uid)
   OR (@mode = N'all' AND (EXISTS (SELECT 1 FROM dbo.QuizResults r WHERE r.UserId = u.Id AND r.CreatedAt >= @prev)
                        OR EXISTS (SELECT 1 FROM dbo.Notes n WHERE n.UserId = u.Id AND n.CreatedAt >= @prev)
                        OR EXISTS (SELECT 1 FROM dbo.Flashcards f WHERE f.UserId = u.Id AND f.DueAt <= SYSUTCDATETIME())));
`, [720, 300], 'Son 7 gün vs önceki 7 gün'));
  w.add(code('E-postaları hazırla', function () {
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pct = (x) => (x === null || x === undefined ? '—' : `%${Math.round(Number(x))}`);
    const rows = $input.all().map((i) => i.json).filter((r) => r.userId);
    return rows.map((r) => {
      const weak = JSON.parse(r.weakTopics || '[]');
      const courses = JSON.parse(r.courses || '[]');
      const first = String(r.name || '').split(' ')[0];
      const diff = r.rateWeek !== null && r.ratePrev !== null ? Math.round(r.rateWeek - r.ratePrev) : null;
      const trend = diff === null ? '' : diff >= 0 ? `<span style="color:#1b8a3a">▲ ${diff} puan</span>` : `<span style="color:#c62828">▼ ${-diff} puan</span>`;
      const tile = (label, value, extra = '') =>
        `<td style="padding:12px;background:#f4f1fb;border-radius:14px;text-align:center;width:25%"><div style="font-size:22px;font-weight:700;color:#4a3aa8">${value}</div><div style="font-size:12px;color:#555">${label}</div>${extra ? `<div style="font-size:12px">${extra}</div>` : ''}</td>`;
      const weakHtml = weak.length
        ? `<ul style="padding-left:18px;margin:8px 0">${weak.map((t) => `<li><b>${esc(t.topic)}</b> <span style="color:#777">(${esc(t.course)}, başarı ${pct(t.successRate)})</span></li>`).join('')}</ul>`
        : '<p style="color:#555">Bu hafta belirgin bir zayıf konun yok, harika! 🎉</p>';
      const courseHtml = courses.length
        ? courses.map((c) => `<tr><td style="padding:4px 0">${esc(c.course)}</td><td style="text-align:right">${pct(c.successRate)}</td><td style="text-align:right;color:#777">${c.attempts} test</td></tr>`).join('')
        : '';
      const html = `<!doctype html><html><body style="margin:0;background:#f8f7fc;font-family:Segoe UI,Arial,sans-serif;color:#222">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#cfc6ff,#f3b8cf);border-radius:24px;padding:24px">
    <div style="font-size:13px;color:#4a3aa8;font-weight:600">AKADEMİ KOÇUM · HAFTALIK RAPOR</div>
    <h1 style="margin:6px 0 0;font-size:24px">Merhaba ${esc(first)} 👋</h1>
    <p style="margin:6px 0 0">Son 7 günde neler yaptığına bir bakalım.</p>
  </div>
  <table style="width:100%;border-spacing:8px;margin-top:12px"><tr>
    ${tile('çözülen test', r.quizzesWeek)}${tile('başarı', pct(r.rateWeek), trend)}${tile('sorulan soru', r.questionsWeek)}${tile('yeni not', r.notesWeek)}
  </tr></table>
  <div style="background:#fff;border-radius:20px;padding:20px;margin-top:8px">
    <h3 style="margin:0">📌 Odaklanman gereken konular</h3>${weakHtml}
    ${courseHtml ? `<h3 style="margin:16px 0 4px">📚 Ders bazlı başarı</h3><table style="width:100%;font-size:14px">${courseHtml}</table>` : ''}
    <h3 style="margin:16px 0 4px">🔁 Bugün tekrar zamanı</h3>
    <p style="margin:0">${r.dueCards > 0 ? `<b>${r.dueCards}</b> kartın tekrar zamanı geldi. Uygulamada "Bugün tekrar" kartına dokunarak 5 dakikada bitirebilirsin.` : 'Tekrar bekleyen kartın yok. Bir notundan yeni kart oluşturmayı dene.'}</p>
  </div>
  <p style="font-size:12px;color:#888;text-align:center;margin-top:16px">Bu e-posta Akademi Koçum tarafından otomatik oluşturuldu. Verilerin yalnızca senin bilgisayarında, yerel olarak işlenir.</p>
</div></body></html>`;
      return { json: {
        mode: r.mode, dryRun: r.dryRun === true || r.dryRun === 1, userId: r.userId, to: r.email,
        subject: `📊 Haftalık raporun: ${r.quizzesWeek} test, başarı ${pct(r.rateWeek)}`, html,
      } };
    });
  }, [960, 300]));
  w.add(ifTrue('Önizleme mi?', '$json.dryRun', [1200, 300]));
  w.add(code('Önizleme yanıtı', function () {
    const m = $input.first().json;
    return [{ json: { status: 200, body: { dryRun: true, sent: false, to: m.to, subject: m.subject, html: m.html } } }];
  }, [1440, 200]));
  w.add(emailSend('E-posta gönder (Brevo)', [1440, 400]));
  w.add(code('Gönderim özeti', function () {
    const mails = $('E-postaları hazırla').all().map((i) => i.json);
    return [{ json: {
      mode: mails[0] && mails[0].mode, status: 200,
      body: { dryRun: false, sent: true, count: $input.all().length, to: mails.length === 1 ? mails[0].to : undefined },
    } }];
  }, [1680, 340]));
  w.add(code('Hata: e-posta', function () {
    const err = $input.first().json.error;
    console.log('[email-error]', typeof err === 'string' ? err : JSON.stringify(err));
    const mode = ($('E-postaları hazırla').first().json || {}).mode;
    return [{ json: { mode, status: 502, body: { error: 'E-posta gönderilemedi. Brevo SMTP ayarlarını (.env) kontrol edin.' } } }];
  }, [1680, 500]));
  w.add(ifTrue('Uygulamadan mı?', "$json.mode === 'single'", [1920, 420]));
  w.add(code('Hata: veritabanı', dbError, [960, 560]));
  w.add(respond('Yanıtla', [2160, 440]));

  w.chain('Her pazartesi 09:00', 'Zamanlanmış mod', 'SQL: haftalık veriler');
  w.chain('Webhook: weekly-report', 'Girdiyi doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: haftalık veriler', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: haftalık veriler', 'E-postaları hazırla', 0).link('SQL: haftalık veriler', 'Hata: veritabanı', 1);
  w.link('E-postaları hazırla', 'Önizleme mi?');
  w.link('Önizleme mi?', 'Önizleme yanıtı', 0).link('Önizleme mi?', 'E-posta gönder (Brevo)', 1);
  w.link('E-posta gönder (Brevo)', 'Gönderim özeti', 0).link('E-posta gönder (Brevo)', 'Hata: e-posta', 1);
  w.link('Gönderim özeti', 'Uygulamadan mı?').link('Hata: e-posta', 'Uygulamadan mı?');
  w.link('Uygulamadan mı?', 'Yanıtla', 0);
  w.link('Önizleme yanıtı', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla');
  return w;
}
