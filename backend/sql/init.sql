/* =============================================================================
   Akademi Koçum — StudyAssistant şeması
   db-init konteyneri tarafından sqlcmd ile çalıştırılır:
     sqlcmd ... -i init.sql -v APP_DB_USER=... APP_DB_PASSWORD=...
   Script idempotenttir: tekrar çalıştırmak mevcut veriyi bozmaz.
   ============================================================================= */
SET NOCOUNT ON;
SET XACT_ABORT ON;
-- sqlcmd varsayılanı OFF'tur; fonksiyonlar oluşturuldukları ayarı saklar ve
-- XML metotları (fn_DecodePayload) QUOTED_IDENTIFIER ON ister.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF DB_ID(N'StudyAssistant') IS NULL
BEGIN
    PRINT N'StudyAssistant veritabanı oluşturuluyor...';
    CREATE DATABASE StudyAssistant COLLATE Latin1_General_100_CI_AS_SC;
END
GO

USE StudyAssistant;
GO

/* ------------------------------------------------------------------- Users */
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
CREATE TABLE dbo.Users (
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    Email         NVARCHAR(256)     NOT NULL CONSTRAINT UQ_Users_Email UNIQUE,
    PasswordHash  NVARCHAR(512)     NOT NULL,   -- scrypt$<salt>$<hash>, asla düz metin
    Name          NVARCHAR(100)     NOT NULL,
    CreatedAt     DATETIME2(3)      NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

/* ----------------------------------------------------------------- Courses */
IF OBJECT_ID(N'dbo.Courses', N'U') IS NULL
CREATE TABLE dbo.Courses (
    Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Courses PRIMARY KEY,
    UserId       INT               NOT NULL,
    Name         NVARCHAR(150)     NOT NULL,
    Description  NVARCHAR(1000)    NULL,
    CreatedAt    DATETIME2(3)      NOT NULL CONSTRAINT DF_Courses_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Courses_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE
);
GO

/* ------------------------------------------------------------------- Notes */
IF OBJECT_ID(N'dbo.Notes', N'U') IS NULL
CREATE TABLE dbo.Notes (
    Id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notes PRIMARY KEY,
    UserId     INT               NOT NULL,
    CourseId   INT               NOT NULL,
    Title      NVARCHAR(200)     NOT NULL,
    Content    NVARCHAR(MAX)     NOT NULL,
    Summary    NVARCHAR(MAX)     NULL,
    CreatedAt  DATETIME2(3)      NOT NULL CONSTRAINT DF_Notes_CreatedAt DEFAULT SYSUTCDATETIME(),
    -- SQL Server tek cascade yoluna izin verir: Users -> Courses -> Notes
    CONSTRAINT FK_Notes_Users   FOREIGN KEY (UserId)   REFERENCES dbo.Users(Id),
    CONSTRAINT FK_Notes_Courses FOREIGN KEY (CourseId) REFERENCES dbo.Courses(Id) ON DELETE CASCADE
);
GO

/* ------------------------------------------------------------ ChatMessages */
IF OBJECT_ID(N'dbo.ChatMessages', N'U') IS NULL
CREATE TABLE dbo.ChatMessages (
    Id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ChatMessages PRIMARY KEY,
    UserId     INT               NOT NULL,
    CourseId   INT               NULL,          -- NULL = dersten bağımsız genel sohbet
    Role       NVARCHAR(16)      NOT NULL,
    Content    NVARCHAR(MAX)     NOT NULL,
    CreatedAt  DATETIME2(3)      NOT NULL CONSTRAINT DF_ChatMessages_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_ChatMessages_Role  CHECK (Role IN (N'user', N'assistant')),
    CONSTRAINT FK_ChatMessages_Users   FOREIGN KEY (UserId)   REFERENCES dbo.Users(Id),
    CONSTRAINT FK_ChatMessages_Courses FOREIGN KEY (CourseId) REFERENCES dbo.Courses(Id) ON DELETE CASCADE
);
GO

/* ----------------------------------------------------------------- Quizzes */
IF OBJECT_ID(N'dbo.Quizzes', N'U') IS NULL
CREATE TABLE dbo.Quizzes (
    Id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Quizzes PRIMARY KEY,
    UserId     INT               NOT NULL,
    CourseId   INT               NOT NULL,
    NoteId     INT               NOT NULL,
    CreatedAt  DATETIME2(3)      NOT NULL CONSTRAINT DF_Quizzes_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Quizzes_Users   FOREIGN KEY (UserId)   REFERENCES dbo.Users(Id),
    CONSTRAINT FK_Quizzes_Courses FOREIGN KEY (CourseId) REFERENCES dbo.Courses(Id),
    CONSTRAINT FK_Quizzes_Notes   FOREIGN KEY (NoteId)   REFERENCES dbo.Notes(Id) ON DELETE CASCADE
);
GO

/* ----------------------------------------------------------- QuizQuestions */
IF OBJECT_ID(N'dbo.QuizQuestions', N'U') IS NULL
CREATE TABLE dbo.QuizQuestions (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_QuizQuestions PRIMARY KEY,
    QuizId         INT               NOT NULL,
    QuestionIndex  INT               NOT NULL,   -- 0'dan başlar
    QuestionText   NVARCHAR(MAX)     NOT NULL,
    OptionA        NVARCHAR(500)     NOT NULL,
    OptionB        NVARCHAR(500)     NOT NULL,
    OptionC        NVARCHAR(500)     NOT NULL,
    OptionD        NVARCHAR(500)     NOT NULL,
    CorrectAnswer  CHAR(1)           NOT NULL,   -- 'A' | 'B' | 'C' | 'D'
    Explanation    NVARCHAR(MAX)     NOT NULL,
    Topic          NVARCHAR(200)     NOT NULL,
    CONSTRAINT CK_QuizQuestions_Correct CHECK (CorrectAnswer IN ('A','B','C','D')),
    CONSTRAINT UQ_QuizQuestions_Quiz_Index UNIQUE (QuizId, QuestionIndex),
    CONSTRAINT FK_QuizQuestions_Quizzes FOREIGN KEY (QuizId) REFERENCES dbo.Quizzes(Id) ON DELETE CASCADE
);
GO

/* ------------------------------------------------------------- QuizResults */
IF OBJECT_ID(N'dbo.QuizResults', N'U') IS NULL
CREATE TABLE dbo.QuizResults (
    Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_QuizResults PRIMARY KEY,
    UserId          INT               NOT NULL,
    QuizId          INT               NOT NULL,
    Score           INT               NOT NULL,
    Total           INT               NOT NULL,
    Recommendation  NVARCHAR(MAX)     NULL,
    CreatedAt       DATETIME2(3)      NOT NULL CONSTRAINT DF_QuizResults_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_QuizResults_Score CHECK (Score >= 0 AND Total > 0 AND Score <= Total),
    CONSTRAINT FK_QuizResults_Users   FOREIGN KEY (UserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_QuizResults_Quizzes FOREIGN KEY (QuizId) REFERENCES dbo.Quizzes(Id) ON DELETE CASCADE
);
GO

/* ------------------------------------------------------------- QuizAnswers */
IF OBJECT_ID(N'dbo.QuizAnswers', N'U') IS NULL
CREATE TABLE dbo.QuizAnswers (
    Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_QuizAnswers PRIMARY KEY,
    ResultId        INT               NOT NULL,
    QuestionId      INT               NOT NULL,
    SelectedAnswer  CHAR(1)           NULL,       -- NULL = boş bırakıldı
    IsCorrect       BIT               NOT NULL,
    CONSTRAINT CK_QuizAnswers_Selected CHECK (SelectedAnswer IS NULL OR SelectedAnswer IN ('A','B','C','D')),
    CONSTRAINT UQ_QuizAnswers_Result_Question UNIQUE (ResultId, QuestionId),
    CONSTRAINT FK_QuizAnswers_Results   FOREIGN KEY (ResultId)   REFERENCES dbo.QuizResults(Id) ON DELETE CASCADE,
    CONSTRAINT FK_QuizAnswers_Questions FOREIGN KEY (QuestionId) REFERENCES dbo.QuizQuestions(Id)
);
GO

/* -------------------------------------------------------------- NoteChunks
   RAG (bonus): her not ~800 karakterlik parçalara bölünür; /ask soruyla ilgili
   parçaları bulup Ollama'ya bağlam olarak verir. */
IF OBJECT_ID(N'dbo.NoteChunks', N'U') IS NULL
CREATE TABLE dbo.NoteChunks (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_NoteChunks PRIMARY KEY,
    NoteId      INT               NOT NULL,
    ChunkIndex  INT               NOT NULL,
    Content     NVARCHAR(MAX)     NOT NULL,
    CONSTRAINT UQ_NoteChunks_Note_Index UNIQUE (NoteId, ChunkIndex),
    CONSTRAINT FK_NoteChunks_Notes FOREIGN KEY (NoteId) REFERENCES dbo.Notes(Id) ON DELETE CASCADE
);
GO

/* --------------------------------------------------- Sonradan eklenen alanlar
   Mevcut veritabanlarında da çalışsın diye ALTER ile, idempotent. */
IF COL_LENGTH(N'dbo.ChatMessages', N'Sources') IS NULL
    ALTER TABLE dbo.ChatMessages ADD Sources NVARCHAR(MAX) NULL;     -- asistan yanıtının dayandığı not parçaları (JSON)
IF COL_LENGTH(N'dbo.Quizzes', N'Difficulty') IS NULL
    ALTER TABLE dbo.Quizzes ADD Difficulty NVARCHAR(10) NULL;        -- kolay | orta | zor
IF COL_LENGTH(N'dbo.Quizzes', N'FocusTopic') IS NULL
    ALTER TABLE dbo.Quizzes ADD FocusTopic NVARCHAR(100) NULL;
GO

/* -------------------------------------------------------------- Flashcards
   Aralıklı tekrar (SM-2): her kartın kolaylık katsayısı, aralığı ve sıradaki tekrar zamanı. */
IF OBJECT_ID(N'dbo.Flashcards', N'U') IS NULL
CREATE TABLE dbo.Flashcards (
    Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Flashcards PRIMARY KEY,
    UserId          INT               NOT NULL,
    NoteId          INT               NOT NULL,
    Front           NVARCHAR(500)     NOT NULL,
    Back            NVARCHAR(1000)    NOT NULL,
    Topic           NVARCHAR(200)     NULL,
    EaseFactor      DECIMAL(4,2)      NOT NULL CONSTRAINT DF_Flashcards_Ease DEFAULT 2.50,
    IntervalDays    INT               NOT NULL CONSTRAINT DF_Flashcards_Interval DEFAULT 0,
    Repetitions     INT               NOT NULL CONSTRAINT DF_Flashcards_Reps DEFAULT 0,
    ReviewCount     INT               NOT NULL CONSTRAINT DF_Flashcards_ReviewCount DEFAULT 0,
    LastGrade       TINYINT           NULL,
    DueAt           DATETIME2(3)      NOT NULL CONSTRAINT DF_Flashcards_DueAt DEFAULT SYSUTCDATETIME(),
    LastReviewedAt  DATETIME2(3)      NULL,
    CreatedAt       DATETIME2(3)      NOT NULL CONSTRAINT DF_Flashcards_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Flashcards_Grade CHECK (LastGrade IS NULL OR LastGrade BETWEEN 0 AND 5),
    CONSTRAINT FK_Flashcards_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id),
    CONSTRAINT FK_Flashcards_Notes FOREIGN KEY (NoteId) REFERENCES dbo.Notes(Id) ON DELETE CASCADE
);
GO

/* ----------------------------------------------------------------- Index'ler
   Her UserId / CourseId sütununa index. "Son işlemler" sorguları için
   CreatedAt DESC ile birleşik tutuldu (UserId önde olduğundan tek başına da kullanılır). */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Courses_UserId')
    CREATE INDEX IX_Courses_UserId ON dbo.Courses(UserId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Notes_UserId_CreatedAt')
    CREATE INDEX IX_Notes_UserId_CreatedAt ON dbo.Notes(UserId, CreatedAt DESC) INCLUDE (CourseId, Title);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Notes_CourseId')
    CREATE INDEX IX_Notes_CourseId ON dbo.Notes(CourseId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ChatMessages_User_Course_CreatedAt')
    CREATE INDEX IX_ChatMessages_User_Course_CreatedAt ON dbo.ChatMessages(UserId, CourseId, CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ChatMessages_CourseId')
    CREATE INDEX IX_ChatMessages_CourseId ON dbo.ChatMessages(CourseId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Quizzes_UserId_CreatedAt')
    CREATE INDEX IX_Quizzes_UserId_CreatedAt ON dbo.Quizzes(UserId, CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Quizzes_CourseId')
    CREATE INDEX IX_Quizzes_CourseId ON dbo.Quizzes(CourseId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Quizzes_NoteId')
    CREATE INDEX IX_Quizzes_NoteId ON dbo.Quizzes(NoteId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_QuizResults_UserId_CreatedAt')
    CREATE INDEX IX_QuizResults_UserId_CreatedAt ON dbo.QuizResults(UserId, CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_QuizResults_QuizId')
    CREATE INDEX IX_QuizResults_QuizId ON dbo.QuizResults(QuizId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_QuizAnswers_QuestionId')
    CREATE INDEX IX_QuizAnswers_QuestionId ON dbo.QuizAnswers(QuestionId);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Flashcards_User_Due')
    CREATE INDEX IX_Flashcards_User_Due ON dbo.Flashcards(UserId, DueAt);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Flashcards_NoteId')
    CREATE INDEX IX_Flashcards_NoteId ON dbo.Flashcards(NoteId);
GO

/* --------------------------------------------------------- Full-Text Search
   Yalnızca FTS bileşeni kuruluysa (ör. SQL Server Express with Advanced Services).
   Kurulu değilse /ask anahtar kelime (LIKE) aramasına düşer. */
IF FULLTEXTSERVICEPROPERTY('IsFullTextInstalled') = 1
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_catalogs WHERE name = N'ftStudy')
        EXEC (N'CREATE FULLTEXT CATALOG ftStudy AS DEFAULT;');
    IF NOT EXISTS (SELECT 1 FROM sys.fulltext_indexes WHERE object_id = OBJECT_ID(N'dbo.NoteChunks'))
        EXEC (N'CREATE FULLTEXT INDEX ON dbo.NoteChunks(Content LANGUAGE 1055) KEY INDEX PK_NoteChunks ON ftStudy WITH CHANGE_TRACKING AUTO;');
    PRINT N'Full-Text index hazır.';
END
ELSE
    PRINT N'Full-Text Search kurulu değil; anahtar kelime araması kullanılacak.';
GO

/* ------------------------------------------------- n8n payload çözücü
   n8n tüm kullanıcı verisini tek bir parametre olarak gönderir:
   UTF-16LE JSON -> base64. Base64 alfabesinde tırnak/virgül olmadığı için
   SQL injection'a ve n8n'in virgülle ayrılan parametre listesine karşı güvenlidir.
   Sorgular: DECLARE @j NVARCHAR(MAX) = dbo.fn_DecodePayload($1); ... OPENJSON(@j) */
CREATE OR ALTER FUNCTION dbo.fn_DecodePayload (@b64 VARCHAR(MAX))
RETURNS NVARCHAR(MAX)
AS
BEGIN
    RETURN CAST(CAST(N'' AS XML).value('xs:base64Binary(sql:variable("@b64"))', 'VARBINARY(MAX)') AS NVARCHAR(MAX));
END
GO

/* ------------------------------------------------------ İstatistik view'ları
   Ders bazlı başarı (bonus) — GROUP BY ile. */
CREATE OR ALTER VIEW dbo.vw_CourseStats
AS
SELECT
    c.UserId,
    c.Id                                    AS CourseId,
    c.Name                                  AS CourseName,
    (SELECT COUNT(*) FROM dbo.Notes n WHERE n.CourseId = c.Id)            AS NoteCount,
    COUNT(r.Id)                             AS QuizAttempts,
    ISNULL(SUM(r.Score), 0)                 AS TotalCorrect,
    ISNULL(SUM(r.Total), 0)                 AS TotalQuestions,
    CAST(CASE WHEN SUM(r.Total) > 0
              THEN 100.0 * SUM(r.Score) / SUM(r.Total) END AS DECIMAL(5,1)) AS SuccessRate,
    MAX(r.CreatedAt)                        AS LastQuizAt
FROM dbo.Courses c
LEFT JOIN dbo.Quizzes q     ON q.CourseId = c.Id
LEFT JOIN dbo.QuizResults r ON r.QuizId = q.Id
GROUP BY c.UserId, c.Id, c.Name;
GO

CREATE OR ALTER VIEW dbo.vw_TopicPerformance
AS
SELECT
    r.UserId,
    q.CourseId,
    qq.Topic,
    COUNT(*)                                             AS Answered,
    SUM(CASE WHEN a.IsCorrect = 1 THEN 1 ELSE 0 END)     AS Correct,
    SUM(CASE WHEN a.IsCorrect = 0 THEN 1 ELSE 0 END)     AS Wrong,
    CAST(100.0 * SUM(CASE WHEN a.IsCorrect = 1 THEN 1 ELSE 0 END) / COUNT(*) AS DECIMAL(5,1)) AS SuccessRate
FROM dbo.QuizAnswers a
JOIN dbo.QuizResults r    ON r.Id = a.ResultId
JOIN dbo.QuizQuestions qq ON qq.Id = a.QuestionId
JOIN dbo.Quizzes q        ON q.Id = r.QuizId
GROUP BY r.UserId, q.CourseId, qq.Topic;
GO

/* ------------------------------------------------- Uygulama kullanıcısı (n8n)
   n8n 'sa' yerine bu kısıtlı kullanıcıyla bağlanır. */
USE master;
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'$(APP_DB_USER)')
    CREATE LOGIN [$(APP_DB_USER)] WITH PASSWORD = N'$(APP_DB_PASSWORD)',
        DEFAULT_DATABASE = StudyAssistant, CHECK_POLICY = ON;
GO
USE StudyAssistant;
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'$(APP_DB_USER)')
    CREATE USER [$(APP_DB_USER)] FOR LOGIN [$(APP_DB_USER)];
ALTER ROLE db_datareader ADD MEMBER [$(APP_DB_USER)];
ALTER ROLE db_datawriter ADD MEMBER [$(APP_DB_USER)];
GRANT EXECUTE ON SCHEMA::dbo TO [$(APP_DB_USER)];
GO

PRINT N'StudyAssistant şeması hazır.';
GO
