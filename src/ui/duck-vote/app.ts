import { App } from '@modelcontextprotocol/ext-apps';

interface VoteData {
  question: string;
  options: string[];
  winner: string | null;
  isTie: boolean;
  tally: Record<string, number>;
  confidenceByOption: Record<string, number>;
  votes: {
    voter: string;
    nickname: string;
    choice: string;
    confidence: number;
    reasoning: string;
  }[];
  totalVoters: number;
  validVotes: number;
  consensusLevel: 'unanimous' | 'majority' | 'plurality' | 'split' | 'none';
}

const consensusConfig: Record<string, { color: string; label: string }> = {
  unanimous: { color: '#4caf50', label: 'Unanimous' },
  majority: { color: '#2196f3', label: 'Majority' },
  plurality: { color: '#ff9800', label: 'Plurality' },
  split: { color: '#ff5722', label: 'Split' },
  none: { color: '#9e9e9e', label: 'No Consensus' },
};

const app = new App({ name: 'DuckVote', version: '1.0.0' }, {});

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
    const data: VoteData = JSON.parse(
      (content[1] as { type: string; text: string }).text
    );
    render(data);
  } catch {
    container.innerHTML = `<div class="error-banner">Failed to parse vote data</div>`;
  }
};

function render(data: VoteData) {
  const container = document.getElementById('app')!;
  const cfg = consensusConfig[data.consensusLevel] || consensusConfig.none;
  const maxVotes = Math.max(...Object.values(data.tally), 1);

  let html = `<h2 class="question">${esc(data.question)}</h2>`;

  // Winner card
  if (data.winner) {
    html += `<div class="winner-card">`;
    html += `<span class="winner-label">Winner</span>`;
    html += `<span class="winner-name">${esc(data.winner)}</span>`;
    if (data.isTie) {
      html += `<span class="tie-note">Tie-breaker by confidence</span>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="winner-card no-winner"><span class="winner-label">No valid votes</span></div>`;
  }

  // Consensus badge
  html += `<div class="consensus-badge" style="background:${cfg.color}">${cfg.label}</div>`;

  // Bar chart
  html += `<div class="tally-section"><h3>Vote Tally</h3>`;
  const sortedOptions = [...data.options].sort(
    (a, b) => (data.tally[b] || 0) - (data.tally[a] || 0)
  );
  for (const opt of sortedOptions) {
    const votes = data.tally[opt] || 0;
    const conf = data.confidenceByOption[opt] || 0;
    const pct = (votes / maxVotes) * 100;
    const isWinner = opt === data.winner;
    html += `<div class="bar-row${isWinner ? ' winner-row' : ''}">`;
    html += `<div class="bar-label">${esc(opt)}</div>`;
    html += `<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>`;
    html += `<div class="bar-value">${votes} vote${votes !== 1 ? 's' : ''} (${conf}%)</div>`;
    html += `</div>`;
  }
  html += `</div>`;

  // Individual voters
  html += `<div class="voters-section"><h3>Individual Votes</h3><div class="voters-grid">`;
  for (const v of data.votes) {
    const hasChoice = !!v.choice;
    html += `<div class="voter-card${!hasChoice ? ' invalid-vote' : ''}">`;
    html += `<div class="voter-name">${esc(v.nickname)}</div>`;
    if (hasChoice) {
      html += `<div class="voter-choice">${esc(v.choice)}</div>`;
      html += `<div class="confidence-bar-wrap"><div class="confidence-bar" style="width:${v.confidence}%"></div></div>`;
      html += `<div class="confidence-label">${v.confidence}% confidence</div>`;
      if (v.reasoning) {
        html += `<details class="reasoning"><summary>Reasoning</summary><p>${esc(v.reasoning)}</p></details>`;
      }
    } else {
      html += `<div class="voter-choice invalid">Invalid vote</div>`;
    }
    html += `</div>`;
  }
  html += `</div></div>`;

  // Footer
  html += `<div class="footer">${data.validVotes}/${data.totalVoters} valid votes</div>`;

  container.innerHTML = html;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

app.connect().catch(console.error);
