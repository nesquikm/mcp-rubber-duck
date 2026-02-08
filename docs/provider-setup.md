# Provider-Specific Setup

<p align="center">
  <img src="../assets/docs-provider-setup.jpg" alt="Provider setup garage" width="600">
</p>

## Ollama (Local)
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama3.2

# Ollama automatically provides OpenAI-compatible endpoint at localhost:11434/v1
```

## LM Studio (Local)
1. Download LM Studio from https://lmstudio.ai/
2. Load a model in LM Studio
3. Start the local server (provides OpenAI-compatible endpoint at localhost:1234/v1)

## Google Gemini
1. Get API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Add to environment: `GEMINI_API_KEY=...`
3. Uses OpenAI-compatible endpoint (beta)

## Groq
1. Get API key from https://console.groq.com/keys
2. Add to environment: `GROQ_API_KEY=gsk_...`

## Together AI
1. Get API key from https://api.together.xyz/
2. Configure as a custom provider:
```env
CUSTOM_TOGETHER_API_KEY=...
CUSTOM_TOGETHER_BASE_URL=https://api.together.xyz/v1
CUSTOM_TOGETHER_DEFAULT_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo
CUSTOM_TOGETHER_NICKNAME=Together Duck
```

## Verifying OpenAI Compatibility

To check if a provider is OpenAI-compatible:

1. Look for `/v1/chat/completions` endpoint in their API docs
2. Check if they support the OpenAI SDK
3. Test with curl:

```bash
curl -X POST "https://api.provider.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "model-name",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```
