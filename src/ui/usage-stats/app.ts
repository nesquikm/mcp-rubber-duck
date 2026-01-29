import { App } from '@modelcontextprotocol/ext-apps';

interface UsageData {
  period: string;
  startDate: string;
  endDate: string;
  totals: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    cacheHits: number;
    errors: number;
    estimatedCostUSD?: number;
  };
  usage: Record<string, Record<string, {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    cacheHits: number;
    errors: number;
  }>>;
  costByProvider?: Record<string, number>;
}

const periodLabels: Record<string, string> = {
  today: 'Today',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  all: 'All Time',
};

const app = new App({ name: 'UsageStats', version: '1.0.0' }, {});

app.ontoolresult = (params) => {
  const container = document.getElementById('app')!;
  if (params.isError) {
    container.innerHTML = `<div class="error-banner">Tool execution failed</div>`;
    return;
  }

  const content = params.content;
  if (!content || !Array.isArray(content) || content.length < 2) {
    container.innerHTML = `<div class="error-banner">No structured data received</div>`;
    return;
  }

  try {
    const data: UsageData = JSON.parse(
      (content[1] as { type: string; text: string }).text
    );
    render(data);
  } catch {
    container.innerHTML = `<div class="error-banner">Failed to parse usage data</div>`;
  }
};

function render(data: UsageData) {
  const container = document.getElementById('app')!;
  const periodLabel = periodLabels[data.period] || data.period;
  const totalTokens = data.totals.promptTokens + data.totals.completionTokens;

  let html = `<div class="header">`;
  html += `<h2>Usage Statistics</h2>`;
  html += `<div class="period-badge">${esc(periodLabel)}</div>`;
  html += `<div class="date-range">${esc(data.startDate)} to ${esc(data.endDate)}</div>`;
  html += `</div>`;

  // Summary cards
  html += `<div class="summary-cards">`;
  html += summaryCard('Requests', fmt(data.totals.requests), 'req');
  html += summaryCard('Total Tokens', fmt(totalTokens), 'tok');
  html += summaryCard('Cache Hits', fmt(data.totals.cacheHits), 'cache');
  html += summaryCard('Errors', fmt(data.totals.errors), data.totals.errors > 0 ? 'err' : 'ok');
  if (data.totals.estimatedCostUSD !== undefined) {
    html += summaryCard('Est. Cost', '$' + formatCost(data.totals.estimatedCostUSD), 'cost');
  }
  html += `</div>`;

  // Provider breakdown
  const providers = Object.keys(data.usage);
  if (providers.length > 0) {
    // Token distribution bar
    const maxTokens = Math.max(
      ...providers.map((p) => {
        let t = 0;
        for (const m of Object.values(data.usage[p])) t += m.promptTokens + m.completionTokens;
        return t;
      }),
      1
    );

    html += `<div class="section"><h3>By Provider</h3>`;
    for (const provider of providers) {
      const models = data.usage[provider];
      let providerTokens = 0;
      let providerRequests = 0;
      for (const m of Object.values(models)) {
        providerTokens += m.promptTokens + m.completionTokens;
        providerRequests += m.requests;
      }
      const pct = (providerTokens / maxTokens) * 100;
      const cost = data.costByProvider?.[provider];

      html += `<details class="provider-row" open>`;
      html += `<summary>`;
      html += `<span class="provider-name">${esc(provider)}</span>`;
      html += `<span class="provider-stats">${fmt(providerRequests)} req &middot; ${fmt(providerTokens)} tokens`;
      if (cost !== undefined) html += ` &middot; $${formatCost(cost)}`;
      html += `</span></summary>`;
      html += `<div class="token-bar"><div class="token-fill" style="width:${pct}%"></div></div>`;

      // Model detail table
      html += `<table class="model-table"><thead><tr>`;
      html += `<th>Model</th><th>Requests</th><th>Prompt</th><th>Completion</th><th>Cache</th><th>Errors</th>`;
      html += `</tr></thead><tbody>`;
      for (const [model, stats] of Object.entries(models)) {
        html += `<tr>`;
        html += `<td>${esc(model)}</td>`;
        html += `<td>${fmt(stats.requests)}</td>`;
        html += `<td>${fmt(stats.promptTokens)}</td>`;
        html += `<td>${fmt(stats.completionTokens)}</td>`;
        html += `<td>${fmt(stats.cacheHits)}</td>`;
        html += `<td>${stats.errors > 0 ? `<span class="err-text">${fmt(stats.errors)}</span>` : '0'}</td>`;
        html += `</tr>`;
      }
      html += `</tbody></table></details>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="empty">No usage data for this period.</div>`;
  }

  container.innerHTML = html;
}

function summaryCard(label: string, value: string, kind: string) {
  return `<div class="card card-${kind}"><div class="card-value">${value}</div><div class="card-label">${label}</div></div>`;
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) return cost.toFixed(6);
  if (cost < 1) return cost.toFixed(4);
  return cost.toFixed(2);
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

app.connect().catch(console.error);
