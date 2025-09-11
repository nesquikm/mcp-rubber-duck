# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-09-11

### Added
- 🦆 **Multiple AI Provider Support:** Query OpenAI, Gemini, Groq, Ollama, and custom providers
- 💬 **Conversation Management:** Maintain context across messages with conversation IDs
- 🏛️ **Duck Council:** Get responses from all configured LLMs simultaneously
- 🔗 **MCP Bridge:** Connect to external MCP servers with approval system
- 🛡️ **Security Features:** Per-server trust settings and smart tool approval workflow
- 🐳 **Universal Deployment:** Multi-platform Docker support (AMD64, ARM64)
- 📦 **Multiple Configuration Options:** Desktop, Raspberry Pi, and remote deployment configs
- 🔧 **Flexible Provider Configuration:** Support for custom providers via environment variables
- 🧪 **Comprehensive Testing:** Jest-based test suite with ESM module support
- 🚀 **CI/CD Pipeline:** Automated Docker builds and releases via GitHub Actions
- 📝 **Rich Logging:** Winston-based logging with safe credential handling
- 🔄 **Conversation Reset:** Clear conversation history functionality
- 🏷️ **Custom Duck Nicknames:** Optional custom names for AI providers

### Features
- Support for multiple OpenAI-compatible LLM providers
- Conversation context management with unique IDs
- MCP server integration with security approval system
- Docker-based deployment with multi-architecture support
- Comprehensive configuration via environment variables
- Automated versioning and release system (semantic-release)
- GitHub Actions workflows for CI/CD
- Systemd service files for production deployment

### Technical Improvements
- TypeScript support with strict type checking
- ESLint and Prettier for code quality
- Jest testing framework configured for ESM modules
- Winston logging with credential sanitization
- Zod schema validation for configuration
- Docker multi-stage builds for optimized images
- GitHub Container Registry integration

[Unreleased]: https://github.com/nesquikm/mcp-rubber-duck/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nesquikm/mcp-rubber-duck/releases/tag/v1.0.0