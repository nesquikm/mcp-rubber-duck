import { App } from '@modelcontextprotocol/ext-apps';

interface DebateData {
  topic: string;
  format: 'oxford' | 'socratic' | 'adversarial';
  totalRounds: number;
  participants: { provider: string; nickname: string; position: string }[];
  rounds: { round: number; provider: string; nickname: string; position: string; content: string }[][];
  synthesis: string;
  synthesizer: string;
}

const formatMeta: Record<string, { emoji: string; label: string; style: string }> = {
  oxford: { emoji: '\uD83C\uDF93', label: 'Oxford', style: 'oxford' },
  socratic: { emoji: '\uD83C\uDFDB\uFE0F', label: 'Socratic', style: 'socratic' },
  adversarial: { emoji: '\u2694\uFE0F', label: 'Adversarial', style: 'adversarial' },
};

const positionColors: Record<string, string> = {
  pro: '#4caf50',
  con: '#f44336',
  neutral: '#9e9e9e',
};

const app = new App({ name: 'DuckDebate', version: '1.0.0' }, {});

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
    const data: DebateData = JSON.parse(
      (content[1] as { type: string; text: string }).text
    );
    render(data);
  } catch {
    container.innerHTML = `<div class="error-banner">Failed to parse debate data</div>`;
  }
};

function render(data: DebateData) {
  const container = document.getElementById('app')!;
  const fmt = formatMeta[data.format] || formatMeta.oxford;

  let html = `<div class="debate ${fmt.style}">`;

  // Header
  html += `<div class="header">`;
  html += `<div class="format-badge">${fmt.emoji} ${fmt.label} Debate</div>`;
  html += `<h2 class="topic">${esc(data.topic)}</h2>`;
  html += `<div class="meta">${data.totalRounds} rounds &middot; ${data.participants.length} participants</div>`;
  html += `</div>`;

  // Participants
  html += `<div class="participants">`;
  for (const p of data.participants) {
    const color = positionColors[p.position] || '#9e9e9e';
    html += `<span class="participant" style="border-color:${color}">`;
    html += `<span class="pos-dot" style="background:${color}"></span>`;
    html += `${esc(p.nickname)} <small>(${p.position})</small>`;
    html += `</span>`;
  }
  html += `</div>`;

  // Rounds
  html += `<div class="rounds">`;
  for (let i = 0; i < data.rounds.length; i++) {
    const round = data.rounds[i];
    html += `<details class="round">`;
    html += `<summary class="round-header">Round ${i + 1}</summary>`;
    html += `<div class="round-body">`;
    for (const arg of round) {
      const color = positionColors[arg.position] || '#9e9e9e';
      html += `<div class="argument" style="border-left-color:${color}">`;
      html += `<div class="arg-header">`;
      html += `<span class="arg-name">${esc(arg.nickname)}</span>`;
      html += `<span class="arg-pos" style="color:${color}">${arg.position.toUpperCase()}</span>`;
      html += `</div>`;
      html += `<div class="arg-content">${esc(arg.content)}</div>`;
      html += `</div>`;
    }
    html += `</div></details>`;
  }
  html += `</div>`;

  // Synthesis
  html += `<div class="synthesis">`;
  html += `<h3>Synthesis <small>by ${esc(data.synthesizer)}</small></h3>`;
  html += `<div class="synthesis-content">${esc(data.synthesis)}</div>`;
  html += `</div>`;

  html += `</div>`;
  container.innerHTML = html;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

app.connect().catch(console.error);
