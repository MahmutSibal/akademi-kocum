import { workflow, node, trigger, expr, newCredential } from '@n8n/workflow-sdk';


const n0 = trigger({ type: "n8n-nodes-base.errorTrigger", version: 1, config: {
  "name": "Error Trigger", "position": [0,300],
  "parameters": {  }
}, output: [{}] });
const n1 = node({ type: "n8n-nodes-base.code", version: 2, config: {
  "name": "Hatayı kaydet", "position": [240,300],
  "parameters": { "jsCode": "// Beklenmeyen (yakalanmamış) hatalar buraya düşer; container loglarında görünür.\nconst e = $input.first().json;\nconst info = {\n  workflow: e.workflow && e.workflow.name,\n  node: e.execution && e.execution.lastNodeExecuted,\n  message: e.execution && e.execution.error && e.execution.error.message,\n  executionId: e.execution && e.execution.id,\n  at: new Date().toISOString(),\n};\nconsole.error('[akademi-kocum] beklenmeyen hata', JSON.stringify(info));\nreturn [{ json: info }];" }
}, output: [{}] });

export default workflow("akErrorHandler01", "00 - Hata Yakalayıcı (Error Trigger)")
  .add(n0)
  .add(n0.output(0).to(n1));
