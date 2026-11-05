# Model Karşılaştırması

Ölçüm: `node backend/tests/benchmark-models.mjs` · 05.11.2026 · her model için 3 test üretimi + 1 özet.
Prompt ve JSON şeması **workflow 05 ile birebir aynıdır**; geçerlilik, workflow'daki "Şemayı doğrula" düğümünün kurallarıyla ölçülür
(tam 5 soru, 4 farklı ve dolu seçenek, cevap seçeneklerden biri, boş alan yok). Donanım: RTX 5060 Laptop (8 GB), 32 GB RAM.

| Model | Geçerli test JSON'u | Test süresi (ort.) | Token/sn | Özet süresi | Bozuk Türkçe karakter* | Yabancı alfabe | Yükleme |
|---|---|---|---|---|---|---|---|
| `qwen2.5:3b` | 67% (2/3) | 17.4 sn | 45.3 | 12.8 sn | 0 | 0 | 4.4 sn |
| `qwen2.5:7b` | 67% (2/3) | 28.4 sn | 22.4 | 18.1 sn | 0 | 0 | 5.5 sn |
| `gemma4:12b` | 100% (3/3) | 73.0 sn | 8.8 | 38.6 sn | 0 | 0 | 21.5 sn |

\* Qwen modellerinin Türkçe harfleri GBK okunuşuyla (ı → 谋, ş → 艧) yazması; workflow'lar bunu `fixTurkish()` ile düzeltir.
Yeniden deneme (en fazla 2) sayesinde tek denemede geçersiz olan çıktıların çoğu kullanıcıya hiç yansımaz.

## Sonuç (bu ölçümden)

- **`gemma4:12b`**: şemaya ilk denemede 3/3 uydu, ama en yavaşı (test ~73 sn, 8.8 token/sn). 8 GB ekran kartına tam sığmadığı için kısmen RAM'de çalışıyor; yüklenmesi de ~21 sn.
- **`qwen2.5:7b`**: 2/3 (bir denemede tekrar eden seçenek), test ~28 sn — gemma'dan ~2,5 kat hızlı.
- **`qwen2.5:3b`**: 2/3 (cevabın seçeneklerde olmaması, tekrar eden seçenek), test ~17 sn — en hızlısı, ~2 GB.
- Bu çalıştırmada üç modelde de bozuk Türkçe karakter (`谋`, `艧`) görülmedi; daha önceki denemelerde Qwen'de görüldüğü için `fixTurkish()` güvenlik olarak yerinde kalıyor.

**Seçim:** Metin görevleri için varsayılan **`qwen2.5:7b`**. Geçersiz çıktıyı workflow'daki 2 yeniden deneme yakaladığından, ~2,5 kat hız farkı kullanıcı deneyiminde daha belirleyici. Fotoğraftan not için **`gemma4:12b`**: görsel destekli ve düşünme modu kapatılabiliyor (`qwen3-vl:8b` kapatamadığı için çıktı üretmeden token sınırına takıldı). Düşük donanımda `qwen2.5:3b` kullanılabilir.

Her model için yalnızca 3 deneme yapıldığından oranlar kabaca yorumlanmalı; daha kesin sonuç için `--runs=10` ile tekrar ölçülebilir.

Model değiştirmek için `.env` → `OLLAMA_MODEL` (metin) ve `OLLAMA_VISION_MODEL` (fotoğraf).

## Örnek özet çıktıları

**qwen2.5:3b**

> Genel Bakış:
> Flutter, Google tarafından geliştirilen açık kaynaklı bir kullanıcı arayüzü (UI) geliştirme çatısıdır. Uygulamaları Dart programlama dili ile yazılarak, tek bir kod tabanından Android, iOS, web ve masaüstü uygulamaları üretir. Dart, hem JIT (Just-In-Time) hem de AOT (Ahead-Of-Time) derlemeyi destekler: geliştirme sırasında JIT sayesinde hot reload kullanılır, yayın sürümünde ise AOT i…

**qwen2.5:7b**

> Genel Bakış:
> Flutter, Google tarafından geliştirilmiş ve açık kaynaklı bir kullanıcı arayüzü (UI) geliştirme aracıdır. Bir kod tabanından Android, iOS, web ve masaüstü uygulamaları oluşturmayı sağlar. Flutter, Dart ile yazılmıştır ve hot reload ve hot restart özellikleriyle geliştirme sürecinde yardımcı olur.
> Anahtar Kavramlar:
> - Widget: Flutter'da arayüzdeki her şey bir widget'tır. Metin, düğme,…

**gemma4:12b**

> Genel Bakış:
> Flutter, Google tarafından geliştirilen ve tek bir kod tabanıyla farklı platformlar için uygulama geliştirmeyi sağlayan bir kullanıcı arayüzü çatısıdır. Dart programlama dilini kullanan bu sistemde, arayüzdeki her bileşen bir widget olarak tanımlanır ve iç içe geçerek bir widget ağacı oluşturur.
> Anahtar Kavramlar:
> - Dart Dili: JIT (geliştirme için hot reload) ve AOT (yayın için yerel…
