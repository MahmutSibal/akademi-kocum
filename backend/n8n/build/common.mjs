// Code düğümlerinin başına eklenen ortak fonksiyonlar.
// Bu fonksiyonlar çağrılmaz; yalnızca gövdeleri n8n Code düğümüne kopyalanır.
/* eslint-disable no-undef, no-unused-vars */

/** JWT (HS256), girdi doğrulama ve SQL payload yardımcıları. */
export function authLib() {
  const crypto = require('crypto');
  const JWT_SECRET = $env.JWT_SECRET || '';
  const TOKEN_TTL_SEC = 7 * 24 * 3600;

  const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  function signToken(claims) {
    if (!JWT_SECRET) throw new Error('JWT_SECRET tanımlı değil (.env)');
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const pay = b64url(JSON.stringify({ ...claims, iat: now, exp: now + TOKEN_TTL_SEC }));
    const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${pay}`).digest());
    return `${head}.${pay}.${sig}`;
  }

  /** Authorization: Bearer <jwt> başlığını doğrular; geçerliyse claim'leri döndürür. */
  function verifyToken(headers) {
    const m = /^Bearer\s+(.+)$/i.exec((headers && headers.authorization) || '');
    if (!m || !JWT_SECRET) return null;
    const parts = m[1].split('.');
    if (parts.length !== 3) return null;
    const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest());
    if (expected.length !== parts[2].length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;
    try {
      const claims = JSON.parse(fromB64url(parts[1]).toString('utf8'));
      return claims.exp > Date.now() / 1000 ? claims : null;
    } catch {
      return null;
    }
  }

  /** Doğrulama hatası: IF düğümü ok=false görünce doğrudan yanıtlar. */
  const fail = (status, error, extra = {}) => [{ json: { ok: false, status, body: { error, ...extra } } }];

  /** SQL'e gidecek veri: UTF-16LE JSON -> base64 (dbo.fn_DecodePayload çözer). */
  const toPayload = (obj) => Buffer.from(JSON.stringify(obj), 'utf16le').toString('base64');

  const toId = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };

  /** Token'ı doğrular, gövdede userId varsa token ile eşleştiğini kontrol eder. */
  function requireUser(req) {
    const claims = verifyToken(req.headers);
    if (!claims) return { error: fail(401, 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.') };
    const bodyUser = req.body && req.body.userId;
    if (bodyUser !== undefined && bodyUser !== null && Number(bodyUser) !== Number(claims.sub)) {
      return { error: fail(403, 'Bu işlem için yetkiniz yok.') };
    }
    return { userId: Number(claims.sub) };
  }

  /** Metni temizler: kontrol karakterleri, fazla boşluk ve satırlar. */
  const cleanText = (s) =>
    String(s || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[ \t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
}

/** Ollama /api/chat isteği hazırlar. */
export function ollamaLib() {
  const OLLAMA = {
    url: `${($env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/$/, '')}/api/chat`,
    model: $env.OLLAMA_MODEL || 'qwen2.5:7b',
    numCtx: Number($env.OLLAMA_NUM_CTX || 8192),
    timeout: Number($env.OLLAMA_TIMEOUT_MS || 180000),
    // Modele verilecek en uzun not metni (bağlam penceresini aşmamak için)
    maxInputChars: Number($env.MAX_LLM_INPUT_CHARS || 12000),
  };

  /** format: undefined (serbest metin), 'json' veya bir JSON şeması. */
  function chatRequest(messages, { temperature = 0.4, format } = {}) {
    const body = {
      model: OLLAMA.model,
      messages,
      stream: false,
      keep_alive: $env.OLLAMA_KEEP_ALIVE || '30m',
      options: { temperature, num_ctx: OLLAMA.numCtx },
    };
    if (format) body.format = format;
    return { url: OLLAMA.url, body, timeout: OLLAMA.timeout };
  }

  // Qwen modelleri bazen Türkçe harfleri, UTF-8 baytlarının GBK okunuşu olan
  // Çince karakterlerle yazar (ı -> 谋, ş -> 艧 ...). Bunları geri çeviririz.
  const MOJIBAKE = { '莽': 'ç', '脟': 'Ç', '臒': 'ğ', '臑': 'Ğ', '谋': 'ı', '陌': 'İ', '枚': 'ö', '脰': 'Ö', '艧': 'ş', '艦': 'Ş', '眉': 'ü', '脺': 'Ü', '芒': 'â', '脗': 'Â', '卯': 'î', '脦': 'Î', '没': 'û', '脹': 'Û' };
  const MOJIBAKE_RE = new RegExp(`[${Object.keys(MOJIBAKE).join('')}]`, 'g');
  const fixTurkish = (s) => String(s || '').replace(MOJIBAKE_RE, (c) => MOJIBAKE[c]);

  /** Ollama /api/chat yanıtındaki metin (Türkçe karakter düzeltmesiyle). */
  const modelText = (res) => fixTurkish(((res && res.message) || {}).content).trim();

  const truncate = (s, n = OLLAMA.maxInputChars) => (s.length > n ? `${s.slice(0, n)}\n[... metin kısaltıldı ...]` : s);

  /** Modelin JSON yanıtını ayrıştırır; ```json bloklarını da tolere eder. */
  function parseModelJson(raw) {
    const text = fixTurkish(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
    try {
      return JSON.parse(text);
    } catch {
      const s = text.indexOf('{');
      const e = text.lastIndexOf('}');
      if (s >= 0 && e > s) {
        try {
          return JSON.parse(text.slice(s, e + 1));
        } catch {
          /* aşağıda null */
        }
      }
      return null;
    }
  }
}

/** Hata dalı: veritabanı hatası -> 500 */
export function dbError() {
  const err = $input.first().json.error;
  console.log('[db-error]', typeof err === 'string' ? err : JSON.stringify(err));
  return [{ json: { status: 500, body: { error: 'Veritabanı işlemi başarısız oldu. Lütfen daha sonra tekrar deneyin.' } } }];
}

/** Hata dalı: Ollama'ya ulaşılamadı / zaman aşımı -> 502 */
export function llmError() {
  const err = $input.first().json.error;
  console.log('[llm-error]', typeof err === 'string' ? err : JSON.stringify(err));
  return [{ json: { status: 502, body: { error: 'Yapay zekâ servisine ulaşılamadı veya yanıt zaman aşımına uğradı. Ollama çalışıyor mu?' } } }];
}
