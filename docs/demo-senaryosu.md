# Demo Videosu Senaryosu (~8 dakika)

**Hazırlık (kayıttan önce)**
- `cd backend && docker compose up -d` → `http://localhost:5678` açılıyor mu kontrol et.
- Modeli ısıt (ilk istek yavaş olur): `bash backend/tests/api-test.sh` bir kez çalıştır.
- Emülatörü aç, uygulamayı kur: `flutter run`. Not metnini panoya kopyala (`backend/tests/payloads/ornek-not.txt`).
- Ekranda yan yana: solda emülatör, sağda n8n "Executions" sayfası.

| Süre | Ekran | Anlatım / Eylem |
|---|---|---|
| 0:00 | Mimari diyagram (`docs/architecture.md`) | "Flutter → n8n webhook → Ollama ve SQL Server. Her şey yerelde, Docker Compose ile tek komutla." |
| 0:30 | Terminal: `docker compose ps` | 5 servis: sqlserver, db-init, ollama, ollama-pull, n8n. `db-init` şemayı kurup kapandı. |
| 0:50 | n8n editörü, "04 - Not Özetleme" | Webhook → doğrulama → SQL → Ollama → SQL → yanıt; kırmızı hata dalları. |
| 1:20 | Uygulama: giriş ekranı | Boş "Giriş yap" → doğrulama mesajları. Kayıt ol (ad, e-posta, şifre). |
| 1:50 | Ana sayfa | İstatistik kartları, "Asistana sor", dersler. **Ders ekle** → "Mobil Programlama". |
| 2:10 | Not ekle | Başlık + metni yapıştır (veya **TXT/PDF yükle**). **Kaydet ve özetle** → yükleniyor ekranı. |
| 2:40 | Not özeti | Genel Bakış / Anahtar Kavramlar / Sınavda Dikkat. "Not ve RAG parçaları SQL Server'a tek transaction ile yazıldı." |
| 3:00 | n8n Executions | Az önceki özet çalışması: Ollama düğümünün girdisi/çıktısı. |
| 3:15 | **Test oluştur** (5 soru) | "Ollama'dan JSON şemasıyla test istiyoruz; geçersizse n8n en fazla 2 kez yeniden deniyor." |
| 3:45 | Test ekranı | "Doğru cevaplar istemcide yok." Birini doğru, **en az birini yanlış** cevapla, birini boş bırak → **Bitir** → boş soru uyarısı. |
| 4:15 | Sonuç | Puan halkası, **kişiselleştirilmiş öneri** (odak konular + çalışma planı), soru soru açıklamalar. "Puan kodla, öneri LLM ile." |
| 4:45 | **Yanlışları tekrar çöz** | Anında doğru/yanlış geri bildirimi. |
| 5:00 | **Eksik konudan yeni test** | Bir konu çipine dokun → yalnızca o konudan yeni test. |
| 5:20 | Sohbet (ders içinde) | "Hot reload ile hot restart farkı nedir?" → Türkçe yanıt + altında **kaynak çipi**; dokun → cevabın dayandığı not bölümü açılır. |
| 5:40 | **Fark yaratanlar** | |
| 5:40 | Not ekle → **Fotoğraftan** | Defter sayfasının fotoğrafını çek (veya `backend/tests/payloads/ornek-defter.png`). "Fotoğraf bilgisayardan dışarı çıkmıyor, yerel görsel model okuyor." |
| 6:10 | Not detayı → **Zorluk: Otomatik** → Test oluştur | Test ekranının üstündeki bant: "Zorluk: Kolay · son testte başarın %20 olduğu için". |
| 6:30 | Not detayı → **Ezber kartı oluştur** | Kart çevir, "İyi"/"Tekrar" seç: "SM-2 algoritması bir sonraki tekrar gününü hesaplıyor; bilemediğin kart birazdan tekrar geliyor." Ana sayfada "Bugün tekrar: N kart". |
| 6:55 | İstatistik → ✉ | Haftalık rapor e-postası gelir (telefonda e-postayı göster). n8n'de Schedule trigger'ı göster: "her pazartesi otomatik". |
| 7:15 | `docs/model-karsilastirma.md` | "3 modeli aynı prompt'la ölçtük; JSON geçerlilik ve hız tablosu." |
| 7:30 | İstatistik + Haftalık program | Ders başarı oranı, zayıf konular; 7 günlük plan. |
| 7:45 | SSMS / sqlcmd | `SELECT * FROM QuizResults` / `SELECT * FROM Flashcards` → kayıtların veritabanında olduğu. Kapanış. |

**Yedek plan:** Model yavaşsa `qwen2.5:3b`'ye geç (`.env` → `OLLAMA_MODEL`), ya da önceden üretilmiş bir notla demoya devam et; "Son özetler" ve "Son testler" ana sayfada hazır durur.
