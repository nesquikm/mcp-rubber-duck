import '../shared/base.css';
import { App } from '@modelcontextprotocol/ext-apps';

interface CompareResponse {
  provider: string;
  nickname: string;
  model: string;
  content: string;
  latency: number;
  tokens: { prompt: number; completion: number; total: number } | null;
  cached: boolean;
  error?: string;
}

const app = new App({ name: 'CompareDucks', version: '1.0.0' }, {});

app.ontoolresult = (params) => {
  const container = document.getElementById('app')!;
  if (params.isError) {
    container.innerHTML = `<div class="error-banner">Tool execution failed</div>`;
    return;
  }

  // Parse JSON from second content item
  const content = params.content;
  if (!content || !Array.isArray(content) || content.length < 2) {
    container.innerHTML = `<div class="error-banner">No structured data received</div>`;
    return;
  }

  try {
    const data: CompareResponse[] = JSON.parse(
      (content[1] as { type: string; text: string }).text
    );
    render(data);
  } catch {
    container.innerHTML = `<div class="error-banner">Failed to parse response data</div>`;
  }
};

function render(responses: CompareResponse[]) {
  const container = document.getElementById('app')!;
  const successCount = responses.filter((r) => !r.error).length;

  let html = `<div class="summary-bar">${successCount}/${responses.length} ducks responded successfully</div>`;
  html += `<div class="grid">`;

  for (const r of responses) {
    const isError = !!r.error;
    const latencyClass =
      r.latency < 2000 ? 'fast' : r.latency < 5000 ? 'medium' : 'slow';

    html += `<div class="card${isError ? ' card-error' : ''}">`;
    html += `<div class="card-header">`;
    html += `<span class="nickname">${esc(r.nickname)}</span>`;
    html += `<span class="provider">${esc(r.provider)}</span>`;
    html += `</div>`;

    if (!isError) {
      html += `<div class="badges">`;
      html += `<span class="badge model">${esc(r.model)}</span>`;
      if (r.tokens) {
        html += `<span class="badge tokens">${r.tokens.total} tokens</span>`;
      }
      if (r.cached) {
        html += `<span class="badge cached">Cached</span>`;
      }
      html += `</div>`;
      html += `<div class="latency-bar ${latencyClass}" style="width:${Math.min(100, (r.latency / 10000) * 100)}%"></div>`;
      html += `<div class="latency-label">${r.latency}ms</div>`;
      html += `<div class="content"><pre>${esc(r.content)}</pre></div>`;
    } else {
      html += `<div class="content error-text"><pre>${esc(r.content)}</pre></div>`;
    }

    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

app.connect().catch(console.error);
