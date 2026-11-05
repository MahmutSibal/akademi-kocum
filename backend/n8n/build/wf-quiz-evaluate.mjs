/* eslint-disable no-undef */
import { Workflow, webhook, code, ifTrue, sql, ollama, respond } from './lib.mjs';
import { authLib, ollamaLib, dbError, llmError } from './common.mjs';

const AUTH = [authLib];
const AI = [authLib, ollamaLib];

// ========================================================= /generate-quiz
export function generateQuizWorkflow() {
  const w = new Workflow('akGenerateQuiz01', '05 - Test Oluşturma (POST /webhook/generate-quiz)');
  w.add(webhook('Webhook: generate-quiz', 'generate-quiz', [0, 300]));
  w.add(code('Girdiyi doğrula', function () {
    const req = $input.first().json;
    const auth = requireUser(req);
    if (auth.error) return auth.error;
    const body = req.body || {};
    const noteId = toId(body.noteId);
    const questionCount = body.questionCount === undefined ? 5 : Number(body.questionCount);
    if (!noteId) return fail(400, 'noteId geçersiz.');
    if (!Number.isInteger(questionCount) || questionCount < 5 || questionCount > 10) return fail(400, 'Soru sayısı 5 ile 10 arasında olmalı.');
    // İsteğe bağlı: yalnızca bir konuya odaklanan test (ör. yanlış yapılan konu)
    const focusTopic = cleanText(body.focusTopic).replace(/\n/g, ' ').slice(0, 100) || null;
    // Zorluk: otomatik (geçmiş başarıya göre) veya elle kolay/orta/zor
    const difficulty = String(body.difficulty || 'otomatik').toLocaleLowerCase('tr');
    if (!['otomatik', 'kolay', 'orta', 'zor'].includes(difficulty)) return fail(400, 'difficulty: otomatik, kolay, orta veya zor olmalı.');
    return [{ json: { ok: true, userId: auth.userId, noteId, questionCount, focusTopic, difficulty, payload: toPayload({ userId: auth.userId, noteId }) } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(sql('SQL: notu getir', `
SET NOCOUNT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @u INT = JSON_VALUE(@j, '$.userId'), @nid INT = JSON_VALUE(@j, '$.noteId');
SELECT n.Id AS noteId, n.CourseId AS courseId, n.Title AS title, n.Content AS content, c.Name AS courseName,
       -- Uyarlanabilir zorluk için: bu dersteki son 3 testin başarı yüzdesi
       p.recentRate, ISNULL(p.recentCount, 0) AS recentCount
FROM (SELECT 1 AS x) d
LEFT JOIN dbo.Notes n ON n.Id = @nid AND n.UserId = @u
LEFT JOIN dbo.Courses c ON c.Id = n.CourseId
OUTER APPLY (
    SELECT CAST(100.0 * SUM(t.Score) / NULLIF(SUM(t.Total), 0) AS DECIMAL(5,1)) AS recentRate, COUNT(*) AS recentCount
    FROM (SELECT TOP 3 r.Score, r.Total
          FROM dbo.QuizResults r JOIN dbo.Quizzes q ON q.Id = r.QuizId
          WHERE r.UserId = @u AND q.CourseId = n.CourseId
          ORDER BY r.CreatedAt DESC) t
) p;
`, [720, 300], 'Not + son 3 testin başarısı'));
  w.add(ifTrue('Not var mı?', '!!$json.noteId', [960, 300]));
  w.add(code('Not bulunamadı', function () {
    return [{ json: { status: 404, body: { error: 'Not bulunamadı.' } } }];
  }, [1200, 520]));
  w.add(code('Prompt hazırla', function () {
    const v = $('Girdiyi doğrula').first().json;
    const note = $input.first().json;
    const n = v.questionCount;

    // Uyarlanabilir zorluk: son 3 testte %80+ -> zor, %50 altı -> kolay, aksi halde orta
    let difficulty = v.difficulty;
    let difficultyReason = 'Zorluğu sen seçtin.';
    if (difficulty === 'otomatik') {
      const rate = note.recentRate === null || note.recentRate === undefined ? null : Number(note.recentRate);
      if (rate === null) {
        difficulty = 'orta';
        difficultyReason = 'Bu derste henüz test çözmediğin için orta seviyeyle başlandı.';
      } else {
        difficulty = rate >= 80 ? 'zor' : rate < 50 ? 'kolay' : 'orta';
        difficultyReason = `Bu dersteki son ${note.recentCount} testte başarın %${Math.round(rate)} olduğu için seçildi.`;
      }
    }
    const LEVEL = {
      kolay: 'KOLAY: Nottaki tanımları ve temel bilgileri doğrudan soran sorular. Çeldiriciler açıkça yanlış olsun.',
      orta: 'ORTA: Kavramların anlaşılıp anlaşılmadığını ölçen sorular. Çeldiriciler makul ama ayırt edilebilir olsun.',
      zor: 'ZOR: Kavramları karşılaştırma, uygulama ve çıkarım yapma gerektiren, birkaç bilgiyi birleştiren sorular. Çeldiriciler birbirine yakın ve dikkat gerektiren türden olsun.',
    };

    // Ollama structured output: çıktı bu JSON şemasına zorlanır
    const schema = {
      type: 'object',
      properties: {
        questions: {
          type: 'array', minItems: n, maxItems: n,
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
              correct_answer: { type: 'string' },
              explanation: { type: 'string' },
              topic: { type: 'string' },
            },
            required: ['question', 'options', 'correct_answer', 'explanation', 'topic'],
          },
        },
      },
      required: ['questions'],
    };

    // PROMPT (test üretimi): yalnızca JSON, nota dayalı, tam 4 seçenek, cevap seçeneklerden biri
    const system = 'Sen üniversite dersleri için çoktan seçmeli sınav soruları hazırlayan bir eğitim uzmanısın. Yalnızca geçerli JSON üretirsin; JSON dışında hiçbir metin yazmazsın. Tüm içerik Türkçe olmalı ve yalnızca Latin alfabesi kullanılmalıdır.';
    const user = [
      `Aşağıdaki ders notundan TAM OLARAK ${n} adet çoktan seçmeli soru hazırla.`,
      '',
      `Zorluk seviyesi — ${LEVEL[difficulty]}`,
      '',
      'Kurallar:',
      '- Her soru yalnızca nottaki bilgilere dayanmalı.',
      '- Her sorunun TAM 4 seçeneği olmalı; seçenekler birbirinden farklı, kısa ve akla yatkın olmalı.',
      '- "correct_answer", seçeneklerden birinin metniyle BİREBİR aynı olmalı.',
      '- "explanation": doğru cevabın neden doğru olduğunu 1-2 cümleyle açıkla.',
      '- "topic": sorunun ölçtüğü konuyu 2-4 kelimeyle yaz (ör. "Flutter temelleri").',
      v.focusTopic
        ? `- Soruların HEPSİ "${v.focusTopic}" konusunu ölçsün; notun bu konuyla ilgili bölümlerine odaklan, farklı açılardan sor ve "topic" alanına bu konuyu yaz.`
        : '- Sorular notun farklı bölümlerini kapsasın; aynı soruyu tekrar etme.',
      '',
      'Çıktı biçimi:',
      '{"questions":[{"question":"...","options":["...","...","...","..."],"correct_answer":"...","explanation":"...","topic":"..."}]}',
      '',
      `DERS NOTU ("${note.title}"):`,
      '"""',
      truncate(note.content),
      '"""',
    ].join('\n');

    return [{ json: {
      noteId: note.noteId, courseId: note.courseId, title: note.title, questionCount: n, difficulty, difficultyReason,
      ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.5, format: schema }),
    } }];
  }, [1200, 220], { libs: AI }));
  w.add(ollama('Ollama: test üret', [1440, 220], 'format: JSON şeması'));
  w.add(code('Şemayı doğrula', function () {
    const base = $('Prompt hazırla').first().json;
    const n = base.questionCount;
    const attempt = $runIndex + 1; // bu düğüm her denemede bir kez çalışır
    const maxRetries = Number($env.QUIZ_MAX_RETRIES ?? 2);
    const raw = String(($input.first().json.message || {}).content || '');
    const errors = [];
    const data = parseModelJson(raw);
    const str = (x) => (typeof x === 'string' ? x.trim() : '');

    if (!data || !Array.isArray(data.questions)) errors.push('"questions" dizisi yok veya JSON geçersiz');
    const list = data && Array.isArray(data.questions) ? data.questions : [];
    if (list.length < n) errors.push(`${n} soru istendi, ${list.length} geldi`);

    const questions = [];
    list.slice(0, n).forEach((q, i) => {
      const where = `Soru ${i + 1}`;
      const question = str(q && q.question);
      const options = Array.isArray(q && q.options) ? q.options.map(str) : [];
      const explanation = str(q && q.explanation);
      const topic = str(q && q.topic);
      let correct = str(q && q.correct_answer);

      if (!question) errors.push(`${where}: soru metni boş`);
      if (options.length !== 4 || options.some((o) => !o)) { errors.push(`${where}: tam 4 dolu seçenek olmalı`); return; }
      if (new Set(options.map((o) => o.toLocaleLowerCase('tr'))).size !== 4) errors.push(`${where}: seçenekler birbirinden farklı olmalı`);
      if (!explanation) errors.push(`${where}: açıklama boş`);
      if (!topic) errors.push(`${where}: konu boş`);

      // correct_answer seçeneklerden biri olmalı. "B" veya "B) metin" gibi biçimler tolere edilir.
      let idx = options.indexOf(correct);
      if (idx < 0) idx = options.findIndex((o) => o.toLocaleLowerCase('tr') === correct.toLocaleLowerCase('tr'));
      if (idx < 0) {
        const m = /^([A-Da-d])(?:[).:\-\s]|$)/.exec(correct);
        if (m) idx = 'ABCD'.indexOf(m[1].toUpperCase());
      }
      if (idx < 0) { errors.push(`${where}: correct_answer seçeneklerden biri değil`); return; }
      correct = options[idx];

      // Model doğru cevabı sık sık A'ya koyar: seçenekleri karıştır
      const shuffled = [...options];
      for (let k = shuffled.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [shuffled[k], shuffled[r]] = [shuffled[r], shuffled[k]];
      }
      questions.push({
        questionIndex: i,
        question: question.slice(0, 2000),
        options: shuffled.map((o) => o.slice(0, 500)),
        correctAnswer: 'ABCD'[shuffled.indexOf(correct)],
        explanation: explanation.slice(0, 2000),
        topic: topic.slice(0, 200),
      });
    });

    if (!errors.length) return [{ json: { valid: true, attempt, questions } }];
    console.log(`[generate-quiz] deneme ${attempt} geçersiz: ${errors.join('; ')}`);
    return [{ json: {
      valid: false, retry: attempt <= maxRetries, attempt, errors, lastRaw: raw.slice(0, 4000),
      status: 502, body: { error: `Model ${attempt} denemede geçerli bir test üretemedi. Lütfen tekrar deneyin.`, details: errors.slice(0, 5) },
    } }];
  }, [1680, 220], { libs: AI, notes: 'Şema doğrulama (max 2 yeniden deneme)' }));
  w.add(ifTrue('Geçerli JSON mu?', '$json.valid', [1920, 220]));
  w.add(ifTrue('Deneme hakkı var mı?', '$json.retry', [2160, 400]));
  w.add(code('Yeniden dene', function () {
    const base = $('Prompt hazırla').first().json;
    const v = $input.first().json;
    const body = JSON.parse(JSON.stringify(base.ollama.body));
    body.messages.push(
      { role: 'assistant', content: v.lastRaw || '(boş)' },
      { role: 'user', content: `Önceki çıktın şu nedenlerle geçersizdi: ${v.errors.slice(0, 6).join('; ')}. Kuralları uygulayarak TAM OLARAK ${base.questionCount} soru içeren, yalnızca geçerli JSON üret.` },
    );
    body.options.temperature = 0.2;
    return [{ json: { ollama: { ...base.ollama, body } } }];
  }, [2400, 400]));
  w.add(code('Kayıt verisi', function () {
    const base = $('Prompt hazırla').first().json;
    const v = $('Girdiyi doğrula').first().json;
    const questions = $input.first().json.questions.map((q) => ({
      questionIndex: q.questionIndex, question: q.question,
      optionA: q.options[0], optionB: q.options[1], optionC: q.options[2], optionD: q.options[3],
      correctAnswer: q.correctAnswer, explanation: q.explanation, topic: q.topic,
    }));
    return [{ json: { payload: toPayload({
      userId: v.userId, courseId: base.courseId, noteId: base.noteId,
      difficulty: base.difficulty, focusTopic: v.focusTopic, questions,
    }) } }];
  }, [2160, 140], { libs: AUTH }));
  w.add(sql('SQL: test + soruları kaydet', `
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
DECLARE @u INT = JSON_VALUE(@j, '$.userId'), @c INT = JSON_VALUE(@j, '$.courseId'), @n INT = JSON_VALUE(@j, '$.noteId');

BEGIN TRAN;
DECLARE @t TABLE (Id INT);
INSERT dbo.Quizzes (UserId, CourseId, NoteId, Difficulty, FocusTopic) OUTPUT inserted.Id INTO @t
VALUES (@u, @c, @n, JSON_VALUE(@j, '$.difficulty'), JSON_VALUE(@j, '$.focusTopic'));
DECLARE @qid INT = (SELECT Id FROM @t);

INSERT dbo.QuizQuestions (QuizId, QuestionIndex, QuestionText, OptionA, OptionB, OptionC, OptionD, CorrectAnswer, Explanation, Topic)
SELECT @qid, questionIndex, question, optionA, optionB, optionC, optionD, correctAnswer, explanation, topic
FROM OPENJSON(@j, '$.questions') WITH (
    questionIndex INT, question NVARCHAR(MAX),
    optionA NVARCHAR(500), optionB NVARCHAR(500), optionC NVARCHAR(500), optionD NVARCHAR(500),
    correctAnswer CHAR(1), explanation NVARCHAR(MAX), topic NVARCHAR(200));
COMMIT;
SELECT @qid AS quizId;
`, [2400, 140], 'Quizzes + QuizQuestions tek transaction'));
  w.add(code('Cevapları gizle', function () {
    const base = $('Prompt hazırla').first().json;
    const qs = $('Şemayı doğrula').last().json.questions;
    // İstemciye correct_answer ve explanation GÖNDERİLMEZ
    const questions = qs.map((q) => ({ questionIndex: q.questionIndex, question: q.question, options: q.options, topic: q.topic }));
    const focusTopic = $('Girdiyi doğrula').first().json.focusTopic;
    return [{ json: { status: 201, body: {
      quizId: $input.first().json.quizId, noteId: base.noteId, courseId: base.courseId, title: base.title,
      focusTopic, difficulty: base.difficulty, difficultyReason: base.difficultyReason, questions,
    } } }];
  }, [2640, 140]));
  w.add(code('Hata: veritabanı', dbError, [2640, 600]));
  w.add(code('Hata: Ollama', llmError, [1680, 520]));
  w.add(respond('Yanıtla', [2880, 300]));

  w.chain('Webhook: generate-quiz', 'Girdiyi doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: notu getir', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: notu getir', 'Not var mı?', 0).link('SQL: notu getir', 'Hata: veritabanı', 1);
  w.link('Not var mı?', 'Prompt hazırla', 0).link('Not var mı?', 'Not bulunamadı', 1);
  w.link('Prompt hazırla', 'Ollama: test üret');
  w.link('Ollama: test üret', 'Şemayı doğrula', 0).link('Ollama: test üret', 'Hata: Ollama', 1);
  w.link('Şemayı doğrula', 'Geçerli JSON mu?');
  w.link('Geçerli JSON mu?', 'Kayıt verisi', 0).link('Geçerli JSON mu?', 'Deneme hakkı var mı?', 1);
  w.link('Deneme hakkı var mı?', 'Yeniden dene', 0).link('Deneme hakkı var mı?', 'Yanıtla', 1);
  w.link('Yeniden dene', 'Ollama: test üret');
  w.link('Kayıt verisi', 'SQL: test + soruları kaydet');
  w.link('SQL: test + soruları kaydet', 'Cevapları gizle', 0).link('SQL: test + soruları kaydet', 'Hata: veritabanı', 1);
  w.link('Cevapları gizle', 'Yanıtla').link('Not bulunamadı', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla').link('Hata: Ollama', 'Yanıtla');
  return w;
}

// ============================================================== /evaluate
export function evaluateWorkflow() {
  const w = new Workflow('akEvaluateQuiz01', '06 - Performans Değerlendirme (POST /webhook/evaluate)');
  w.add(webhook('Webhook: evaluate', 'evaluate', [0, 300]));
  w.add(code('Girdiyi doğrula', function () {
    const req = $input.first().json;
    const auth = requireUser(req);
    if (auth.error) return auth.error;
    const body = req.body || {};
    const quizId = toId(body.quizId);
    if (!quizId) return fail(400, 'quizId geçersiz.');
    if (!Array.isArray(body.answers) || body.answers.length === 0 || body.answers.length > 50) return fail(400, 'answers bir dizi olmalı (1-50 eleman).');

    const answers = [];
    for (const a of body.answers) {
      const questionIndex = Number(a && a.questionIndex);
      if (!Number.isInteger(questionIndex) || questionIndex < 0) return fail(400, 'Her cevapta geçerli bir questionIndex olmalı.');
      let selected = a.selected;
      if (typeof selected === 'number' && selected >= 0 && selected <= 3) selected = 'ABCD'[selected];
      selected = selected === null || selected === undefined || selected === '' ? null : String(selected).trim().toUpperCase();
      if (selected !== null && !/^[ABCD]$/.test(selected)) return fail(400, 'selected alanı A, B, C, D veya null olmalı.');
      answers.push({ questionIndex, selected });
    }
    return [{ json: { ok: true, userId: auth.userId, quizId, answers, payload: toPayload({ userId: auth.userId, quizId }) } }];
  }, [240, 300], { libs: AUTH }));
  w.add(ifTrue('Geçerli mi?', '$json.ok', [480, 300]));
  w.add(sql('SQL: doğru cevapları getir', `
SET NOCOUNT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);
SELECT q.Id AS quizId, q.NoteId AS noteId, c.Name AS courseName, n.Title AS noteTitle,
    (SELECT qq.Id AS id, qq.QuestionIndex AS questionIndex, qq.QuestionText AS question,
            qq.OptionA AS a, qq.OptionB AS b, qq.OptionC AS c, qq.OptionD AS d,
            qq.CorrectAnswer AS correct, qq.Explanation AS explanation, qq.Topic AS topic
       FROM dbo.QuizQuestions qq WHERE qq.QuizId = q.Id ORDER BY qq.QuestionIndex FOR JSON PATH) AS questions
FROM (SELECT 1 AS x) d
LEFT JOIN dbo.Quizzes q ON q.Id = JSON_VALUE(@j, '$.quizId') AND q.UserId = JSON_VALUE(@j, '$.userId')
LEFT JOIN dbo.Courses c ON c.Id = q.CourseId
LEFT JOIN dbo.Notes n ON n.Id = q.NoteId;
`, [720, 300]));
  w.add(ifTrue('Test var mı?', '!!$json.quizId', [960, 300]));
  w.add(code('Test bulunamadı', function () {
    return [{ json: { status: 404, body: { error: 'Test bulunamadı.' } } }];
  }, [1200, 560]));
  w.add(code('Puanla (kod)', function () {
    // Puanlama LLM'e değil koda yaptırılır
    const v = $('Girdiyi doğrula').first().json;
    const quiz = $input.first().json;
    const qs = JSON.parse(quiz.questions || '[]');
    const selectedBy = new Map(v.answers.map((a) => [a.questionIndex, a.selected]));

    const results = qs.map((q) => {
      const selected = selectedBy.has(q.questionIndex) ? selectedBy.get(q.questionIndex) : null;
      return {
        questionId: q.id, questionIndex: q.questionIndex, question: q.question,
        options: [q.a, q.b, q.c, q.d], selected, correctAnswer: q.correct,
        isCorrect: selected === q.correct, explanation: q.explanation, topic: q.topic,
      };
    });
    const score = results.filter((r) => r.isCorrect).length;
    const total = results.length;
    const wrong = results.filter((r) => !r.isCorrect);

    // PROMPT (öneri): yanlış konulara göre kişiselleştirilmiş, somut çalışma önerisi (JSON)
    const optionText = (r, letter) => (letter ? `${letter}) ${r.options['ABCD'.indexOf(letter)]}` : 'boş bırakıldı');
    const wrongList = wrong.map((r, i) =>
      `${i + 1}) Konu: ${r.topic}\n   Soru: ${r.question}\n   Öğrencinin cevabı: ${optionText(r, r.selected)}\n   Doğru cevap: ${optionText(r, r.correctAnswer)}\n   Açıklama: ${r.explanation}`).join('\n');
    const system = 'Sen öğrencilere kişiselleştirilmiş çalışma önerisi veren deneyimli ve destekleyici bir eğitim koçusun. Her zaman Türkçe ve yalnızca Latin alfabesiyle yazarsın. Yalnızca geçerli JSON üretirsin.';
    const user = [
      `Öğrenci "${quiz.courseName}" dersinin "${quiz.noteTitle}" notundan oluşturulan testte ${total} sorudan ${score} tanesini doğru yanıtladı (başarı yüzdesi: ${Math.round((100 * score) / Math.max(total, 1))}).`,
      '',
      'Yanlış yaptığı veya boş bıraktığı sorular:',
      wrongList,
      '',
      'Bu sonuçlara göre öğrenciye kişiselleştirilmiş bir çalışma önerisi hazırla.',
      'Kurallar:',
      '- "focusTopics" yalnızca yanlış yapılan konulardan oluşsun; her biri için neden çalışması gerektiğini ve somut bir çalışma adımı yaz.',
      '- "studyPlan" 3-5 adımlık, uygulanabilir bir plan olsun.',
      '- Öğrenciye "sen" diye hitap et, cesaretlendirici ama net ol.',
      '',
      'JSON biçimi:',
      '{"summary":"1-2 cümlelik değerlendirme","focusTopics":[{"topic":"...","reason":"...","action":"..."}],"studyPlan":["...","..."],"motivation":"kısa motive edici cümle"}',
    ].join('\n');
    const format = {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        focusTopics: { type: 'array', items: { type: 'object', properties: { topic: { type: 'string' }, reason: { type: 'string' }, action: { type: 'string' } }, required: ['topic', 'reason', 'action'] } },
        studyPlan: { type: 'array', items: { type: 'string' } },
        motivation: { type: 'string' },
      },
      required: ['summary', 'focusTopics', 'studyPlan', 'motivation'],
    };
    return [{ json: {
      quizId: v.quizId, noteId: quiz.noteId, noteTitle: quiz.noteTitle, courseName: quiz.courseName,
      score, total, results, hasWrong: wrong.length > 0,
      wrongTopics: [...new Set(wrong.map((r) => r.topic))],
      ollama: chatRequest([{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.5, format }),
    } }];
  }, [1200, 300], { libs: AI }));
  w.add(ifTrue('Yanlış var mı?', '$json.hasWrong', [1440, 300]));
  w.add(ollama('Ollama: öneri üret', [1680, 220], 'Yanlış konular -> öneri'));
  w.add(code('Öneriyi biçimle', function () {
    const s = $('Puanla (kod)').first().json;
    const res = $input.first().json;
    let detail = parseModelJson((res.message || {}).content);
    const ok = detail && typeof detail.summary === 'string' && Array.isArray(detail.focusTopics);
    if (!ok) {
      // Ollama hata verirse veya JSON bozuksa öneri yine üretilir (kural tabanlı yedek)
      detail = {
        summary: `${s.total} sorudan ${s.score} doğru yaptın. Aşağıdaki konuları tekrar etmen faydalı olacak.`,
        focusTopics: s.wrongTopics.map((t) => ({ topic: t, reason: 'Bu konudaki soruyu yanlış yaptın.', action: 'Ders notundaki ilgili bölümü tekrar oku ve özet çıkar.' })),
        studyPlan: ['Yanlış yaptığın soruların açıklamalarını oku.', 'İlgili konuları notundan tekrar et.', 'Aynı nottan yeni bir test oluşturup tekrar dene.'],
        motivation: 'Her yanlış, öğrenmek için bir fırsat!',
        fallback: true,
      };
    }
    const lines = [detail.summary, '', 'Odaklanman gereken konular:'];
    for (const f of detail.focusTopics) lines.push(`• ${f.topic}: ${f.reason} → ${f.action}`);
    lines.push('', 'Çalışma planı:');
    (detail.studyPlan || []).forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    if (detail.motivation) lines.push('', detail.motivation);
    return [{ json: { recommendation: lines.join('\n'), recommendationDetail: detail } }];
  }, [1920, 220], { libs: AI }));
  w.add(code('Tam puan önerisi', function () {
    const s = $input.first().json;
    const detail = {
      summary: `Tebrikler! ${s.total} sorunun hepsini doğru yanıtladın.`,
      focusTopics: [],
      studyPlan: ['Bu notu birkaç gün sonra tekrar ederek kalıcılığı artır.', 'Daha fazla soruyla yeni bir test oluştur.', 'Bir sonraki konuya geç.'],
      motivation: 'Harika gidiyorsun, aynen devam!',
    };
    const recommendation = [detail.summary, '', 'Çalışma planı:', ...detail.studyPlan.map((p, i) => `${i + 1}. ${p}`), '', detail.motivation].join('\n');
    return [{ json: { recommendation, recommendationDetail: detail } }];
  }, [1920, 420]));
  w.add(code('Kayıt verisi', function () {
    const s = $('Puanla (kod)').first().json;
    const v = $('Girdiyi doğrula').first().json;
    const { recommendation, recommendationDetail } = $input.first().json;
    return [{ json: {
      recommendation, recommendationDetail,
      payload: toPayload({
        userId: v.userId, quizId: s.quizId, score: s.score, total: s.total, recommendation,
        answers: s.results.map((r) => ({ questionId: r.questionId, selected: r.selected, isCorrect: r.isCorrect })),
      }),
    } }];
  }, [2160, 300], { libs: AUTH }));
  w.add(sql('SQL: sonucu kaydet', `
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1);

BEGIN TRAN;
DECLARE @t TABLE (Id INT);
INSERT dbo.QuizResults (UserId, QuizId, Score, Total, Recommendation) OUTPUT inserted.Id INTO @t
SELECT userId, quizId, score, total, recommendation
FROM OPENJSON(@j) WITH (userId INT, quizId INT, score INT, total INT, recommendation NVARCHAR(MAX));
DECLARE @rid INT = (SELECT Id FROM @t);

INSERT dbo.QuizAnswers (ResultId, QuestionId, SelectedAnswer, IsCorrect)
SELECT @rid, questionId, selected, isCorrect
FROM OPENJSON(@j, '$.answers') WITH (questionId INT, selected CHAR(1), isCorrect BIT);
COMMIT;
SELECT @rid AS resultId;
`, [2400, 300], 'QuizResults + QuizAnswers tek transaction'));
  w.add(code('Yanıtı biçimle', function () {
    const s = $('Puanla (kod)').first().json;
    const k = $('Kayıt verisi').first().json;
    const results = s.results.map(({ questionId, ...r }) => r);
    return [{ json: { status: 200, body: {
      resultId: $input.first().json.resultId, quizId: s.quizId, noteId: s.noteId, noteTitle: s.noteTitle, courseName: s.courseName,
      score: s.score, total: s.total,
      percentage: Math.round((100 * s.score) / Math.max(s.total, 1)), results,
      recommendation: k.recommendation, recommendationDetail: k.recommendationDetail,
    } } }];
  }, [2640, 220]));
  w.add(code('Hata: veritabanı', dbError, [2640, 520]));
  w.add(respond('Yanıtla', [2880, 300]));

  w.chain('Webhook: evaluate', 'Girdiyi doğrula', 'Geçerli mi?');
  w.link('Geçerli mi?', 'SQL: doğru cevapları getir', 0).link('Geçerli mi?', 'Yanıtla', 1);
  w.link('SQL: doğru cevapları getir', 'Test var mı?', 0).link('SQL: doğru cevapları getir', 'Hata: veritabanı', 1);
  w.link('Test var mı?', 'Puanla (kod)', 0).link('Test var mı?', 'Test bulunamadı', 1);
  w.link('Puanla (kod)', 'Yanlış var mı?');
  w.link('Yanlış var mı?', 'Ollama: öneri üret', 0).link('Yanlış var mı?', 'Tam puan önerisi', 1);
  // Ollama hata verse bile (1. çıkış) değerlendirme yedek öneriyle tamamlanır
  w.link('Ollama: öneri üret', 'Öneriyi biçimle', 0).link('Ollama: öneri üret', 'Öneriyi biçimle', 1);
  w.link('Öneriyi biçimle', 'Kayıt verisi').link('Tam puan önerisi', 'Kayıt verisi');
  w.link('Kayıt verisi', 'SQL: sonucu kaydet');
  w.link('SQL: sonucu kaydet', 'Yanıtı biçimle', 0).link('SQL: sonucu kaydet', 'Hata: veritabanı', 1);
  w.link('Yanıtı biçimle', 'Yanıtla').link('Test bulunamadı', 'Yanıtla').link('Hata: veritabanı', 'Yanıtla');
  return w;
}
