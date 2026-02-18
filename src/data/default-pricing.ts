import { PricingConfig } from '../config/types.js';

/**
 * Default pricing data for common LLM providers.
 * Prices are in USD per million tokens.
 * Last updated: 2026-02-05
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
export const DEFAULT_PRICING_LAST_UPDATED = '2026-02-18';

export const DEFAULT_PRICING: PricingConfig = {
  openai: {
    // GPT-5 models (released 2025)
    'gpt-5': { inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
    'gpt-5.1': { inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
    'gpt-5.2': { inputPricePerMillion: 1.75, outputPricePerMillion: 14 },
    'gpt-5.2-pro': { inputPricePerMillion: 21, outputPricePerMillion: 168 },
    'gpt-5-pro': { inputPricePerMillion: 15, outputPricePerMillion: 120 },
    'gpt-5-mini': { inputPricePerMillion: 0.25, outputPricePerMillion: 2 },
    'gpt-5-nano': { inputPricePerMillion: 0.05, outputPricePerMillion: 0.4 },

    // GPT-4.1 models
    'gpt-4.1': { inputPricePerMillion: 2, outputPricePerMillion: 8 },
    'gpt-4.1-mini': { inputPricePerMillion: 0.4, outputPricePerMillion: 1.6 },
    'gpt-4.1-nano': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },

    // GPT-4o models
    'gpt-4o': { inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
    'gpt-4o-2024-11-20': { inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
    'gpt-4o-2024-08-06': { inputPricePerMillion: 2.5, outputPricePerMillion: 10 },
    'gpt-4o-2024-05-13': { inputPricePerMillion: 5, outputPricePerMillion: 15 },
    'gpt-4o-mini': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'gpt-4o-mini-2024-07-18': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },

    // GPT-4 Turbo
    'gpt-4-turbo': { inputPricePerMillion: 10, outputPricePerMillion: 30 },
    'gpt-4-turbo-2024-04-09': { inputPricePerMillion: 10, outputPricePerMillion: 30 },
    'gpt-4-turbo-preview': { inputPricePerMillion: 10, outputPricePerMillion: 30 },

    // GPT-4
    'gpt-4': { inputPricePerMillion: 30, outputPricePerMillion: 60 },
    'gpt-4-0613': { inputPricePerMillion: 30, outputPricePerMillion: 60 },

    // GPT-3.5 Turbo
    'gpt-3.5-turbo': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    'gpt-3.5-turbo-0125': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },

    // o4 reasoning models
    'o4-mini': { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },
    'o4-mini-deep-research': { inputPricePerMillion: 2, outputPricePerMillion: 8 },

    // o3 reasoning models
    'o3': { inputPricePerMillion: 2, outputPricePerMillion: 8 },
    'o3-pro': { inputPricePerMillion: 20, outputPricePerMillion: 80 },
    'o3-deep-research': { inputPricePerMillion: 10, outputPricePerMillion: 40 },
    'o3-mini': { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },

    // o1 reasoning models
    'o1': { inputPricePerMillion: 15, outputPricePerMillion: 60 },
    'o1-pro': { inputPricePerMillion: 150, outputPricePerMillion: 600 },
    'o1-2024-12-17': { inputPricePerMillion: 15, outputPricePerMillion: 60 },
    'o1-preview': { inputPricePerMillion: 15, outputPricePerMillion: 60 },
    'o1-preview-2024-09-12': { inputPricePerMillion: 15, outputPricePerMillion: 60 },
    'o1-mini': { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },
    'o1-mini-2024-09-12': { inputPricePerMillion: 1.1, outputPricePerMillion: 4.4 },
  },

  anthropic: {
    // Claude 4.6 models
    'claude-opus-4-6': { inputPricePerMillion: 5, outputPricePerMillion: 25 },
    'claude-sonnet-4-6': { inputPricePerMillion: 3, outputPricePerMillion: 15 },

    // Claude 4.5 models
    'claude-opus-4-5-20251101': { inputPricePerMillion: 5, outputPricePerMillion: 25 },
    'claude-opus-4-5': { inputPricePerMillion: 5, outputPricePerMillion: 25 },
    'claude-sonnet-4-5-20250929': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    'claude-sonnet-4-5': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    'claude-haiku-4-5': { inputPricePerMillion: 1, outputPricePerMillion: 5 },

    // Claude 4.1 models
    'claude-opus-4-1': { inputPricePerMillion: 15, outputPricePerMillion: 75 },

    // Claude 4 models
    'claude-opus-4-20250514': { inputPricePerMillion: 15, outputPricePerMillion: 75 },
    'claude-opus-4': { inputPricePerMillion: 15, outputPricePerMillion: 75 },
    'claude-sonnet-4-20250514': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    'claude-sonnet-4': { inputPricePerMillion: 3, outputPricePerMillion: 15 },

    // Claude 3.7 models (deprecated but kept for compatibility)
    'claude-3-7-sonnet-20250219': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    'claude-sonnet-3-7': { inputPricePerMillion: 3, outputPricePerMillion: 15 },

    // Claude 3.5 models
    'claude-3-5-sonnet-20241022': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    'claude-3-5-haiku-20241022': { inputPricePerMillion: 0.8, outputPricePerMillion: 4 },
    'claude-haiku-3-5': { inputPricePerMillion: 0.8, outputPricePerMillion: 4 },

    // Claude 3 models (deprecated but kept for compatibility)
    'claude-3-opus-20240229': { inputPricePerMillion: 15, outputPricePerMillion: 75 },
    'claude-opus-3': { inputPricePerMillion: 15, outputPricePerMillion: 75 },
    'claude-3-sonnet-20240229': { inputPricePerMillion: 3, outputPricePerMillion: 15 },
    'claude-3-haiku-20240307': { inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 },
    'claude-haiku-3': { inputPricePerMillion: 0.25, outputPricePerMillion: 1.25 },
  },

  google: {
    // Gemini 3.0 (preview)
    'gemini-3-pro-preview': { inputPricePerMillion: 2, outputPricePerMillion: 12 },
    'gemini-3-flash-preview': { inputPricePerMillion: 0.5, outputPricePerMillion: 3 },
    'gemini-3-pro-image-preview': { inputPricePerMillion: 2, outputPricePerMillion: 120 },

    // Gemini 2.5
    'gemini-2.5-pro': { inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
    'gemini-2.5-pro-latest': { inputPricePerMillion: 1.25, outputPricePerMillion: 10 },
    'gemini-2.5-flash': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },
    'gemini-2.5-flash-latest': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },
    'gemini-2.5-flash-lite': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },
    'gemini-2.5-flash-preview-09-2025': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },
    'gemini-2.5-flash-lite-preview-09-2025': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },
    'gemini-2.5-flash-native-audio-preview-12-2025': {
      inputPricePerMillion: 0.5,
      outputPricePerMillion: 2,
    },
    'gemini-2.5-computer-use-preview-10-2025': {
      inputPricePerMillion: 1.25,
      outputPricePerMillion: 10,
    },

    // Gemini 2.0
    'gemini-2.0-flash': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },
    'gemini-2.0-flash-lite': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
    // Note: gemini-2.0-flash deprecated March 31, 2026 - use 2.5 models
    'gemini-2.0-flash-exp': { inputPricePerMillion: 0, outputPricePerMillion: 0 }, // Free during preview

    // Gemini 1.5
    'gemini-1.5-pro': { inputPricePerMillion: 1.25, outputPricePerMillion: 5 },
    'gemini-1.5-pro-latest': { inputPricePerMillion: 1.25, outputPricePerMillion: 5 },
    'gemini-1.5-flash': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
    'gemini-1.5-flash-latest': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
    'gemini-1.5-flash-8b': { inputPricePerMillion: 0.0375, outputPricePerMillion: 0.15 },

    // Gemini 1.0
    'gemini-1.0-pro': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    'gemini-pro': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },

    // Embeddings
    'gemini-embedding-001': { inputPricePerMillion: 0.15, outputPricePerMillion: 0 },

    // Robotics (preview)
    'gemini-robotics-er-1.5-preview': { inputPricePerMillion: 0.3, outputPricePerMillion: 2.5 },

    // Gemma (free)
    'gemma-3': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'gemma-3n': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  },

  groq: {
    // Llama 4
    'llama-4-scout-17b-128k': { inputPricePerMillion: 0.11, outputPricePerMillion: 0.34 },
    'llama-4-maverick-17b-128k': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.6 },
    'llama-guard-4-12b': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.2 },

    // Llama 3.3
    'llama-3.3-70b-versatile': { inputPricePerMillion: 0.59, outputPricePerMillion: 0.79 },
    'llama-3.3-70b-specdec': { inputPricePerMillion: 0.59, outputPricePerMillion: 0.99 },

    // Llama 3.1
    'llama-3.1-70b-versatile': { inputPricePerMillion: 0.59, outputPricePerMillion: 0.79 },
    'llama-3.1-8b-instant': { inputPricePerMillion: 0.05, outputPricePerMillion: 0.08 },

    // Llama 3.2
    'llama-3.2-90b-vision-preview': { inputPricePerMillion: 0.9, outputPricePerMillion: 0.9 },
    'llama-3.2-11b-vision-preview': { inputPricePerMillion: 0.18, outputPricePerMillion: 0.18 },
    'llama-3.2-3b-preview': { inputPricePerMillion: 0.06, outputPricePerMillion: 0.06 },
    'llama-3.2-1b-preview': { inputPricePerMillion: 0.04, outputPricePerMillion: 0.04 },

    // GPT-OSS models
    'gpt-oss-120b-128k': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'gpt-oss-20b-128k': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },
    'gpt-oss-safeguard-20b': { inputPricePerMillion: 0.075, outputPricePerMillion: 0.3 },

    // Qwen
    'qwen3-32b-131k': { inputPricePerMillion: 0.29, outputPricePerMillion: 0.59 },

    // Kimi
    'kimi-k2-0905-256k': { inputPricePerMillion: 1, outputPricePerMillion: 3 },

    // Mixtral
    'mixtral-8x7b-32768': { inputPricePerMillion: 0.24, outputPricePerMillion: 0.24 },

    // Gemma
    'gemma2-9b-it': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.2 },
    'gemma-7b-it': { inputPricePerMillion: 0.07, outputPricePerMillion: 0.07 },
  },

  deepseek: {
    // DeepSeek V3.2 (current models)
    'deepseek-chat': { inputPricePerMillion: 0.28, outputPricePerMillion: 0.42 },
    'deepseek-reasoner': { inputPricePerMillion: 0.28, outputPricePerMillion: 0.42 },
    // Legacy aliases kept for compatibility
    'deepseek-v3': { inputPricePerMillion: 0.28, outputPricePerMillion: 0.42 },
    'deepseek-r1': { inputPricePerMillion: 0.28, outputPricePerMillion: 0.42 },
  },

  mistral: {
    // Mistral Large 3 (2512 release)
    'mistral-large-latest': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    'mistral-large-2512': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    'mistral-large-2411': { inputPricePerMillion: 2, outputPricePerMillion: 6 },

    // Mistral Medium 3
    'mistral-medium-latest': { inputPricePerMillion: 0.4, outputPricePerMillion: 2 },
    'mistral-medium-3': { inputPricePerMillion: 0.4, outputPricePerMillion: 2 },

    // Mistral Small 3.1
    'mistral-small-latest': { inputPricePerMillion: 0.03, outputPricePerMillion: 0.11 },
    'mistral-small-3.1': { inputPricePerMillion: 0.03, outputPricePerMillion: 0.11 },
    'mistral-small-2409': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.3 },
    'mistral-small-3': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.3 },

    // Codestral
    'codestral-latest': { inputPricePerMillion: 0.3, outputPricePerMillion: 0.9 },
    'codestral-2508': { inputPricePerMillion: 0.3, outputPricePerMillion: 0.9 },
    'codestral-2501': { inputPricePerMillion: 0.3, outputPricePerMillion: 0.9 },

    // Devstral 2
    'devstral-2': { inputPricePerMillion: 0.4, outputPricePerMillion: 2 },
    'devstral-small-2': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.3 },

    // Ministral
    'ministral-8b-latest': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.1 },
    'ministral-3b-latest': { inputPricePerMillion: 0.04, outputPricePerMillion: 0.04 },

    // Pixtral
    'pixtral-large-latest': { inputPricePerMillion: 2, outputPricePerMillion: 6 },

    // Open models
    'open-mistral-nemo': { inputPricePerMillion: 0.02, outputPricePerMillion: 0.02 },
  },

  together: {
    // Llama 4
    'meta-llama/Llama-4-Maverick': { inputPricePerMillion: 0.27, outputPricePerMillion: 0.85 },
    'meta-llama/Llama-4-Scout': { inputPricePerMillion: 0.18, outputPricePerMillion: 0.59 },

    // Llama 3.3
    'meta-llama/Llama-3.3-70B-Instruct-Turbo': {
      inputPricePerMillion: 0.88,
      outputPricePerMillion: 0.88,
    },

    // Llama 3.2
    'meta-llama/Llama-3.2-3B-Instruct-Turbo': {
      inputPricePerMillion: 0.06,
      outputPricePerMillion: 0.06,
    },

    // Llama 3.1
    'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': {
      inputPricePerMillion: 3.5,
      outputPricePerMillion: 3.5,
    },
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo': {
      inputPricePerMillion: 0.88,
      outputPricePerMillion: 0.88,
    },
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': {
      inputPricePerMillion: 0.18,
      outputPricePerMillion: 0.18,
    },

    // Llama 3
    'meta-llama/Llama-3-8B-Instruct-Lite': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.1 },
    'meta-llama/Llama-3-70B-Instruct-Turbo': {
      inputPricePerMillion: 0.88,
      outputPricePerMillion: 0.88,
    },

    // DeepSeek
    'deepseek-ai/DeepSeek-R1': { inputPricePerMillion: 3, outputPricePerMillion: 7 },
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B': {
      inputPricePerMillion: 0.18,
      outputPricePerMillion: 0.18,
    },
    'deepseek-ai/DeepSeek-R1-Distill-Llama-70B': {
      inputPricePerMillion: 2,
      outputPricePerMillion: 2,
    },
    'deepseek-ai/DeepSeek-R1-0528-tput': {
      inputPricePerMillion: 0.55,
      outputPricePerMillion: 2.19,
    },
    'deepseek-ai/DeepSeek-V3-1': { inputPricePerMillion: 0.6, outputPricePerMillion: 1.7 },
    'deepseek-ai/DeepSeek-V3': { inputPricePerMillion: 1.25, outputPricePerMillion: 1.25 },

    // GPT-OSS
    'gpt-oss-120B': { inputPricePerMillion: 0.15, outputPricePerMillion: 0.6 },
    'gpt-oss-20B': { inputPricePerMillion: 0.05, outputPricePerMillion: 0.2 },

    // Qwen 3
    'Qwen/Qwen3-Next-80B-A3B-Instruct': { inputPricePerMillion: 0.15, outputPricePerMillion: 1.5 },
    'Qwen/Qwen3-Next-80B-A3B-Thinking': { inputPricePerMillion: 0.15, outputPricePerMillion: 1.5 },
    'Qwen/Qwen3-VL-32B-Instruct': { inputPricePerMillion: 0.5, outputPricePerMillion: 1.5 },
    'Qwen/Qwen3-Coder-480B-A35B-Instruct': { inputPricePerMillion: 2, outputPricePerMillion: 2 },
    'Qwen/Qwen3-235B-A22B-Instruct-FP8': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.6 },
    'Qwen/Qwen3-235B-A22B-Thinking-FP8': { inputPricePerMillion: 0.65, outputPricePerMillion: 3 },
    'Qwen/Qwen3-235B-A22B-FP8-Throughput': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.6 },

    // Qwen 2.5
    'Qwen/Qwen2.5-72B-Instruct-Turbo': { inputPricePerMillion: 1.2, outputPricePerMillion: 1.2 },
    'Qwen/Qwen2.5-VL-72B-Instruct': { inputPricePerMillion: 1.95, outputPricePerMillion: 8 },
    'Qwen/Qwen2.5-Coder-32B-Instruct': { inputPricePerMillion: 0.8, outputPricePerMillion: 0.8 },
    'Qwen/Qwen2.5-7B-Instruct-Turbo': { inputPricePerMillion: 0.3, outputPricePerMillion: 0.3 },
    'Qwen/QwQ-32B': { inputPricePerMillion: 1.2, outputPricePerMillion: 1.2 },

    // Kimi
    'Kimi/K2-Instruct': { inputPricePerMillion: 1, outputPricePerMillion: 3 },
    'Kimi/K2-Thinking': { inputPricePerMillion: 1.2, outputPricePerMillion: 4 },
    'Kimi/K2-0905': { inputPricePerMillion: 1, outputPricePerMillion: 3 },

    // GLM
    'THUDM/GLM-4.6': { inputPricePerMillion: 0.6, outputPricePerMillion: 2.2 },
    'THUDM/GLM-4.5-Air': { inputPricePerMillion: 0.2, outputPricePerMillion: 1.1 },

    // Mistral
    'mistralai/Mistral-7B-Instruct-v0.2': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.2 },
    'mistralai/Mistral-Small-3': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.3 },
    'mistralai/Mixtral-8x7B-Instruct-v0.1': { inputPricePerMillion: 0.6, outputPricePerMillion: 0.6 },

    // Cogito
    'Cogito/cogito-v2-109B-MoE': { inputPricePerMillion: 0.18, outputPricePerMillion: 0.59 },
    'Cogito/cogito-v2-405B': { inputPricePerMillion: 3.5, outputPricePerMillion: 3.5 },
    'Cogito/cogito-v2-671B-MoE': { inputPricePerMillion: 1.25, outputPricePerMillion: 1.25 },
    'Cogito/cogito-v2-70B': { inputPricePerMillion: 0.88, outputPricePerMillion: 0.88 },

    // Arcee
    'arcee-ai/AFM-4.5B': { inputPricePerMillion: 0.1, outputPricePerMillion: 0.4 },
    'arcee-ai/Coder-Large': { inputPricePerMillion: 0.5, outputPricePerMillion: 0.8 },
    'arcee-ai/Maestro': { inputPricePerMillion: 0.9, outputPricePerMillion: 3.3 },
    'arcee-ai/Virtuoso-Large': { inputPricePerMillion: 0.75, outputPricePerMillion: 1.2 },

    // Refuel
    'refuel-ai/Refuel-LLM-2': { inputPricePerMillion: 0.6, outputPricePerMillion: 0.6 },
    'refuel-ai/Refuel-LLM-2-Small': { inputPricePerMillion: 0.2, outputPricePerMillion: 0.2 },

    // Typhoon
    'scb10x/Typhoon-2-70B-Instruct': { inputPricePerMillion: 0.88, outputPricePerMillion: 0.88 },

    // Marin
    'marin-ai/Marin-8B-Instruct': { inputPricePerMillion: 0.18, outputPricePerMillion: 0.18 },

    // Gemma
    'google/gemma-3n-E4B-it': { inputPricePerMillion: 0.02, outputPricePerMillion: 0.04 },
  },

  // Local models typically have no per-token cost
  ollama: {
    // All local models are free
    'llama3.2': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'llama3.1': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'llama3': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'llama4': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'mistral': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'codellama': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'phi3': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'phi4': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'gemma2': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'gemma3': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'qwen2.5': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'qwen3': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'deepseek-r1': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
    'deepseek-v3': { inputPricePerMillion: 0, outputPricePerMillion: 0 },
  },
};
