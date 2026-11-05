/* eslint-disable no-undef */
import { Workflow, webhook, errorTrigger, code, ifTrue, sql, ollama, respond, extractPdf } from './lib.mjs';
import { authLib, ollamaLib, dbError, llmError } from './common.mjs';

const AUTH = [authLib];
const AI = [authLib, ollamaLib];

// ================================================================== /data
// Uygulamanın okuma/yönetim uçları tek workflow'da: { action, params }
export function dataWorkflow() {
  const w = new Workflow('akDataApi0000001', '07 - Veri API (POST /webhook/data)');
  w.add(webhook('Webhook: data', 'data', [0, 300]));
  w.add(code('Girdiyi doğrula', function () {
    const req = $input.first().json;
    const auth = requireUser(req);
    if (auth.error) return auth.error;
    const body = req.body || {};
    const action = String(body.action || '');
    const p = body.params || {};
    const optId = (v) => (v === undefined || v === null || v === '' ? null : toId(v));
    const params = {};

    switch (action) {
      case 'dashboard':
      case 'stats':
      case 'courses.list':
        break;
      case 'courses.create': {
        const name = cleanText(p.name).replace(/\n/g, ' ');
        if (name.length < 2 || name.length > 150) return fail(400, 'Ders adı 2-150 karakter olmalı.');
        params.name = name;
        params.description = cleanText(p.description).slice(0, 1000) || null;
        break;
      }
      case 'courses.delete':
        if (!(params.courseId = toId(p.courseId))) return fail(400, 'courseId geçersiz.');
        break;
      case 'notes.list':
        params.courseId = optId(p.courseId);
        params.limit = Math.min(Math.max(Number(p.limit) || 50, 1), 200);
        break;
      case 'notes.get':
        if (!(params.id = toId(p.noteId))) return fail(400, 'noteId geçersiz.');
        break;
      case 'results.get':
        if (!(params.id = toId(p.resultId))) return fail(400, 'resultId geçersiz.');
        break;
      case 'chat.history':
      case 'chat.clear':
        params.courseId = optId(p.courseId);
        params.limit = Math.min(Math.max(Number(p.limit) || 50, 1), 200);
        break;
      case 'cards.due':
        params.courseId = optId(p.courseId);
        params.limit = Math.min(Math.max(Number(p.limit) || 20, 1), 100);
        break;
      case 'cards.review': {
        // SM-2 notu: 0-5 (uygulamada Tekrar=1, Zor=3, İyi=4, Kolay=5)
        const grade = Number(p.grade);
        if (!(params.id = toId(p.cardId))) return fail(400, 'cardId geçersiz.');
        if (!Number.isInteger(grade) || grade < 0 || grade > 5) return fail(400, 'grade 0-5 arasında bir tam sayı olmalı.');
        params.grade = grade;
        break;
      }
      default:
        return fail(400, `Bilinmeyen action: "${action}"`);
    }
    return [{ json: { ok: true, action, payload: toPayload({ userId: auth.userId, action, params }) } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(sql('SQL: action çalıştır', `
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @a NVARCHAR(50) = JSON_VALUE(@j, '$.action'),
        @u INT = JSON_VALUE(@j, '$.userId'),
        @c INT = TRY_CAST(JSON_VALUE(@j, '$.params.courseId') AS INT),
        @id INT = TRY_CAST(JSON_VALUE(@j, '$.params.id') AS INT),
        @lim INT = ISNULL(TRY_CAST(JSON_VALUE(@j, '$.params.limit') AS INT), 50);
DECLARE @r NVARCHAR(MAX) = NULL, @s INT = 200;
DECLARE @t TABLE (Id INT);

IF @a = N'courses.list'
    SET @r = (SELECT s.CourseId AS id, s.CourseName AS name, c.Description AS description, c.CreatedAt AS createdAt,
                     s.NoteCount AS noteCount, s.QuizAttempts AS quizAttempts, s.SuccessRate AS successRate
              FROM dbo.vw_CourseStats s JOIN dbo.Courses c ON c.Id = s.CourseId
              WHERE s.UserId = @u ORDER BY c.CreatedAt
              FOR JSON PATH, INCLUDE_NULL_VALUES);

ELSE IF @a = N'courses.create'
BEGIN
    INSERT dbo.Courses (UserId, Name, Description) OUTPUT inserted.Id INTO @t
    SELECT @u, name, description FROM OPENJSON(@j, '$.params') WITH (name NVARCHAR(150), description NVARCHAR(1000));
    SET @r = (SELECT c.Id AS id, c.Name AS name, c.Description AS description, c.CreatedAt AS createdAt,
                     0 AS noteCount, 0 AS quizAttempts, CAST(NULL AS DECIMAL(5,1)) AS successRate
              FROM dbo.Courses c JOIN @t t ON t.Id = c.Id
              FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
    SET @s = 201;
END

ELSE IF @a = N'courses.delete'
BEGIN
    -- Notlar, testler, sonuçlar ve sohbet mesajları FK cascade ile silinir
    DELETE dbo.Courses WHERE Id = @c AND UserId = @u;
    IF @@ROWCOUNT = 0 SET @s = 404; ELSE SET @r = N'{"deleted":true}';
END

ELSE IF @a = N'notes.list'
    SET @r = (SELECT TOP (@lim) n.Id AS id, n.CourseId AS courseId, c.Name AS courseName, n.Title AS title,
                     LEFT(n.Summary, 300) AS summaryPreview, n.CreatedAt AS createdAt,
                     (SELECT COUNT(*) FROM dbo.Quizzes q WHERE q.NoteId = n.Id) AS quizCount
              FROM dbo.Notes n JOIN dbo.Courses c ON c.Id = n.CourseId
              WHERE n.UserId = @u AND (@c IS NULL OR n.CourseId = @c)
              ORDER BY n.CreatedAt DESC
              FOR JSON PATH, INCLUDE_NULL_VALUES);

ELSE IF @a = N'notes.get'
BEGIN
    SET @r = (SELECT n.Id AS id, n.CourseId AS courseId, c.Name AS courseName, n.Title AS title,
                     n.Content AS content, n.Summary AS summary, n.CreatedAt AS createdAt,
                     JSON_QUERY((SELECT q.Id AS quizId, q.CreatedAt AS createdAt,
                                        (SELECT COUNT(*) FROM dbo.QuizQuestions qq WHERE qq.QuizId = q.Id) AS questionCount
                                 FROM dbo.Quizzes q WHERE q.NoteId = n.Id ORDER BY q.CreatedAt DESC FOR JSON PATH)) AS quizzes
              FROM dbo.Notes n JOIN dbo.Courses c ON c.Id = n.CourseId
              WHERE n.Id = @id AND n.UserId = @u
              FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
    IF @r IS NULL SET @s = 404;
END

ELSE IF @a = N'results.get'
BEGIN
    SET @r = (SELECT r.Id AS resultId, r.QuizId AS quizId, q.NoteId AS noteId, r.Score AS score, r.Total AS total,
                     r.Recommendation AS recommendation, r.CreatedAt AS createdAt, n.Title AS noteTitle, c.Name AS courseName,
                     JSON_QUERY((SELECT qq.QuestionIndex AS questionIndex, qq.QuestionText AS question,
                                        qq.OptionA AS a, qq.OptionB AS b, qq.OptionC AS c, qq.OptionD AS d,
                                        a.SelectedAnswer AS selected, qq.CorrectAnswer AS correctAnswer,
                                        a.IsCorrect AS isCorrect, qq.Explanation AS explanation, qq.Topic AS topic
                                 FROM dbo.QuizAnswers a JOIN dbo.QuizQuestions qq ON qq.Id = a.QuestionId
                                 WHERE a.ResultId = r.Id ORDER BY qq.QuestionIndex
                                 FOR JSON PATH, INCLUDE_NULL_VALUES)) AS results
              FROM dbo.QuizResults r
              JOIN dbo.Quizzes q ON q.Id = r.QuizId
              JOIN dbo.Notes n ON n.Id = q.NoteId
              JOIN dbo.Courses c ON c.Id = q.CourseId
              WHERE r.Id = @id AND r.UserId = @u
              FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);
    IF @r IS NULL SET @s = 404;
END

ELSE IF @a = N'chat.history'
    SET @r = (SELECT h.Id AS id, h.Role AS role, h.Content AS content, h.CreatedAt AS createdAt, JSON_QUERY(h.Sources) AS sources
              FROM (SELECT TOP (@lim) Id, Role, Content, CreatedAt, Sources FROM dbo.ChatMessages
                    WHERE UserId = @u AND ((@c IS NULL AND CourseId IS NULL) OR CourseId = @c)
                    ORDER BY Id DESC) h
              ORDER BY h.Id
              FOR JSON PATH);

ELSE IF @a = N'chat.clear'
BEGIN
    DELETE dbo.ChatMessages WHERE UserId = @u AND ((@c IS NULL AND CourseId IS NULL) OR CourseId = @c);
    SET @r = (SELECT @@ROWCOUNT AS deleted FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
END

ELSE IF @a = N'cards.due'
    SET @r = (SELECT TOP (@lim) f.Id AS id, f.NoteId AS noteId, n.Title AS noteTitle, f.Front AS front, f.Back AS back,
                     f.Topic AS topic, f.Repetitions AS repetitions, f.IntervalDays AS intervalDays, f.DueAt AS dueAt
              FROM dbo.Flashcards f JOIN dbo.Notes n ON n.Id = f.NoteId
              WHERE f.UserId = @u AND f.DueAt <= SYSUTCDATETIME() AND (@c IS NULL OR n.CourseId = @c)
              ORDER BY f.DueAt
              FOR JSON PATH, INCLUDE_NULL_VALUES);

ELSE IF @a = N'cards.review'
BEGIN
    -- SM-2 aralıklı tekrar: not < 3 ise baştan (1 gün), değilse 1 -> 6 -> aralık x kolaylık katsayısı
    DECLARE @g INT = JSON_VALUE(@j, '$.params.grade');
    UPDATE f SET
        Repetitions = x.reps,
        IntervalDays = x.ivl,
        EaseFactor = x.ef,
        DueAt = DATEADD(DAY, x.ivl, SYSUTCDATETIME()),
        ReviewCount = f.ReviewCount + 1,
        LastGrade = @g,
        LastReviewedAt = SYSUTCDATETIME()
    FROM dbo.Flashcards f
    CROSS APPLY (SELECT
        CASE WHEN @g < 3 THEN 0 ELSE f.Repetitions + 1 END AS reps,
        CASE WHEN @g < 3 OR f.Repetitions = 0 THEN 1
             WHEN f.Repetitions = 1 THEN 6
             ELSE CAST(CEILING(f.IntervalDays * f.EaseFactor) AS INT) END AS ivl,
        CAST(CASE WHEN f.EaseFactor + (0.1 - (5 - @g) * (0.08 + (5 - @g) * 0.02)) < 1.3 THEN 1.3
                  ELSE f.EaseFactor + (0.1 - (5 - @g) * (0.08 + (5 - @g) * 0.02)) END AS DECIMAL(4,2)) AS ef
    ) x
    WHERE f.Id = @id AND f.UserId = @u;
    IF @@ROWCOUNT = 0 SET @s = 404;
    ELSE SET @r = (SELECT Id AS id, Repetitions AS repetitions, IntervalDays AS intervalDays, EaseFactor AS easeFactor, DueAt AS dueAt
                   FROM dbo.Flashcards WHERE Id = @id FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
END

ELSE IF @a = N'dashboard'
    SET @r = (SELECT
        (SELECT COUNT(*) FROM dbo.Flashcards WHERE UserId = @u AND DueAt <= SYSUTCDATETIME()) AS dueCards,
        (SELECT COUNT(*) FROM dbo.Flashcards WHERE UserId = @u) AS totalCards,
        (SELECT COUNT(*) FROM dbo.Courses WHERE UserId = @u) AS courseCount,
        (SELECT COUNT(*) FROM dbo.Notes WHERE UserId = @u) AS noteCount,
        (SELECT COUNT(*) FROM dbo.QuizResults WHERE UserId = @u) AS quizCount,
        (SELECT CAST(100.0 * SUM(Score) / NULLIF(SUM(Total), 0) AS DECIMAL(5,1)) FROM dbo.QuizResults WHERE UserId = @u) AS successRate,
        JSON_QUERY((SELECT TOP 5 n.Id AS id, n.Title AS title, c.Name AS courseName, n.CourseId AS courseId,
                           LEFT(n.Summary, 200) AS summaryPreview, n.CreatedAt AS createdAt
                    FROM dbo.Notes n JOIN dbo.Courses c ON c.Id = n.CourseId
                    WHERE n.UserId = @u ORDER BY n.CreatedAt DESC FOR JSON PATH)) AS recentNotes,
        JSON_QUERY((SELECT TOP 5 r.Id AS id, r.QuizId AS quizId, r.Score AS score, r.Total AS total,
                           r.CreatedAt AS createdAt, n.Title AS noteTitle, c.Name AS courseName
                    FROM dbo.QuizResults r JOIN dbo.Quizzes q ON q.Id = r.QuizId
                    JOIN dbo.Notes n ON n.Id = q.NoteId JOIN dbo.Courses c ON c.Id = q.CourseId
                    WHERE r.UserId = @u ORDER BY r.CreatedAt DESC FOR JSON PATH)) AS recentResults
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

ELSE IF @a = N'stats'
    -- Ders bazlı başarı istatistikleri: vw_CourseStats / vw_TopicPerformance (GROUP BY view'ları)
    SET @r = (SELECT
        JSON_QUERY((SELECT CourseId AS courseId, CourseName AS courseName, NoteCount AS noteCount, QuizAttempts AS quizAttempts,
                           TotalCorrect AS totalCorrect, TotalQuestions AS totalQuestions, SuccessRate AS successRate, LastQuizAt AS lastQuizAt
                    FROM dbo.vw_CourseStats WHERE UserId = @u ORDER BY CourseName FOR JSON PATH, INCLUDE_NULL_VALUES)) AS courses,
        JSON_QUERY((SELECT TOP 10 t.Topic AS topic, c.Name AS courseName, t.Answered AS answered, t.Correct AS correct,
                           t.Wrong AS wrong, t.SuccessRate AS successRate
                    FROM dbo.vw_TopicPerformance t JOIN dbo.Courses c ON c.Id = t.CourseId
                    WHERE t.UserId = @u ORDER BY t.SuccessRate ASC, t.Wrong DESC FOR JSON PATH)) AS weakTopics
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES);

SELECT @s AS status, @r AS data;
`, [720, 300], 'IF/ELSE ile action yönlendirme'));
  w.add(code('Yanıtı biçimle', function () {
    const action = $('Girdiyi doğrula').first().json.action;
    const r = $input.first().json;
    const status = Number(r.status) || 200;
    if (status === 404) return [{ json: { status, body: { error: 'Kayıt bulunamadı.' } } }];
    const isList = ['courses.list', 'notes.list', 'chat.history', 'cards.due'].includes(action);
    let data = r.data ? JSON.parse(r.data) : isList ? [] : null;

    if (action === 'chat.history' && data) {
      data.forEach((m) => { m.sources = m.sources || []; });
    }
    if (action === 'results.get' && data) {
      data.results = (data.results || []).map(({ a, b, c, d, ...q }) => ({ ...q, options: [a, b, c, d] }));
    }
    if (action === 'dashboard' && data) {
      data.recentNotes = data.recentNotes || [];
      data.recentResults = data.recentResults || [];
    }
    if (action === 'stats' && data) {
      data.courses = data.courses || [];
      data.weakTopics = data.weakTopics || [];
    }
    return [{ json: { status, body: { data } } }];
  }, [960, 220]));
  w.add(code('Hata: veritabanı', dbError, [960, 420]));
  w.add(respond('Yanıtla', [1200, 300]));

  w.chain('Webhook: data', 'Girdiyi doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: action çalıştır', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: action çalıştır', 'Yanıtı biçimle', 0).link('SQL: action çalıştır', 'Hata: veritabanı', 1);
  w.link('Yanıtı biçimle', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla');
  return w;
}

// ============================================================ /study-plan
export function studyPlanWorkflow() {
  const w = new Workflow('akStudyPlan00001', '08 - Haftalık Çalışma Programı (POST /webhook/study-plan)');
  w.add(webhook('Webhook: study-plan', 'study-plan', [0, 300]));
  w.add(code('Girdiyi doğrula', function () {
    const req = $input.first().json;
    const auth = requireUser(req);
    if (auth.error) return auth.error;
    const body = req.body || {};
    const hoursPerDay = body.hoursPerDay === undefined ? 2 : Number(body.hoursPerDay);
    if (!(hoursPerDay >= 0.5 && hoursPerDay <= 8)) return fail(400, 'Günlük çalışma süresi 0,5-8 saat arasında olmalı.');
    return [{ json: { ok: true, userId: auth.userId, hoursPerDay, payload: toPayload({ userId: auth.userId }) } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(sql('SQL: performans verisi', `
SET NOCOUNT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @u INT = JSON_VALUE(@j, '$.userId');
SELECT
    (SELECT s.CourseName AS course, s.NoteCount AS notes, s.SuccessRate AS successRate,
            JSON_QUERY((SELECT TOP 5 n.Title AS title FROM dbo.Notes n WHERE n.CourseId = s.CourseId ORDER BY n.CreatedAt DESC FOR JSON PATH)) AS recentNotes
     FROM dbo.vw_CourseStats s WHERE s.UserId = @u FOR JSON PATH, INCLUDE_NULL_VALUES) AS courses,
    (SELECT TOP 8 t.Topic AS topic, c.Name AS course, t.SuccessRate AS successRate
     FROM dbo.vw_TopicPerformance t JOIN dbo.Courses c ON c.Id = t.CourseId
     WHERE t.UserId = @u AND t.Wrong > 0 ORDER BY t.SuccessRate ASC FOR JSON PATH) AS weakTopics;
`, [720, 300]));
  w.add(code('Prompt hazırla', function () {
    const v = $('Girdiyi doğrula').first().json;
    const r = $input.first().json;
    const courses = JSON.parse(r.courses || '[]').filter((c) => c.notes > 0);
    const weak = JSON.parse(r.weakTopics || '[]');
    if (!courses.length) return fail(422, 'Program oluşturmak için önce en az bir ders notu ekleyin.');

    const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const days = [...Array(7)].map((_, i) => {
      const d = new Date(Date.now() + i * 86400000);
      return { day: DAYS[d.getDay()], date: d.toISOString().slice(0, 10) };
    });
    const courseLines = courses.map((c) =>
      `- ${c.course}: başarı ${c.successRate === null ? 'henüz test yok' : `%${c.successRate}`}; notlar: ${(c.recentNotes || []).map((n) => n.title).join(', ')}`).join('\n');
    const weakLines = weak.length ? weak.map((t) => `- ${t.topic} (${t.course}): %${t.successRate}`).join('\n') : '- (henüz yanlış yapılan konu yok)';

    // PROMPT (haftalık program): zayıf konulara ağırlık veren 7 günlük plan (JSON)
    const system = 'Sen üniversite öğrencileri için gerçekçi haftalık çalışma programları hazırlayan bir eğitim koçusun. Türkçe yazarsın ve yalnızca geçerli JSON üretirsin.';
    const user = [
      'Öğrencinin dersleri:', courseLines, '',
      'Zayıf olduğu konular (test sonuçlarına göre):', weakLines, '',
      `Günlük çalışma süresi: yaklaşık ${v.hoursPerDay} saat (${Math.round(v.hoursPerDay * 60)} dakika).`,
      `Program günleri: ${days.map((d) => `${d.day} (${d.date})`).join(', ')}.`, '',
      'Kurallar:',
      '- Tam 7 gün olsun, sırası yukarıdaki gibi.',
      '- Zayıf konulara daha fazla zaman ayır; her gün 2-4 görev olsun ve dakikaların toplamı günlük süreyi aşmasın.',
      '- Görevler somut olsun ve öğrencinin kendi not başlıklarını/konularını kullansın (ör. "<not başlığı> notunu tekrar oku ve 5 soruluk test çöz").',
      '- Son gün genel tekrar ve deneme testi olsun.',
      '',
      'JSON biçimi:',
      '{"overview":"2 cümlelik genel strateji","days":[{"focus":"günün odağı","tasks":[{"title":"...","course":"...","minutes":30}]}],"tips":["...","..."]}',
    ].join('\n');
    const format = {
      type: 'object',
      properties: {
        overview: { type: 'string' },
        days: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', properties: {
          focus: { type: 'string' },
          tasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, course: { type: 'string' }, minutes: { type: 'integer' } }, required: ['title', 'course', 'minutes'] } },
        }, required: ['focus', 'tasks'] } },
        tips: { type: 'array', items: { type: 'string' } },
      },
      required: ['overview', 'days', 'tips'],
    };
    return [{ json: { ok: true, days, ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.5, format }) } }];
  }, [960, 300], { libs: AI }));
  w.add(ifTrue('Veri yeterli mi?', '$json.ok', [1200, 300]));
  w.add(ollama('Ollama: program üret', [1440, 220]));
  w.add(code('Programı doğrula', function () {
    const { days } = $('Prompt hazırla').first().json;
    const plan = parseModelJson(($input.first().json.message || {}).content);
    if (!plan || !Array.isArray(plan.days) || plan.days.length < 7) {
      return [{ json: { status: 502, body: { error: 'Model geçerli bir program üretemedi, lütfen tekrar deneyin.' } } }];
    }
    // Gün adı ve tarihleri modele bırakılmaz, kod belirler
    const outDays = days.map((d, i) => {
      const src = plan.days[i] || {};
      const tasks = (Array.isArray(src.tasks) ? src.tasks : []).slice(0, 6).map((t) => ({
        title: String(t.title || '').trim(), course: String(t.course || '').trim(), minutes: Math.max(5, Math.min(240, Math.round(Number(t.minutes) || 30))),
      })).filter((t) => t.title);
      return { ...d, focus: String(src.focus || '').trim(), tasks, totalMinutes: tasks.reduce((s, t) => s + t.minutes, 0) };
    });
    return [{ json: { status: 200, body: { overview: String(plan.overview || ''), days: outDays, tips: (plan.tips || []).map(String).slice(0, 5) } } }];
  }, [1680, 220], { libs: AI }));
  w.add(code('Hata: veritabanı', dbError, [960, 520]));
  w.add(code('Hata: Ollama', llmError, [1680, 420]));
  w.add(respond('Yanıtla', [1920, 300]));

  w.chain('Webhook: study-plan', 'Girdiyi doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: performans verisi', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: performans verisi', 'Prompt hazırla', 0).link('SQL: performans verisi', 'Hata: veritabanı', 1);
  w.link('Prompt hazırla', 'Veri yeterli mi?');
  w.link('Veri yeterli mi?', 'Ollama: program üret', 0).link('Veri yeterli mi?', 'Yanıtla', 1);
  w.link('Ollama: program üret', 'Programı doğrula', 0).link('Ollama: program üret', 'Hata: Ollama', 1);
  w.link('Programı doğrula', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla').link('Hata: Ollama', 'Yanıtla');
  return w;
}

// =========================================================== /extract-pdf
export function extractPdfWorkflow() {
  const w = new Workflow('akExtractPdf0001', '09 - PDF Metin Çıkarma (POST /webhook/extract-pdf)');
  w.add(webhook('Webhook: extract-pdf', 'extract-pdf', [0, 300]));
  w.add(code('Dosyayı doğrula', function () {
    const item = $input.first();
    const auth = requireUser(item.json);
    if (auth.error) return auth.error;
    const files = item.binary || {};
    const file = files.file || Object.values(files)[0];
    if (!file) return fail(400, 'multipart/form-data ile "file" alanında bir PDF gönderin.');
    const isPdf = /pdf/i.test(file.mimeType || '') || /\.pdf$/i.test(file.fileName || '');
    if (!isPdf) return fail(415, 'Yalnızca PDF dosyası yüklenebilir.');
    return [{ json: { ok: true, fileName: file.fileName }, binary: { data: file } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(extractPdf('PDF metnini çıkar', [720, 220]));
  w.add(code('Metni temizle', function () {
    const fileName = $('Dosyayı doğrula').first().json.fileName;
    const r = $input.first().json;
    const text = cleanText(r.text).slice(0, 100000);
    if (text.length < 20) return [{ json: { status: 422, body: { error: 'PDF içinden metin çıkarılamadı (taranmış görüntü olabilir).' } } }];
    return [{ json: { status: 200, body: { fileName, pages: r.numpages || null, characters: text.length, text } } }];
  }, [960, 220], { libs: AUTH }));
  w.add(code('PDF okunamadı', function () {
    return [{ json: { status: 422, body: { error: 'PDF dosyası okunamadı. Dosya bozuk veya şifreli olabilir.' } } }];
  }, [960, 420]));
  w.add(respond('Yanıtla', [1200, 300]));

  w.chain('Webhook: extract-pdf', 'Dosyayı doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'PDF metnini çıkar', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('PDF metnini çıkar', 'Metni temizle', 0).link('PDF metnini çıkar', 'PDF okunamadı', 1);
  w.link('Metni temizle', 'Yanıtla').link('PDF okunamadı', 'Yanıtla');
  return w;
}

// ========================================================== Error Trigger
export function errorWorkflow() {
  const w = new Workflow('akErrorHandler01', '00 - Hata Yakalayıcı (Error Trigger)');
  w.add(errorTrigger('Error Trigger', [0, 300]));
  w.add(code('Hatayı kaydet', function () {
    // Beklenmeyen (yakalanmamış) hatalar buraya düşer; container loglarında görünür.
    const e = $input.first().json;
    const info = {
      workflow: e.workflow && e.workflow.name,
      node: e.execution && e.execution.lastNodeExecuted,
      message: e.execution && e.execution.error && e.execution.error.message,
      executionId: e.execution && e.execution.id,
      at: new Date().toISOString(),
    };
    console.error('[akademi-kocum] beklenmeyen hata', JSON.stringify(info));
    return [{ json: info }];
  }, [240, 300]));
  w.chain('Error Trigger', 'Hatayı kaydet');
  return w;
}
