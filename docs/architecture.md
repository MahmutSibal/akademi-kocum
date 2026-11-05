# Akademi Koçum — Sistem Mimarisi

Yapay zekâ destekli akıllı ders ve soru asistanı. Tüm servisler yerelde, Docker Compose ile çalışır.

## 1. Sistem mimarisi

```mermaid
flowchart LR
    subgraph Client["📱 İstemci"]
        APP["Flutter Uygulaması<br/>(Dart)<br/>screens · services · models"]
    end

    subgraph Docker["🐳 Docker Compose — study-net ağı"]
        direction LR
        N8N["n8n :5678<br/>HTTP Webhook iş akışları<br/>(iç veri: SQLite)"]
        OLLAMA["Ollama :11434<br/>Yerel LLM<br/>qwen2.5:3b (.env)"]
        MSSQL[("SQL Server 2022 :1433<br/>StudyAssistant DB")]
        DBINIT["db-init<br/>(tek seferlik)<br/>init.sql"]
        PULL["ollama-pull<br/>(tek seferlik)<br/>ollama pull"]
    end

    APP -- "REST / JSON<br/>POST /webhook/*" --> N8N
    N8N -- "/api/chat<br/>format: json" --> OLLAMA
    N8N -- "Microsoft SQL node<br/>parametreli sorgu" --> MSSQL
    DBINIT -. "sqlcmd -i init.sql" .-> MSSQL
    PULL -. "model indir" .-> OLLAMA
```

**Uç noktalar (n8n webhook'ları):**

| Uç nokta | Görev | Okur | Yazar |
|---|---|---|---|
| `POST /webhook/register` | Kayıt | Users | Users |
| `POST /webhook/login` | Giriş | Users | — |
| `POST /webhook/ask` | Soru-cevap | ChatMessages (son N) | ChatMessages |
| `POST /webhook/summarize` | Not özeti | — | Notes |
| `POST /webhook/generate-quiz` | Test üretimi | Notes | Quizzes, QuizQuestions (transaction) |
| `POST /webhook/evaluate` | Değerlendirme + öneri | QuizQuestions | QuizResults, QuizAnswers (transaction) |
| `POST /webhook/data` | Dersler, notlar, geçmiş, istatistik, kart tekrarı (SM-2) | Tümü (view'lar) | Courses, ChatMessages, Flashcards |
| `POST /webhook/study-plan` | 7 günlük program | vw_CourseStats, vw_TopicPerformance | — |
| `POST /webhook/extract-pdf` | PDF → metin | — | — |
| `POST /webhook/extract-image` | Defter fotoğrafı → metin (görsel model) | — | — |
| `POST /webhook/flashcards` | Nottan ezber kartı | Notes, Flashcards | Flashcards |
| `POST /webhook/weekly-report` + **Schedule** (Pzt 09:00) | Haftalık e-posta raporu (Brevo SMTP) | Users, QuizResults, view'lar | — |

**Çalışma modları** (`backend/.env` → `COMPOSE_PROFILES`):

| Mod | `COMPOSE_PROFILES` | SQL Server | Ollama | Şema kurulumu |
|---|---|---|---|---|
| Host (geliştirme makinesi) | boş | Bilgisayardaki instance → `host.docker.internal,1433` | Bilgisayardaki Ollama → `http://host.docker.internal:11434` | `scripts/init-local.ps1` |
| Tam Docker (teslim / demo) | `mssql,ollama` | `sqlserver:1433` konteyneri | `http://ollama:11434` konteyneri | `db-init` servisi |

Her iki modda n8n Docker'da çalışır ve aynı `init.sql` kullanılır.

**Adresler:** Android emülatör → `http://10.0.2.2:5678`, gerçek cihaz → `http://<bilgisayarın-LAN-IP'si>:5678`, n8n → Ollama `http://ollama:11434`, n8n → SQL Server `sqlserver:1433`.

## 2. Canlı demo akışı (sequence)

```mermaid
sequenceDiagram
    autonumber
    actor U as Öğrenci
    participant F as Flutter
    participant N as n8n
    participant O as Ollama
    participant D as SQL Server

    U->>F: Not metni yapıştır
    F->>N: POST /webhook/summarize
    N->>O: Özetle (Türkçe)
    O-->>N: summary
    N->>D: INSERT Notes
    N-->>F: { noteId, summary }

    U->>F: "Bu nottan test oluştur"
    F->>N: POST /webhook/generate-quiz
    N->>D: SELECT Notes
    loop En fazla 3 deneme
        N->>O: Yalnızca JSON üret (format: json)
        O-->>N: { questions: [...] }
        N->>N: Şema doğrulama
    end
    N->>D: INSERT Quizzes + QuizQuestions (TRAN)
    N-->>F: Sorular (cevapsız, açıklamasız)

    U->>F: Cevapları işaretle (≥1 yanlış)
    F->>N: POST /webhook/evaluate
    N->>D: SELECT QuizQuestions (doğru cevaplar)
    N->>N: Puanı KOD ile hesapla
    N->>O: Yanlış konular → çalışma önerisi
    O-->>N: recommendation
    N->>D: INSERT QuizResults + QuizAnswers (TRAN)
    N-->>F: { score, total, results[], recommendation }
```

## 3. ER diyagramı

```mermaid
erDiagram
    Users ||--o{ Courses : "sahibi"
    Users ||--o{ Notes : "yazar"
    Users ||--o{ ChatMessages : "gönderir"
    Users ||--o{ Quizzes : "çözer"
    Users ||--o{ QuizResults : "alır"
    Courses ||--o{ Notes : "içerir"
    Courses |o--o{ ChatMessages : "bağlam"
    Courses ||--o{ Quizzes : "kapsar"
    Notes ||--o{ Quizzes : "kaynak"
    Quizzes ||--|{ QuizQuestions : "içerir"
    Quizzes ||--o{ QuizResults : "sonuç"
    QuizResults ||--|{ QuizAnswers : "içerir"
    QuizQuestions ||--o{ QuizAnswers : "cevaplanır"
    Notes ||--o{ NoteChunks : "RAG parçaları"
    Notes ||--o{ Flashcards : "kart kaynağı"
    Users ||--o{ Flashcards : "tekrar eder"

    NoteChunks {
        int Id PK
        int NoteId FK
        int ChunkIndex
        nvarchar_max Content
    }
    Flashcards {
        int Id PK
        int UserId FK
        int NoteId FK
        nvarchar Front
        nvarchar Back
        nvarchar Topic
        decimal EaseFactor "SM-2"
        int IntervalDays
        int Repetitions
        datetime2 DueAt
    }

    Users {
        int Id PK
        nvarchar Email UK
        nvarchar PasswordHash
        nvarchar Name
        datetime2 CreatedAt
    }
    Courses {
        int Id PK
        int UserId FK
        nvarchar Name
        nvarchar Description
        datetime2 CreatedAt
    }
    Notes {
        int Id PK
        int UserId FK
        int CourseId FK
        nvarchar Title
        nvarchar_max Content
        nvarchar_max Summary
        datetime2 CreatedAt
    }
    ChatMessages {
        int Id PK
        int UserId FK
        int CourseId FK "NULL = genel"
        nvarchar Role "user | assistant"
        nvarchar_max Content
        nvarchar_max Sources "atıf yapılan not parçaları (JSON)"
        datetime2 CreatedAt
    }
    Quizzes {
        int Id PK
        int UserId FK
        int CourseId FK
        int NoteId FK
        nvarchar Difficulty "kolay | orta | zor"
        nvarchar FocusTopic
        datetime2 CreatedAt
    }
    QuizQuestions {
        int Id PK
        int QuizId FK
        int QuestionIndex
        nvarchar_max QuestionText
        nvarchar OptionA
        nvarchar OptionB
        nvarchar OptionC
        nvarchar OptionD
        char CorrectAnswer "A-D"
        nvarchar_max Explanation
        nvarchar Topic
    }
    QuizResults {
        int Id PK
        int UserId FK
        int QuizId FK
        int Score
        int Total
        nvarchar_max Recommendation
        datetime2 CreatedAt
    }
    QuizAnswers {
        int Id PK
        int ResultId FK
        int QuestionId FK
        char SelectedAnswer "A-D / NULL"
        bit IsCorrect
    }
```

### Silme (cascade) stratejisi

SQL Server, aynı tabloya birden fazla cascade yolu olmasına izin vermez. Bu yüzden her tabloda **tek** bir cascade yolu var, diğer FK'ler `NO ACTION`:

```
Users ─CASCADE→ Courses ─CASCADE→ Notes ─CASCADE→ Quizzes ─CASCADE→ QuizQuestions
                        └CASCADE→ ChatMessages        └──CASCADE→ QuizResults ─CASCADE→ QuizAnswers
```

## 4. Varsayımlar

1. **`CorrectAnswer` / `SelectedAnswer` harf olarak (`A`–`D`) saklanır.** Ollama `correct_answer`'ı seçenek metni olarak döndürür; n8n bunu doğrulama sırasında harfe çevirir. İstemci de `selected` alanında harf gönderir.
2. **`ChatMessages.CourseId` boş olabilir** — ana sayfadaki "asistana sor" ders seçmeden de çalışsın diye.
3. **Şifre hash'i:** n8n Code node'unda harici `bcrypt` paketi yok; Node'un yerleşik `crypto.scrypt` fonksiyonu (tuzlu, yavaş KDF — bcrypt eşdeğeri) kullanılır. Biçim: `scrypt$<salt-hex>$<hash-hex>`.
4. **n8n uygulama verisine ayrı bir SQL login (`APP_DB_USER`) ile bağlanır**, `sa` ile değil. Bu kullanıcının yalnızca okuma/yazma yetkisi vardır.
