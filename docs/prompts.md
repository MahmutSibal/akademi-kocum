# Prompt Tasarımı

Tüm prompt'lar n8n'deki ilgili **"Prompt hazırla"** Code düğümünde, başında `// PROMPT (...)` yorumuyla yazılıdır. Kaynakları `backend/n8n/build/wf-*.mjs` içindedir. Bu belge her birinin neden böyle tasarlandığını açıklar.

## Ortak ilkeler

| İlke | Nasıl uygulandı |
|---|---|
| **Türkçe çıktı** | Her sistem mesajında "Türkçe yaz" + "yalnızca Latin alfabesi kullan" kuralı. Qwen'in Türkçe harfleri Çince karakterle yazma eğilimine karşı ayrıca kodda `fixTurkish()` düzeltmesi var. |
| **Rol + kurallar + biçim** | Sistem mesajı rolü tanımlar; kullanıcı mesajı madde madde kurallar ve beklenen çıktı biçimini verir. |
| **Uydurmayı önleme** | Özet ve testlerde "yalnızca notta geçen bilgilere dayan"; sohbette "notta olmayan bilgiyi verirsen genel bilgi olduğunu belirt, bilmiyorsan söyle". |
| **Yapılandırılmış çıktı** | JSON gereken yerlerde Ollama'nın `format` alanına **JSON şeması** verilir (structured output). Model şemaya zorlanır; buna rağmen sonuç kodda tekrar doğrulanır. |
| **Bağlam sınırı** | Not metni `MAX_LLM_INPUT_CHARS` (varsayılan 12.000) karakterde kesilir, `num_ctx` 8192. |
| **Sıcaklık** | Özet 0.3 (tutarlı), sohbet 0.4, test/öneri/plan 0.5 (çeşitlilik), yeniden deneme 0.2 (kurala sadakat). |
| **Kritik işler koda** | Puanlama, doğru cevap kontrolü, seçenek karıştırma, gün/tarih hesaplama LLM'e bırakılmaz. |

## 1. Soru-cevap (`03-ask`)

**Sistem:** "Akademi Koçum" adlı asistan; Türkçe, öğretici, en fazla 250 kelime, `**`/`#` yok, uydurma yok. Ders seçiliyse ders adı eklenir.

**Bağlam (RAG):** Sorudan anahtar kelimeler çıkarılır (Türkçe ekleri kabaca atmak için 6 harfe kesilir, "nedir/nasıl" gibi durak kelimeler atılır). SQL Server'da `NoteChunks` içinde Full-Text (varsa) ya da `LIKE` skoruyla en ilgili 4 parça bulunur ve ayrı bir sistem mesajı olarak verilir:

```
Öğrencinin ders notlarından ilgili bölümler:
[1] (Flutter Temelleri - Hafta 2)
StatelessWidget kendi durumu olmayan widget'tır...
```

**Geçmiş:** Aynı ders için son `CHAT_HISTORY_LIMIT` (10) mesaj, kronolojik sırayla `user`/`assistant` rolleriyle eklenir.

**Kaynak gösterme (atıf):** Bağlam mesajının sonuna bir atıf kuralı ve örnek eklenir:

```
ATIF KURALI: Bu bölümlerden aldığın her bilginin cümle sonuna bölüm numarasını köşeli parantezle ekle.
Örnek: "setState() çağrıldığında build() yeniden çalışır [1]. Hot reload ise durumu korur [2]."
```

Kod yanıttaki `[n]` atıflarını ayıklar: verilmeyen bir numaraya yapılan atıf metinden silinir, atıf yapılan bölümler `sources` olarak döner ve `ChatMessages.Sources` kolonuna kaydedilir. Model atıf yapmazsa (küçük modellerde olabiliyor) bağlam olarak verilen bölümler "yararlanılan notlar" (`cited: false`) olarak yine gösterilir; böylece öğrenci cevabın hangi notla üretildiğini her zaman görür.

## 2. Not özetleme (`04-summarize`)

Sabit başlıklı bir şablon istenir; böylece uygulama her özeti aynı düzende gösterir:

```
Genel Bakış: 2-3 cümle
Anahtar Kavramlar: "- Kavram: kısa açıklama" (4-8 madde)
Sınavda Dikkat: "- " ile 2-3 madde
```

Not, `"""` ile çevrelenir; modelin notu talimat sanmasını engeller.

## 3. Test üretimi (`05-generate-quiz`)

- **Şema:** `questions` dizisi `minItems = maxItems = n`; her öğede `options` tam 4 eleman; tüm alanlar `required`.
- **Kurallar:** "TAM OLARAK n soru", "correct_answer seçeneklerden birinin metniyle BİREBİR aynı", "topic 2-4 kelime", örnek JSON satırı.
- **Uyarlanabilir zorluk:** SQL, öğrencinin aynı dersteki son 3 testinin başarı yüzdesini getirir. Kod zorluğu seçer (%80+ → zor, %50 altı → kolay, aksi halde orta; geçmiş yoksa orta) ve prompt'a seviye tanımı eklenir:
  - **Kolay:** tanım ve temel bilgileri doğrudan soran, çeldiricileri açıkça yanlış sorular.
  - **Orta:** kavramın anlaşılıp anlaşılmadığını ölçen, makul çeldiricili sorular.
  - **Zor:** karşılaştırma, uygulama ve çıkarım gerektiren, birbirine yakın çeldiricili sorular.

  Seçilen zorluk ve gerekçesi ("Bu dersteki son 3 testte başarın %85 olduğu için seçildi") `Quizzes.Difficulty` kolonuna yazılır ve uygulamada test ekranının üstünde gösterilir.
- **Konuya odaklı test:** `focusTopic` verilirse "Soruların HEPSİ '<konu>' konusunu ölçsün" kuralı eklenir (sonuç ekranındaki "Eksik konudan yeni test" bunu kullanır).
- **Doğrulama (kod):** ≥ n soru, 4 dolu ve birbirinden farklı seçenek, `correct_answer` seçeneklerden biri (büyük/küçük harf ve "B) ..." biçimleri tolere edilir), boş alan yok.
- **Yeniden deneme:** Geçersizse modelin önceki çıktısı `assistant` mesajı olarak, hatalar da `user` mesajı olarak eklenir ("Önceki çıktın şu nedenlerle geçersizdi: ...") ve sıcaklık 0.2'ye düşürülür. En fazla `QUIZ_MAX_RETRIES` (2) kez.
- **Karıştırma:** Model doğru cevabı çoğunlukla A'ya koyduğu için seçenekler kodda karıştırılır.
- İstemciye `correct_answer` ve `explanation` **gönderilmez**.

## 4. Çalışma önerisi (`06-evaluate`)

Puan kodla hesaplanır. Modele yalnızca **yanlış/boş sorular** verilir; her biri için konu, soru, öğrencinin cevabı, doğru cevap ve açıklama:

```
1) Konu: Hot reload
   Soru: ...
   Öğrencinin cevabı: A) ...
   Doğru cevap: C) ...
   Açıklama: ...
```

Çıktı şeması: `{ summary, focusTopics[{topic, reason, action}], studyPlan[], motivation }`. Kural: `focusTopics` yalnızca yanlış konulardan oluşur, öğrenciye "sen" diye hitap edilir. Ollama ulaşılamazsa veya JSON bozuksa **kural tabanlı yedek öneri** üretilir; değerlendirme hiçbir zaman öneri olmadan bitmez. Tam puanda LLM çağrılmaz.

## 5. Ezber kartları (`10-flashcards`)

Şema: `{ cards: [{ front, back, topic }] }` (`minItems = maxItems = count`). Kurallar: ön yüz tek bir kavramı soran kısa bir soru (≤120 karakter), arka yüz 1-2 cümlelik net cevap (≤250 karakter), yalnızca nottaki bilgiler. Aynı not için daha önce üretilmiş kartların ön yüzleri prompt'a "bunları tekrar etme" diye eklenir; kod ayrıca tekrar edenleri eler.

Tekrar zamanlaması LLM'e değil **SM-2 algoritmasına** (SQL `UPDATE ... CROSS APPLY`) bırakılır: not < 3 → baştan (1 gün); değilse aralık 1 → 6 → önceki aralık × kolaylık katsayısı; katsayı `EF + 0.1 − (5−q)(0.08 + (5−q)·0.02)`, en az 1.3.

## 6. Fotoğraftan not (`11-extract-image`)

Görsel model (`OLLAMA_VISION_MODEL`, varsayılan `gemma4:12b`) ile `/api/chat`, mesajın `images` alanında base64 görsel:

```
Sistem: Sen ders notlarını dijitalleştiren bir OCR asistanısın. Fotoğraftaki el yazısı veya basılı ders notunu
Türkçe karakterleri (ç, ğ, ı, İ, ö, ş, ü) koruyarak birebir metne dökersin. Yorum, açıklama veya özet eklemezsin;
okuyamadığın kelimeyi [?] ile belirtirsin.
Kullanıcı: Bu fotoğraftaki tüm ders notunu satır satır, madde işaretleri ve başlıklarla birlikte aynen yaz.
```

`think: false` (düşünme modu kapalı), `temperature: 0.1` (OCR'da yaratıcılık istenmez). Çıkan metin not editörüne yazılır; öğrenci kontrol edip normal özet → test akışına devam eder.

## 7. Haftalık program (`08-study-plan`)

Girdi: `vw_CourseStats` (ders başarı oranları, son not başlıkları) ve `vw_TopicPerformance` (en zayıf 8 konu). Gün adları ve tarihler kodda hesaplanıp prompt'a verilir; modelin ürettiği gün/tarih yok sayılıp kodunkiyle değiştirilir. Kurallar: tam 7 gün, zayıf konulara daha çok zaman, günlük toplam süreyi aşmama, son gün genel tekrar.
