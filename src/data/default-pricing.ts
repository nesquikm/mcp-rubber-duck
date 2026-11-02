import { PricingConfig } from '../config/types.js';

/**
 * Default pricing data for common LLM providers.
 * Prices are in USD per million tokens.
 * Last updated: 2026-11-02
 *
 * To update pricing:
 * 1. Research current pricing from provider websites
 * 2. Update the values below
 * 3. Update the lastUpdated field
 * 4. Release a new version
 *
 * Users can override these defaults in their config.json file.
 */
export const DEFAULT_PRICING_VERSION = 2;
export const DEFAULT_PRICING_LAST_UPDATED = '2026-11-02';

export const DEFAULT_PRICING: PricingConfig = {
  openai: {
    // GPT-6 models
    'gpt-6-astra': { inputPricePerMillion: 10, outputPricePerMillion: 50 },
    'gpt-6-sol': { inputPricePerMillion: 2, outputPricePerMillion: 10 },
    'gpt-6-luna': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.5 },
    'gpt-6.1-sol': { inputPricePerMillion: 2, outputPricePerMillion: 10 },
    'gpt-6.1-terra': { inputPricePerMillion: 1, outputPricePerMillion: 5 },

    // GPT-5.6 models (released July 2026)
    // NOTE: gpt-5.6-sol $4/$20 is promotional pricing "at least through November 21, 2026"
    // (was $5/$30).
    'gpt-5.6-sol': { inputPricePerMillion: 4, outputPricePerMillion: 20 },
    'gpt-5.6-terra': { inputPricePerMillion: 2, outputPricePerMillion: 12 },
    'gpt-5.6-luna': { inputPricePerMillion: 0.2, outputPricePerMillion: 1.2 },

    // GPT-5.5 models (premium tier, released April 2026)
    'gpt-5.5': { inputPricePerMillion: 5, outputPricePerMillion: 30 },
    'gpt-5.5-pro': { inputPricePerMillion: 30, outputPricePerMillion: 180 },

    // Cyber, legal and life-sciences models
    'gpt-5.6-cyber': { inputPricePerMillion: 12.5, outputPricePerMillion: 75 },
    'gpt-5.5-cyber': { inputPricePerMillion: 12.5, outputPricePerMillion: 75 },
    // NOTE: gpt-6-astra-law pricing is promotional "at least through December 31, 2026".
    'gpt-6-astra-law': { inputPricePerMillion: 10, outputPricePerMillion: 50 },
    'gpt-6-rosalind': { inputPricePerMillion: 15, outputPricePerMillion: 75 },
    'gpt-rosalind-research': { inputPricePerMillion: 5, outputPricePerMillion: 25 },
    'gpt-rosalind-discovery': { inputPricePerMillion: 5, outputPricePerMillion: 25 },

    // GPT-5.4 models (released March 2026; gpt-5.4-nano shuts down 2027-04-01)
    'gpt-5.4': { inputPricePerMillion: 2.5, outputPricePerMillion: 15 },
    'gpt-5.4-mini': { inputPricePerMillion: 0.75, outputPricePerMillion: 4.5 },
    'gpt-5.4-nano': { inputPricePerMillion: 0.2, outputPricePerMillion: 1.25 },
    'gpt-5.4-pro': { inputPricePerMillion: 30, outputPricePerMillion: 180 },

    // GPT-5.3 specialized models (gpt-5.3-codex shuts down 2027-04-01)
    'gpt-5.3-codex': { inputPricePerMillion: 1.75, outputPricePerMillion: 14 },

    // GPT-5.2 models
    'gpt-5.2': { inputPricePerMillion: 1.75, outputPricePerMillion: 14 },
    'gpt-5.2-pro': { inputPricePerMillion: 21, outputPricePerMillion: 168 },

    // GPT-5.1 models (shuts down 2027-04-01)
    'gpt-5.1': { inputPricePerMillion: 1.25, outputPricePerMillion: 10 },

    // GPT-5 models (gpt-5, -mini, -nano, -pro shut down 2026-12-11)
    'gpt-5': { inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
    'gpt-5-pro': { inputPricePerMillion: 15, outputPricePerMillion: 120 },
    'gpt-5-mini': { inputPricePerMillion: 0.25, outputPricePerMillion: 2 },
    'gpt-5-nano': { inputPricePerMillion: 0.05, outputPricePerMillion: 0.4 },
    'gpt-5-search-api': { inputPricePerMillion: 1.25, outputPricePerMillion: 10 },

    // Floating aliases
    'chat-latest': { inputPricePerMillion: 5, outputPricePerMillion: 30 },

    // GPT-4.1 models (dated snapshots shut down 2027-01-14)
    'gpt-4.1': { inputPricePerMillion: 2, outputPricePerMillion: 8 },
    'gpt-4.1-mini': { inputPricePerMillion: 0.4, outputPricePerMillion: 1.6 },

    // GPT-4o models (dated snapshots shut down 2027-01-14)
    'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
    'gpt-4o-2024-11-20': { inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
    'gpt-4o-2024-08-06': { inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
    'gpt-4o-mini': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'gpt-4o-mini-2024-07-18': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },

    // o3 reasoning models (shut down 2026-12-11)
    o3: { inputPricePerMillion: 2, outputPricePerMillion: 8 },
    'o3-pro': { inputPricePerMillion: 20, outputPricePerMillion: 80 },
  },

  anthropic: {
    // Claude Fable / Mythos (most capable tier)
    'claude-fable-5-1': { inputPricePerMillion: 10, outputPricePerMillion: 50 },
    'claude-mythos-5-1': { inputPricePerMillion: 10, outputPricePerMillion: 50 },
    'claude-fable-5': { inputPricePerMillion: 10, outputPricePerMillion: 50 },
    'claude-mythos-5': { inputPricePerMillion: 10, outputPricePerMillion: 50 },

    // Claude 5.5 models
    'claude-opus-5-5': { inputPricePerMillion: 4, outputPricePerMillion: 20 },
    'claude-sonnet-5-5': { inputPricePerMillion: 2, outputPricePerMillion: 10 },
    // NOTE: Haiku 5.5 is priced by prompt length. These are the rates for prompts up to
    // 100,000 tokens; prompts over 100,000 tokens bill at $0.50/$2.50.
    'claude-haiku-5-5': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.5 },

    // Claude Opus 5
    'claude-opus-5': { inputPricePerMillion: 5, outputPricePerMillion: 25 },

    // Claude Sonnet 5
    // NOTE: $2/$10 launched as an introductory rate through 2026-08-31, but Anthropic has
    // since made it the standard price. The scheduled 2026-09-01 increase to $3/$15 will
    // not happen - no follow-up needed.
    'claude-sonnet-5': { inputPricePerMillion: 2, outputPricePerMillion: 10 },

    // Claude 4.8 models
    'claude-opus-4-8': { inputPricePerMillion: 5, outputPricePerMillion: 25 },

    // Claude 4.7 models
    'claude-opus-4-7': { inputPricePerMillion: 5, outputPricePerMillion: 25 },

    // Claude 4.6 models
    'claude-opus-4-6': { inputPricePerMillion: 5, outputPricePerMillion: 25 },
    'claude-sonnet-4-6': { inputPricePerMillion: 3, outputPricePerMillion: 15 },

    // Claude 4.5 models (claude-sonnet-4-5 is deprecated, retiring 2026-11-30)
    'claude-opus-4-5-20251101': { inputPricePerMillion: 5, outputPricePerMillion: 25 },
    'claude-opus-4-5': { inputPricePerMillion: 5, outputPricePerMillion: 25 },
    'claude-sonnet-4-5-20250929': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    'claude-sonnet-4-5': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    'claude-haiku-4-5-20251001': { inputPricePerMillion: 1, outputPricePerMillion: 5 },
    'claude-haiku-4-5': { inputPricePerMillion: 1, outputPricePerMillion: 5 },
  },

  google: {
    // Gemini 4
    // NOTE: $2/$10 is introductory pricing through 2026-11-30, then $4/$20 from 2026-12-01.
    'gemini-4-argon': { inputPricePerMillion: 2, outputPricePerMillion: 10 },

    // Gemini 3.8
    // NOTE: $0.75/$3.75 is promotional pricing through 2026-12-31, then $1.50/$7.50.
    'gemini-3.8-flash': { inputPricePerMillion: 0.75, outputPricePerMillion: 3.75 },
    // Live API (text rates; audio is $3 in / $12 out)
    'gemini-3.8-live': { inputPricePerMillion: 0.75, outputPricePerMillion: 4.5 },
    'gemini-3.8-live-extended-thinking': { inputPricePerMillion: 0.75, outputPricePerMillion: 4.5 },
    // TTS (text input / audio output; promotional through 2026-12-31, then doubles)
    'gemini-3.8-flash-tts': { inputPricePerMillion: 0.5, outputPricePerMillion: 9 },
    'gemini-3.8-flash-lite-tts': { inputPricePerMillion: 0.5, outputPricePerMillion: 6 },

    // Gemini 3.7 (endpoint auto-routes to gemini-3.8-flash; same promotional pricing)
    'gemini-3.7-flash': { inputPricePerMillion: 0.75, outputPricePerMillion: 3.75 },

    // Gemini 3.6 (same promotional pricing window as 3.8 Flash)
    'gemini-3.6-flash': { inputPricePerMillion: 0.75, outputPricePerMillion: 3.75 },

    // Gemini 3.5
    // NOTE: gemini-3.5-flash is no longer on the pricing page; its endpoint auto-routes to
    // gemini-3.6-flash. Billing for routed requests is undocumented, so the last published
    // rate is kept.
    'gemini-3.5-flash': { inputPricePerMillion: 1.5, outputPricePerMillion: 9 },
    'gemini-3.5-flash-lite': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },
    // Audio-priced models (audio input rate / text output rate)
    'gemini-3.5-live-translate-preview': { inputPricePerMillion: 3.5, outputPricePerMillion: 21 },
    'gemini-3.5-transcribe-live': { inputPricePerMillion: 3.5, outputPricePerMillion: 21 },
    'gemini-3.5-transcribe': { inputPricePerMillion: 2, outputPricePerMillion: 12 },

    // Gemini Omni
    'gemini-omni-1.1-flash': { inputPricePerMillion: 1.5, outputPricePerMillion: 9 },

    // Gemini 3.1
    'gemini-3.1-pro-preview': { inputPricePerMillion: 2, outputPricePerMillion: 12 },
    'gemini-3.1-pro-preview-customtools': { inputPricePerMillion: 2, outputPricePerMillion: 12 },
    'gemini-3.1-flash-lite': { inputPricePerMillion: 0.25, outputPricePerMillion: 1.5 },
    // Shuts down 2026-11-17
    'gemini-3.1-flash-live-preview': { inputPricePerMillion: 0.75, outputPricePerMillion: 4.5 },
    'gemini-3.1-flash-tts-preview': { inputPricePerMillion: 1, outputPricePerMillion: 20 },

    // Image models (output price is the image-output rate)
    'gemini-nano-banana-2.1': { inputPricePerMillion: 1.5, outputPricePerMillion: 30 },
    'gemini-3.1-flash-image': { inputPricePerMillion: 0.5, outputPricePerMillion: 60 },
    'gemini-3.1-flash-lite-image': { inputPricePerMillion: 0.25, outputPricePerMillion: 30 },
    'gemini-3-pro-image': { inputPricePerMillion: 2, outputPricePerMillion: 120 },
    // Deprecated, shuts down 2027-03-15
    'gemini-2.5-flash-image': { inputPricePerMillion: 0.3, outputPricePerMillion: 30 },

    // Gemini 3.0
    'gemini-3-flash-preview': { inputPricePerMillion: 0.5, outputPricePerMillion: 3 },

    // Gemini 2.5
    'gemini-2.5-pro': { inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
    'gemini-2.5-pro-latest': { inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
    'gemini-2.5-flash': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },
    'gemini-2.5-flash-latest': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },
    'gemini-2.5-flash-lite': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },
    // The three models below shut down 2026-11-17
    'gemini-2.5-flash-native-audio-preview-12-2025': {
      inputPricePerMillion: 0.5,
      outputPricePerMillion: 2,
    },
    'gemini-2.5-flash-preview-tts': { inputPricePerMillion: 0.5, outputPricePerMillion: 10 },
    'gemini-2.5-pro-preview-tts': { inputPricePerMillion: 1, outputPricePerMillion: 20 },

    // Embeddings
    'gemini-embedding-001': { inputPricePerMillion: 0.15, outputPricePerMillion: 0 },
    'gemini-embedding-2': { inputPricePerMillion: 0.2, outputPricePerMillion: 0 },

    // Robotics (preview)
    // NOTE: $1/$5 is introductory pricing through 2026-12-31, then $2/$10.
    'gemini-robotics-er-2-preview': { inputPricePerMillion: 1, outputPricePerMillion: 5 },
    'gemini-robotics-er-2-streaming-preview': {
      inputPricePerMillion: 1,
      outputPricePerMillion: 5,
    },

    // Gemma (free tier only - no paid-tier price published)
    'gemma-4': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'gemma-3': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'gemma-3n': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  },

  groq: {
    // Current API model IDs (as published on the Groq console models page)
    'openai/gpt-oss-120b': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'openai/gpt-oss-20b': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
    'openai/gpt-oss-safeguard-20b': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
    'qwen/qwen3.8-27b': { inputPricePerMillion: 0.8, outputPricePerMillion: 4 },
    'meta-llama/llama-prompt-guard-2-22m': {
      inputPricePerMillion: 0.03,
      outputPricePerMillion: 0.03,
    },
    'meta-llama/llama-prompt-guard-2-86m': {
      inputPricePerMillion: 0.04,
      outputPricePerMillion: 0.04,
    },

    // Legacy short names kept for compatibility (not current Groq API model IDs)
    'gpt-oss-120b-128k': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'gpt-oss-20b-128k': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
    'gpt-oss-safeguard-20b': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
  },

  deepseek: {
    // DeepSeek V4 / V4.1 (current models). Input price is the cache-miss rate.
    // NOTE: these are the OFF-PEAK rates, which apply for 133 of the 168 hours in a week.
    // Peak is exactly 2x and runs 01:00-04:00 and 06:00-10:00 UTC, Monday through Friday
    // only - the whole weekend (and Chinese public holidays) is off-peak. This table is
    // time-blind (PricingService multiplies tokens by a flat rate), so anyone whose traffic
    // lands mostly inside the peak window should double these in the `pricing.deepseek`
    // block of config.json.
    'deepseek-flash': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'deepseek-v4-pro': { inputPricePerMillion: 0.66, outputPricePerMillion: 1.98 },
    // Legacy names: retired, routed to DeepSeek-V4.1-Flash-1017 and billed at Flash price
    'deepseek-v4-flash': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'deepseek-v4-flash-vision-exp': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
  },

  mistral: {
    // Mistral Large 4 (26.10, public preview)
    'mistral-large-4': { inputPricePerMillion: 0.7, outputPricePerMillion: 2.1 },
    'mistral-large-4-0': { inputPricePerMillion: 0.7, outputPricePerMillion: 2.1 },

    // Mistral Large 3 (2512; deprecated, retiring 2027-04-30). mistral-large-latest still
    // points here per the model card.
    'mistral-large-latest': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    'mistral-large-2512': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },

    // Mistral Medium 3.5 (deprecated, retiring 2027-04-30). mistral-medium-3 is now an
    // alias of Medium 3.5.
    'mistral-medium-latest': { inputPricePerMillion: 1.5, outputPricePerMillion: 7.5 },
    'mistral-medium-3-5': { inputPricePerMillion: 1.5, outputPricePerMillion: 7.5 },
    'mistral-medium-3': { inputPricePerMillion: 1.5, outputPricePerMillion: 7.5 },
    'mistral-medium-3.5': { inputPricePerMillion: 1.5, outputPricePerMillion: 7.5 },

    // Mistral Small 4
    'mistral-small-latest': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'mistral-small-2603': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'mistral-small-4': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },

    // Third-party models hosted on La Plateforme
    'zai-glm-5-3': { inputPricePerMillion: 1.4, outputPricePerMillion: 4.4 },
    'zai-glm-5': { inputPricePerMillion: 1.4, outputPricePerMillion: 4.4 },
    'zai-glm-latest': { inputPricePerMillion: 1.4, outputPricePerMillion: 4.4 },
    'zai-glm-5-3-flash': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.5 },
    'deepseek-v4-1-flash-1017': { inputPricePerMillion: 0.3, outputPricePerMillion: 1.2 },

    // Codestral
    'codestral-latest': { inputPricePerMillion: 0.3, outputPricePerMillion: 0.9 },
    'codestral-2508': { inputPricePerMillion: 0.3, outputPricePerMillion: 0.9 },

    // Ministral
    'ministral-14b-latest': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.2 },
    'ministral-14b-2512': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.2 },
    'ministral-8b-latest': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.15 },
    'ministral-8b-2512': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.15 },
    'ministral-3b-latest': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.1 },
    'ministral-3b-2512': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.1 },

    // Voxtral (text-token rates; audio input is billed at $0.004/min, not per token)
    'voxtral-small-latest': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },
    'voxtral-small-2507': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },

    // Embeddings
    'codestral-embed': { inputPricePerMillion: 0.15, outputPricePerMillion: 0 },
    'codestral-embed-2505': { inputPricePerMillion: 0.15, outputPricePerMillion: 0 },
    'mistral-embed': { inputPricePerMillion: 0.1, outputPricePerMillion: 0 },
    'mistral-embed-2312': { inputPricePerMillion: 0.1, outputPricePerMillion: 0 },
  },

  together: {
    // Current serverless lineup
    'moonshotai/Kimi-K3': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    'zai-org/GLM-5.3': { inputPricePerMillion: 1.4, outputPricePerMillion: 4.4 },
    'zai-org/GLM-5.3-Flash': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.5 },
    'zai-org/GLM-5.2': { inputPricePerMillion: 1.4, outputPricePerMillion: 4.4 },
    'meta-models/Muse-Spark-Open-816B-A42B': {
      inputPricePerMillion: 1.25,
      outputPricePerMillion: 4.25,
    },
    'meta-models/Muse-Glimmer-30B': { inputPricePerMillion: 0.35, outputPricePerMillion: 1.5 },
    'together/Tev1-4B-experimental': { inputPricePerMillion: 0.042, outputPricePerMillion: 0 },
    'reflection/Beam-1.0-501B-A23B': { inputPricePerMillion: 0.4, outputPricePerMillion: 1.2 },
    'MiniMaxAI/MiniMax-M3.1-Flash': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'deepseek-ai/DeepSeek-V4.1-Flash': { inputPricePerMillion: 0.3, outputPricePerMillion: 1.2 },
    'deepseek-ai/DeepSeek-V4.1-Flash-1017': {
      inputPricePerMillion: 0.3,
      outputPricePerMillion: 1.2,
    },
    'deepseek-ai/DeepSeek-V4-Pro-0813': { inputPricePerMillion: 1.32, outputPricePerMillion: 3.96 },
    'Prism-ML/Ternary-Bonsai-27B': { inputPricePerMillion: 0, outputPricePerMillion: 0 }, // Free
    'nvidia/NVIDIA-Nemotron-3.5-Super-VL': {
      inputPricePerMillion: 0.15,
      outputPricePerMillion: 0.5,
    },
    'Qwen/Qwen3.8-Flash': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.47 },
    // NOTE: together.ai/pricing lists $1.50/$4.50; docs.together.ai/docs/serverless-models
    // lists $2.50/$7.50. The pricing page value is used here.
    'Qwen/Qwen3.7-Max': { inputPricePerMillion: 1.5, outputPricePerMillion: 4.5 },
    'Qwen/Qwen3.7-Plus': { inputPricePerMillion: 0.32, outputPricePerMillion: 1.28 },
    'Qwen/Qwen3.6-Plus': { inputPricePerMillion: 0.5, outputPricePerMillion: 3 },
    'Qwen/Qwen3.5-9B': { inputPricePerMillion: 0.17, outputPricePerMillion: 0.25 },
    'openai/gpt-oss-120b': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'Qwen/Qwen2.5-7B-Instruct-Turbo': { inputPricePerMillion: 0.3, outputPricePerMillion: 0.3 },
    'essentialai/rnj-1-instruct': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.15 },

    // Scheduled for removal: Qwen3.8-2.4T-A95B on 2026-11-04, MiniMax-M3 and Inkling on
    // 2026-11-06
    'Qwen/Qwen3.8-2.4T-A95B': { inputPricePerMillion: 2, outputPricePerMillion: 6 },
    'MiniMaxAI/MiniMax-M3': { inputPricePerMillion: 0.3, outputPricePerMillion: 1.2 },
    'thinkingmachines/Inkling': { inputPricePerMillion: 1, outputPricePerMillion: 4.05 },
  },

  // Local models typically have no per-token cost
  ollama: {
    // All local models are free
    'llama3.2': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'llama3.1': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    llama3: { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    llama4: { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    mistral: { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    codellama: { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    phi3: { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    phi4: { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    gemma2: { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    gemma3: { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'qwen2.5': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    qwen3: { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'deepseek-r1': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'deepseek-v3': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  },
};
