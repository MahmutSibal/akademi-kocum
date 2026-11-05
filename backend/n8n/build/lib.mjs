// n8n workflow JSON'larını okunabilir kaynaktan üretmek için yardımcılar.
// Kod node'ları gerçek JS fonksiyonları olarak yazılır, gövdesi node'a kopyalanır.
import { randomUUID, createHash } from 'node:crypto';

export const SQL_CREDENTIAL = { microsoftSql: { id: 'akMssqlCred00001', name: 'StudyAssistant SQL' } };
export const ERROR_WORKFLOW_ID = 'akErrorHandler01';

// Aynı girdiden hep aynı id üretilsin ki yeniden import'ta webhook'lar değişmesin.
const stableId = (...parts) => {
  const h = createHash('sha1').update(parts.join('|')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

/** Fonksiyonun gövdesini girintisi düzeltilmiş metin olarak döndürür. */
export function body(fn) {
  const src = fn.toString();
  const inner = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'));
  const lines = inner.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

export class Workflow {
  constructor(id, name, { saveData = true } = {}) {
    this.id = id;
    this.name = name;
    this.nodes = [];
    this.connections = {};
    this.saveData = saveData;
  }

  add(node) {
    node.id = stableId(this.id, node.name);
    this.nodes.push(node);
    return node.name;
  }

  /** from düğümünün `output` numaralı çıkışını to düğümüne bağlar. */
  link(from, to, output = 0) {
    const c = (this.connections[from] ??= { main: [] });
    while (c.main.length <= output) c.main.push([]);
    c.main[output].push({ node: to, type: 'main', index: 0 });
    return this;
  }

  chain(...names) {
    for (let i = 0; i < names.length - 1; i++) this.link(names[i], names[i + 1]);
    return this;
  }

  toJSON() {
    const settings = { executionOrder: 'v1', errorWorkflow: ERROR_WORKFLOW_ID, timezone: 'Europe/Istanbul' };
    if (this.id === ERROR_WORKFLOW_ID) delete settings.errorWorkflow;
    if (!this.saveData) {
      // Şifre içeren istekler yürütme geçmişine yazılmasın
      Object.assign(settings, { saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none', saveManualExecutions: false });
    }
    return {
      id: this.id,
      name: this.name,
      active: false,
      nodes: this.nodes,
      connections: this.connections,
      settings,
      pinData: {},
      meta: { templateCredsSetupCompleted: true },
      tags: [],
    };
  }
}

// ------------------------------------------------------------------ düğümler

export const webhook = (name, path, position) => ({
  name,
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position,
  webhookId: stableId('webhook', path),
  parameters: { httpMethod: 'POST', path, responseMode: 'responseNode', options: { allowedOrigins: '*' } },
});

export const errorTrigger = (name, position) => ({
  name,
  type: 'n8n-nodes-base.errorTrigger',
  typeVersion: 1,
  position,
  parameters: {},
});

/** Kütüphane gövdesini üst düzey bildirimlere böler: [{ names, text }]. */
export function splitDeclarations(src) {
  const blocks = [];
  let current = [];
  for (const line of src.split('\n')) {
    const startsDecl = /^(const|let|function|\/\*\*|\/\/)/.test(line);
    const prevIsComment = current.length && /^(\/\*\*|\s\*|\/\/)/.test(current[current.length - 1]);
    if (startsDecl && current.length && !prevIsComment) {
      blocks.push(current.join('\n'));
      current = [];
    }
    if (line.trim() || current.length) current.push(line);
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks.map((text) => ({
    text: text.trimEnd(),
    names: [...text.matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
  }));
}

/**
 * Code düğümü. `libs` içindeki ortak bildirimlerden yalnızca gövdenin
 * (dolaylı olarak) kullandıkları eklenir.
 */
export const code = (name, fn, position, { libs = [], notes } = {}) => {
  const main = body(fn);
  const blocks = libs.flatMap((l) => splitDeclarations(body(l)));
  const used = new Set();
  let haystack = main;
  for (let changed = true; changed; ) {
    changed = false;
    for (const b of blocks) {
      if (used.has(b) || !b.names.some((n) => new RegExp(`\\b${n.replace('$', '\\$')}\\b`).test(haystack))) continue;
      used.add(b);
      haystack += `\n${b.text}`;
      changed = true;
    }
  }
  const prelude = blocks.filter((b) => used.has(b)).map((b) => b.text);
  return {
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
    parameters: { jsCode: [...prelude, main].join('\n\n') },
    ...(notes ? { notes, notesInFlow: true } : {}),
  };
};

/** Boolean ifade doğruysa 0., değilse 1. çıkış. */
export const ifTrue = (name, expression, position) => ({
  name,
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position,
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [
        {
          id: stableId('if', name),
          leftValue: `={{ ${expression} }}`,
          rightValue: '',
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        },
      ],
      combinator: 'and',
    },
    looseTypeValidation: true,
    options: {},
  },
});

/**
 * Microsoft SQL düğümü. Kullanıcı verisi asla sorgu metnine eklenmez:
 * önceki düğüm `payload` alanına base64(UTF-16LE JSON) koyar, sorgu bunu $1
 * parametresiyle alır ve dbo.fn_DecodePayload + OPENJSON ile okur.
 * Hata olursa 1. çıkışa (hata dalı) gider.
 */
export const sql = (name, query, position, notes) => ({
  name,
  type: 'n8n-nodes-base.microsoftSql',
  typeVersion: 1.2,
  position,
  credentials: SQL_CREDENTIAL,
  onError: 'continueErrorOutput',
  alwaysOutputData: true,
  parameters: {
    operation: 'executeQuery',
    query: query.trim(),
    options: { queryReplacement: '={{ $json.payload }}' },
  },
  ...(notes ? { notes, notesInFlow: true } : {}),
});

/** Ollama /api/chat çağrısı. Girdi: $json.ollama = { url, body, timeout }. Hata olursa 1. çıkış. */
export const ollama = (name, position, notes) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position,
  onError: 'continueErrorOutput',
  parameters: {
    method: 'POST',
    url: '={{ $json.ollama.url }}',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.ollama.body) }}',
    options: { timeout: '={{ $json.ollama.timeout }}' },
  },
  ...(notes ? { notes, notesInFlow: true } : {}),
});

/** Girdi: $json.status (HTTP kodu) ve $json.body (yanıt gövdesi). */
export const respond = (name, position) => ({
  name,
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position,
  parameters: {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify($json.body) }}',
    options: { responseCode: '={{ $json.status || 200 }}' },
  },
});

export const extractPdf = (name, position) => ({
  name,
  type: 'n8n-nodes-base.extractFromFile',
  typeVersion: 1,
  position,
  onError: 'continueErrorOutput',
  parameters: { operation: 'pdf', binaryPropertyName: 'data', options: {} },
});

/** Binary dosyayı base64 metne çevirir (görsel modele göndermek için). */
export const fileToBase64 = (name, position, destinationKey = 'imageBase64') => ({
  name,
  type: 'n8n-nodes-base.extractFromFile',
  typeVersion: 1,
  position,
  onError: 'continueErrorOutput',
  parameters: { operation: 'binaryToPropery', binaryPropertyName: 'data', destinationKey, options: {} },
});

/** Haftalık zamanlayıcı (gün: 0=Pazar, 1=Pazartesi ...). */
export const weeklySchedule = (name, position, { day = 1, hour = 9 } = {}) => ({
  name,
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position,
  parameters: { rule: { interval: [{ field: 'weeks', weeksInterval: 1, triggerAtDay: [day], triggerAtHour: hour, triggerAtMinute: 0 }] } },
});

export const SMTP_CREDENTIAL = { smtp: { id: 'akBrevoSmtp00001', name: 'Brevo SMTP' } };

/** SMTP ile HTML e-posta. Girdi: $json.to, $json.subject, $json.html. Hata olursa 1. çıkış. */
export const emailSend = (name, position) => ({
  name,
  type: 'n8n-nodes-base.emailSend',
  typeVersion: 2.1,
  position,
  credentials: SMTP_CREDENTIAL,
  onError: 'continueErrorOutput',
  parameters: {
    fromEmail: "={{ ($env.BREVO_SMTP_FROM_NAME || 'Akademi Koçum') + ' <' + $env.BREVO_SMTP_FROM_EMAIL + '>' }}",
    toEmail: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailFormat: 'html',
    html: '={{ $json.html }}',
    options: { appendAttribution: false },
  },
});

export { randomUUID };
