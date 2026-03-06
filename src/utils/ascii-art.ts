export const duckArt = {
  normal: `
     __
   <(o )___
    ( ._> /
     \`---'`,

  happy: `
     __
   <(^v^)___
    ( ._> /
     \`---'`,

  thinking: `
     __  ?
   <(o )___
    ( ._> /
     \`---'`,

  error: `
     __ !
   <(x_x)___
    ( ._> /
     \`---'`,

  sleeping: `
     __ zzz
   <(- -)___
    ( ._> /
     \`---'`,

  panel: `
  🦆 Duck Council in Session 🦆
  =============================`,

  welcome: `
╔══════════════════════════════════════╗
║   Welcome to MCP Rubber Duck! 🦆    ║
║   Your AI debugging companions       ║
╚══════════════════════════════════════╝`,
};

export const duckMessages = {
  startup: [
    'Quack! Rubber ducks reporting for duty!',
    'Ducks assembled and ready to debug!',
    'The duck pond is open for business!',
  ],

  error: [
    'Quack! The duck has flown away!',
    'Oh no! This duck got confused!',
    'The duck needs a moment to think...',
  ],

  success: [
    'Quack quack! Problem solved!',
    'The duck has spoken wisely!',
    'Another successful rubber duck session!',
  ],

  thinking: [
    'The duck is pondering...',
    'Hmm, let the duck think about this...',
    'Duck brain processing...',
  ],

  failover: [
    'Primary duck is resting, calling backup duck!',
    'Switching to a fresh duck!',
    'Backup duck swimming in!',
  ],
};

export function getRandomDuckMessage(type: keyof typeof duckMessages): string {
  const messages = duckMessages[type];
  return messages[Math.floor(Math.random() * messages.length)];
}

export function formatDuckResponse(provider: string, message: string, model?: string): string {
  if (model) {
    return `🦆 [${provider} | ${model}]: ${message}`;
  }
  return `🦆 [${provider}]: ${message}`;
}
