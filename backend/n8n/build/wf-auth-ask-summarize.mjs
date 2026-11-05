/* eslint-disable no-undef */
import { Workflow, webhook, code, ifTrue, sql, ollama, respond } from './lib.mjs';
import { authLib, ollamaLib, dbError, llmError } from './common.mjs';

const AUTH = [authLib];
const AI = [authLib, ollamaLib];

// ============================================================== /register
export function registerWorkflow() {
  const w = new Workflow('akAuthRegister01', '01 - Kayıt (POST /webhook/register)', { saveData: false });
  w.add(webhook('Webhook: register', 'register', [0, 300]));
  w.add(code('Girdiyi doğrula + hash', function () {
    const body = $input.first().json.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 256) return fail(400, 'Geçerli bir e-posta adresi girin.');
    if (password.length < 6 || password.length > 128) return fail(400, 'Şifre en az 6 karakter olmalı.');
    if (name.length < 2 || name.length > 100) return fail(400, 'Ad en az 2 karakter olmalı.');

    // scrypt: tuzlu ve kasıtlı olarak yavaş KDF (bcrypt eşdeğeri). Düz şifre saklanmaz.
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    const passwordHash = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
    return [{ json: { ok: true, payload: toPayload({ email, name, passwordHash }) } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(sql('SQL: kullanıcı + varsayılan ders', `
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @email NVARCHAR(256), @name NVARCHAR(100), @hash NVARCHAR(512);
SELECT @email = email, @name = name, @hash = passwordHash
FROM OPENJSON(@j) WITH (email NVARCHAR(256), name NVARCHAR(100), passwordHash NVARCHAR(512));

IF EXISTS (SELECT 1 FROM dbo.Users WHERE Email = @email)
BEGIN
    SELECT N'exists' AS status, CAST(NULL AS INT) AS id, @email AS email, @name AS name;
    RETURN;
END

-- Kullanıcı ve "Genel" dersi tek transaction içinde
BEGIN TRAN;
DECLARE @t TABLE (Id INT);
INSERT dbo.Users (Email, PasswordHash, Name) OUTPUT inserted.Id INTO @t VALUES (@email, @hash, @name);
DECLARE @id INT = (SELECT Id FROM @t);
INSERT dbo.Courses (UserId, Name, Description) VALUES (@id, N'Genel', N'Derse bağlı olmayan notlar ve sorular');
COMMIT;
SELECT N'created' AS status, @id AS id, @email AS email, @name AS name;
`, [720, 300], 'Parametreli: tüm veri $1 içinde'));
  w.add(code('Token üret', function () {
    const r = $input.first().json;
    if (r.status === 'exists') return [{ json: { status: 409, body: { error: 'Bu e-posta ile kayıtlı bir hesap zaten var.' } } }];
    const user = { id: r.id, email: r.email, name: r.name };
    return [{ json: { status: 201, body: { token: signToken({ sub: r.id, email: r.email }), user } } }];
  }, [960, 220], { libs: AUTH }));
  w.add(code('Hata: veritabanı', dbError, [960, 400]));
  w.add(respond('Yanıtla', [1200, 300]));

  w.chain('Webhook: register', 'Girdiyi doğrula + hash', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: kullanıcı + varsayılan ders', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: kullanıcı + varsayılan ders', 'Token üret', 0).link('SQL: kullanıcı + varsayılan ders', 'Hata: veritabanı', 1);
  w.link('Token üret', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla');
  return w;
}

// ================================================================= /login
export function loginWorkflow() {
  const w = new Workflow('akAuthLogin00001', '02 - Giriş (POST /webhook/login)', { saveData: false });
  w.add(webhook('Webhook: login', 'login', [0, 300]));
  w.add(code('Girdiyi doğrula', function () {
    const body = $input.first().json.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return fail(400, 'E-posta ve şifre zorunludur.');
    return [{ json: { ok: true, password, payload: toPayload({ email }) } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(sql('SQL: kullanıcıyı bul', `
SET NOCOUNT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @email NVARCHAR(256) = JSON_VALUE(@j, '$.email');
SELECT u.Id AS id, u.Email AS email, u.Name AS name, u.PasswordHash AS passwordHash
FROM (SELECT 1 AS x) d
LEFT JOIN dbo.Users u ON u.Email = @email;
`, [720, 300]));
  w.add(code('Şifreyi doğrula + token', function () {
    const r = $input.first().json;
    const password = $('Girdiyi doğrula').first().json.password;
    const denied = [{ json: { status: 401, body: { error: 'E-posta veya şifre hatalı.' } } }];
    if (!r.id) return denied;

    const [algo, saltHex, hashHex] = String(r.passwordHash || '').split('$');
    if (algo !== 'scrypt' || !saltHex || !hashHex) return denied;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
    if (!crypto.timingSafeEqual(expected, actual)) return denied;

    const user = { id: r.id, email: r.email, name: r.name };
    return [{ json: { status: 200, body: { token: signToken({ sub: r.id, email: r.email }), user } } }];
  }, [960, 220], { libs: AUTH }));
  w.add(code('Hata: veritabanı', dbError, [960, 400]));
  w.add(respond('Yanıtla', [1200, 300]));

  w.chain('Webhook: login', 'Girdiyi doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: kullanıcıyı bul', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: kullanıcıyı bul', 'Şifreyi doğrula + token', 0).link('SQL: kullanıcıyı bul', 'Hata: veritabanı', 1);
  w.link('Şifreyi doğrula + token', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla');
  return w;
}

// =================================================================== /ask
export function askWorkflow() {
  const w = new Workflow('akAskQuestion001', '03 - Soru-Cevap (POST /webhook/ask)');
  w.add(webhook('Webhook: ask', 'ask', [0, 300]));
  w.add(code('Girdiyi doğrula', function () {
    const req = $input.first().json;
    const auth = requireUser(req);
    if (auth.error) return auth.error;
    const body = req.body || {};
    const question = cleanText(body.question);
    const courseId = body.courseId === null || body.courseId === undefined || body.courseId === '' ? null : toId(body.courseId);
    if (body.courseId && !courseId) return fail(400, 'courseId geçersiz.');
    if (question.length < 2) return fail(400, 'Lütfen bir soru yazın.');
    if (question.length > 2000) return fail(400, 'Soru en fazla 2000 karakter olabilir.');

    // RAG: sorudan anahtar kelimeler (Türkçe ekleri kabaca atmak için 6 harfe kısaltılır)
    const STOP = new Set(['nedir', 'nasıl', 'neden', 'hangi', 'için', 'gibi', 'olan', 'olarak', 'ile', 'bir', 'bu', 'şu', 've', 'veya',
      'ama', 'daha', 'çok', 'ne', 'kadar', 'arasındaki', 'fark', 'farkı', 'açıkla', 'anlat', 'nelerdir', 'midir', 'mıdır', 'var', 'yok']);
    const words = question.toLocaleLowerCase('tr').match(/[\p{L}\p{N}]+/gu) || [];
    const keywords = [...new Set(words.filter((x) => x.length >= 3 && !STOP.has(x)).map((x) => (x.length > 6 ? x.slice(0, 6) : x)))].slice(0, 8);
    const ftsQuery = keywords.map((k) => `"${k}*"`).join(' OR ');
    const limit = Math.min(Math.max(Number($env.CHAT_HISTORY_LIMIT || 10), 0), 50);

    return [{ json: { ok: true, userId: auth.userId, courseId, question, payload: toPayload({ userId: auth.userId, courseId, limit, keywords, ftsQuery }) } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(sql('SQL: geçmiş + not bağlamı', `
SET NOCOUNT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @u INT = JSON_VALUE(@j, '$.userId'),
        @c INT = TRY_CAST(JSON_VALUE(@j, '$.courseId') AS INT),
        @n INT = JSON_VALUE(@j, '$.limit'),
        @fts NVARCHAR(4000) = JSON_VALUE(@j, '$.ftsQuery');

IF @c IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.Courses WHERE Id = @c AND UserId = @u)
BEGIN
    SELECT CAST(0 AS BIT) AS courseOk, CAST(NULL AS NVARCHAR(150)) AS courseName, CAST(NULL AS NVARCHAR(MAX)) AS history, CAST(NULL AS NVARCHAR(MAX)) AS chunks;
    RETURN;
END

-- RAG: soruyla ilgili not parçaları. Full-Text index varsa CONTAINSTABLE, yoksa anahtar kelime eşleşmesi.
DECLARE @chunks TABLE (NoteId INT, Title NVARCHAR(200), Content NVARCHAR(MAX), Score INT);
IF LEN(ISNULL(@fts, N'')) > 0
BEGIN
    IF OBJECTPROPERTY(OBJECT_ID(N'dbo.NoteChunks'), 'TableHasActiveFulltextIndex') = 1
        INSERT @chunks
        EXEC sp_executesql N'
            SELECT TOP 4 n.Id, n.Title, ch.Content, ft.[RANK]
            FROM CONTAINSTABLE(dbo.NoteChunks, Content, @q) ft
            JOIN dbo.NoteChunks ch ON ch.Id = ft.[KEY]
            JOIN dbo.Notes n ON n.Id = ch.NoteId
            WHERE n.UserId = @u AND (@c IS NULL OR n.CourseId = @c)
            ORDER BY ft.[RANK] DESC',
            N'@q NVARCHAR(4000), @u INT, @c INT', @q = @fts, @u = @u, @c = @c;
    ELSE
        INSERT @chunks
        SELECT TOP 4 n.Id, n.Title, ch.Content, s.Score
        FROM (
            SELECT ch2.Id, SUM(CASE WHEN ch2.Content LIKE N'%' + k.[value] + N'%' THEN 1 ELSE 0 END) AS Score
            FROM dbo.NoteChunks ch2
            JOIN dbo.Notes n2 ON n2.Id = ch2.NoteId
            CROSS JOIN OPENJSON(@j, '$.keywords') k
            WHERE n2.UserId = @u AND (@c IS NULL OR n2.CourseId = @c)
            GROUP BY ch2.Id
        ) s
        JOIN dbo.NoteChunks ch ON ch.Id = s.Id
        JOIN dbo.Notes n ON n.Id = ch.NoteId
        WHERE s.Score > 0
        ORDER BY s.Score DESC;
END

SELECT
    CAST(1 AS BIT) AS courseOk,
    (SELECT Name FROM dbo.Courses WHERE Id = @c) AS courseName,
    (SELECT h.Role AS role, h.Content AS content
       FROM (SELECT TOP (@n) Id, Role, Content FROM dbo.ChatMessages
             WHERE UserId = @u AND ((@c IS NULL AND CourseId IS NULL) OR CourseId = @c)
             ORDER BY Id DESC) h
      ORDER BY h.Id
      FOR JSON PATH) AS history,
    (SELECT NoteId AS noteId, Title AS title, Content AS content FROM @chunks ORDER BY Score DESC FOR JSON PATH) AS chunks;
`, [720, 300], 'Son N mesaj + RAG parçaları'));
  w.add(code('Prompt hazırla', function () {
    const v = $('Girdiyi doğrula').first().json;
    const ctx = $input.first().json;
    if (!ctx.courseOk) return fail(404, 'Ders bulunamadı.');

    const history = JSON.parse(ctx.history || '[]');
    const chunks = JSON.parse(ctx.chunks || '[]');

    // PROMPT (soru-cevap): Türkçe, öğretici, notlara dayalı, uydurmayan asistan
    const system = [
      'Sen "Akademi Koçum" adlı, üniversite öğrencilerine ders çalışmada yardım eden bir yapay zekâ asistanısın.',
      'Kurallar:',
      '- Her zaman Türkçe yanıt ver ve yalnızca Latin alfabesi kullan (Çince veya başka alfabeden karakter kullanma).',
      '- Açık, doğru ve öğretici ol; gerektiğinde kısa bir örnek ver.',
      '- Kalın yazı (**) veya başlık (#) kullanma; liste için satır başında "- " kullan.',
      '- Sana "Öğrencinin ders notlarından ilgili bölümler" verildiyse öncelikle onlara dayan. Notta olmayan bilgiyi verirsen bunun genel bilgi olduğunu belirt.',
      '- Notlardaki bir bölümden aldığın her bilginin cümle sonuna o bölümün numarasını köşeli parantezle yaz, ör. "... yeniden çizilir [1]." Notta olmayan bilgiye numara koyma.',
      '- Bilmediğin bir şeyi uydurma; emin değilsen bunu söyle.',
      '- Yanıtını en fazla 250 kelimede tut; gerekirse madde işaretleri kullan.',
      ctx.courseName ? `- Öğrenci şu an "${ctx.courseName}" dersi hakkında soru soruyor.` : '',
    ].filter(Boolean).join('\n');

    const messages = [{ role: 'system', content: system }];
    if (chunks.length) {
      const context = chunks.map((c, i) => `[${i + 1}] (${c.title})\n${c.content}`).join('\n\n');
      messages.push({ role: 'system', content: [
        `Öğrencinin ders notlarından ilgili bölümler:\n\n${truncate(context, 6000)}`,
        '',
        'ATIF KURALI: Bu bölümlerden aldığın her bilginin cümle sonuna bölüm numarasını köşeli parantezle ekle.',
        'Örnek: "setState() çağrıldığında build() yeniden çalışır [1]. Hot reload ise durumu korur [2]."',
      ].join('\n') });
    }
    for (const m of history) messages.push({ role: m.role, content: m.content });
    messages.push({ role: 'user', content: v.question });

    // Atıf için: [n] -> hangi notun hangi parçası (istemcide kaynak kartı olarak gösterilir)
    const sources = chunks.map((c, i) => ({ index: i + 1, noteId: c.noteId, title: c.title, excerpt: c.content.slice(0, 400) }));
    return [{ json: { ok: true, usedNotes: chunks.length, sources, ollama: chatRequest(messages, { temperature: 0.4 }) } }];
  }, [960, 300], { libs: AI }));
  w.add(ifTrue('Ders var mı?', '$json.ok', [1200, 300]));
  w.add(ollama('Ollama: yanıt üret', [1440, 300], 'POST /api/chat'));
  w.add(code('Yanıtı al', function () {
    const v = $('Girdiyi doğrula').first().json;
    const available = $('Prompt hazırla').first().json.sources || [];
    let answer = modelText($input.first().json).replace(/\*\*/g, '');
    if (!answer) return fail(502, 'Model boş yanıt döndürdü, lütfen tekrar deneyin.');
    // Yalnızca yanıtta gerçekten atıf yapılan ([1], [2] ...) parçalar kaynak olarak döner;
    // olmayan bir numaraya yapılan atıf metinden silinir.
    const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
    answer = answer.replace(/\s?\[(\d+)\]/g, (m, n) => (available.some((s) => s.index === Number(n)) ? m : ''));
    // Model atıf yapmadıysa yine de yararlanılan not parçaları gösterilir (cited: false)
    const sources = cited.size
      ? available.filter((s) => cited.has(s.index)).map((s) => ({ ...s, cited: true }))
      : available.map((s) => ({ ...s, cited: false }));
    return [{ json: { ok: true, answer, sources, payload: toPayload({ userId: v.userId, courseId: v.courseId, question: v.question, answer, sources: JSON.stringify(sources) }) } }];
  }, [1680, 220], { libs: AI }));
  w.add(ifTrue('Yanıt var mı?', '$json.ok', [1920, 220]));
  w.add(sql('SQL: mesajları kaydet', `
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @u INT, @c INT, @q NVARCHAR(MAX), @a NVARCHAR(MAX), @src NVARCHAR(MAX);
SELECT @u = userId, @c = courseId, @q = question, @a = answer, @src = sources
FROM OPENJSON(@j) WITH (userId INT, courseId INT, question NVARCHAR(MAX), answer NVARCHAR(MAX), sources NVARCHAR(MAX));

BEGIN TRAN;
INSERT dbo.ChatMessages (UserId, CourseId, Role, Content) VALUES (@u, @c, N'user', @q);
INSERT dbo.ChatMessages (UserId, CourseId, Role, Content, Sources) VALUES (@u, @c, N'assistant', @a, NULLIF(@src, N'[]'));
DECLARE @mid INT = SCOPE_IDENTITY();
COMMIT;
SELECT @mid AS messageId;
`, [2160, 220]));
  w.add(code('Yanıtı biçimle', function () {
    const a = $('Yanıtı al').first().json;
    const p = $('Prompt hazırla').first().json;
    return [{ json: { status: 200, body: { answer: a.answer, sources: a.sources, messageId: $input.first().json.messageId, usedNotes: p.usedNotes } } }];
  }, [2400, 140]));
  w.add(code('Hata: veritabanı', dbError, [2400, 460]));
  w.add(code('Hata: Ollama', llmError, [1680, 460]));
  w.add(respond('Yanıtla', [2640, 300]));

  w.chain('Webhook: ask', 'Girdiyi doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: geçmiş + not bağlamı', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: geçmiş + not bağlamı', 'Prompt hazırla', 0).link('SQL: geçmiş + not bağlamı', 'Hata: veritabanı', 1);
  w.link('Prompt hazırla', 'Ders var mı?');
  w.link('Ders var mı?', 'Ollama: yanıt üret', 0).link('Ders var mı?', 'Yanıtla', 1);
  w.link('Ollama: yanıt üret', 'Yanıtı al', 0).link('Ollama: yanıt üret', 'Hata: Ollama', 1);
  w.link('Yanıtı al', 'Yanıt var mı?');
  w.link('Yanıt var mı?', 'SQL: mesajları kaydet', 0).link('Yanıt var mı?', 'Yanıtla', 1);
  w.link('SQL: mesajları kaydet', 'Yanıtı biçimle', 0).link('SQL: mesajları kaydet', 'Hata: veritabanı', 1);
  w.link('Yanıtı biçimle', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla').link('Hata: Ollama', 'Yanıtla');
  return w;
}

// ============================================================= /summarize
export function summarizeWorkflow() {
  const w = new Workflow('akSummarizeNote1', '04 - Not Özetleme (POST /webhook/summarize)');
  w.add(webhook('Webhook: summarize', 'summarize', [0, 300]));
  w.add(code('Girdiyi doğrula + temizle', function () {
    const req = $input.first().json;
    const auth = requireUser(req);
    if (auth.error) return auth.error;
    const body = req.body || {};
    const courseId = toId(body.courseId);
    const title = cleanText(body.title).replace(/\n/g, ' ').slice(0, 200) || 'Başlıksız not';
    const content = cleanText(body.content);
    if (!courseId) return fail(400, 'Bir ders seçmelisiniz (courseId).');
    if (content.length < 50) return fail(400, 'Not metni en az 50 karakter olmalı.');
    if (content.length > 100000) return fail(413, 'Not metni en fazla 100.000 karakter olabilir.');

    // RAG için ~800 karakterlik, paragraf sınırlarına saygılı, 100 karakter örtüşmeli parçalar
    const chunks = [];
    const paragraphs = content.split(/\n\n+/);
    let buf = '';
    for (const p of paragraphs) {
      if ((buf + '\n\n' + p).length > 800 && buf) {
        chunks.push(buf.trim());
        buf = buf.slice(-100) + '\n\n' + p;
      } else {
        buf = buf ? `${buf}\n\n${p}` : p;
      }
      while (buf.length > 1200) {
        chunks.push(buf.slice(0, 800).trim());
        buf = buf.slice(700);
      }
    }
    if (buf.trim()) chunks.push(buf.trim());

    return [{ json: {
      ok: true, userId: auth.userId, courseId, title, content,
      chunks: chunks.map((c, i) => ({ chunkIndex: i, content: c })),
      payload: toPayload({ userId: auth.userId, courseId }),
    } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(sql('SQL: ders sahibi mi?', `
SET NOCOUNT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
SELECT COUNT(*) AS found FROM dbo.Courses
WHERE Id = JSON_VALUE(@j, '$.courseId') AND UserId = JSON_VALUE(@j, '$.userId');
`, [720, 300]));
  w.add(ifTrue('Ders var mı?', 'Number($json.found) === 1', [960, 300]));
  w.add(code('Prompt hazırla', function () {
    const v = $('Girdiyi doğrula + temizle').first().json;
    // PROMPT (özet): yapılandırılmış, yalnızca nottaki bilgiye dayanan Türkçe özet
    const system = 'Sen deneyimli bir üniversite asistanısın. Öğrencilerin ders notlarını Türkçe, doğru ve öğretici biçimde özetlersin. Notta olmayan bilgi eklemezsin. Yalnızca Türkçe Latin harfleri kullanırsın; Çince veya başka alfabeden karakter kullanmazsın.';
    const user = [
      `Aşağıdaki "${v.title}" başlıklı ders notunu Türkçe özetle.`,
      '',
      'Biçim (başlıkları aynen kullan):',
      'Genel Bakış: notun ana fikrini anlatan 2-3 cümle.',
      'Anahtar Kavramlar: en önemli 4-8 kavram, her biri "- Kavram: kısa açıklama" satırı olarak.',
      'Sınavda Dikkat: 2-3 maddelik hatırlatma, her biri "- " ile başlayan satır.',
      '',
      'Kurallar: Yalnızca notta geçen bilgilere dayan. Markdown başlık işareti (#) veya kalın yazı (**) kullanma.',
      '',
      'DERS NOTU:',
      '"""',
      truncate(v.content),
      '"""',
    ].join('\n');
    return [{ json: { ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.3 }) } }];
  }, [1200, 220], { libs: AI }));
  w.add(code('Ders bulunamadı', function () {
    return [{ json: { status: 404, body: { error: 'Ders bulunamadı.' } } }];
  }, [1200, 460]));
  w.add(ollama('Ollama: özetle', [1440, 220], 'POST /api/chat'));
  w.add(code('Özeti al', function () {
    const v = $('Girdiyi doğrula + temizle').first().json;
    const summary = modelText($input.first().json).replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();
    if (!summary) return fail(502, 'Model boş özet döndürdü, lütfen tekrar deneyin.');
    return [{ json: { ok: true, summary, payload: toPayload({ userId: v.userId, courseId: v.courseId, title: v.title, content: v.content, summary, chunks: v.chunks }) } }];
  }, [1680, 140], { libs: AI }));
  w.add(ifTrue('Özet var mı?', '$json.ok', [1920, 140]));
  w.add(sql('SQL: not + parçaları kaydet', `
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @u INT = JSON_VALUE(@j, '$.userId'), @c INT = JSON_VALUE(@j, '$.courseId');

BEGIN TRAN;
DECLARE @t TABLE (Id INT);
INSERT dbo.Notes (UserId, CourseId, Title, Content, Summary) OUTPUT inserted.Id INTO @t
SELECT @u, @c, p.title, p.content, p.summary
FROM OPENJSON(@j) WITH (title NVARCHAR(200), content NVARCHAR(MAX), summary NVARCHAR(MAX)) p
WHERE EXISTS (SELECT 1 FROM dbo.Courses WHERE Id = @c AND UserId = @u);

DECLARE @id INT = (SELECT Id FROM @t);
IF @id IS NULL
BEGIN
    ROLLBACK;
    SELECT CAST(NULL AS INT) AS noteId;
    RETURN;
END

INSERT dbo.NoteChunks (NoteId, ChunkIndex, Content)
SELECT @id, chunkIndex, content FROM OPENJSON(@j, '$.chunks') WITH (chunkIndex INT, content NVARCHAR(MAX));
COMMIT;
SELECT @id AS noteId;
`, [2160, 140], 'Not ve RAG parçaları tek transaction'));
  w.add(code('Yanıtı biçimle', function () {
    const v = $('Girdiyi doğrula + temizle').first().json;
    const noteId = $input.first().json.noteId;
    if (!noteId) return [{ json: { status: 404, body: { error: 'Ders bulunamadı.' } } }];
    return [{ json: { status: 201, body: { noteId, courseId: v.courseId, title: v.title, summary: $('Özeti al').first().json.summary } } }];
  }, [2400, 60]));
  w.add(code('Hata: veritabanı', dbError, [2400, 460]));
  w.add(code('Hata: Ollama', llmError, [1680, 380]));
  w.add(respond('Yanıtla', [2640, 300]));

  w.chain('Webhook: summarize', 'Girdiyi doğrula + temizle', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: ders sahibi mi?', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: ders sahibi mi?', 'Ders var mı?', 0).link('SQL: ders sahibi mi?', 'Hata: veritabanı', 1);
  w.link('Ders var mı?', 'Prompt hazırla', 0).link('Ders var mı?', 'Ders bulunamadı', 1);
  w.link('Prompt hazırla', 'Ollama: özetle');
  w.link('Ollama: özetle', 'Özeti al', 0).link('Ollama: özetle', 'Hata: Ollama', 1);
  w.link('Özeti al', 'Özet var mı?');
  w.link('Özet var mı?', 'SQL: not + parçaları kaydet', 0).link('Özet var mı?', 'Yanıtla', 1);
  w.link('SQL: not + parçaları kaydet', 'Yanıtı biçimle', 0).link('SQL: not + parçaları kaydet', 'Hata: veritabanı', 1);
  w.link('Yanıtı biçimle', 'Yanıtla').link('Ders bulunamadı', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla').link('Hata: Ollama', 'Yanıtla');
  return w;
}
