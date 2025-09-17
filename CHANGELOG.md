## [1.2.1](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.2.0...v1.2.1) (2025-09-17)

# [1.2.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.1.1...v1.2.0) (2025-09-17)


### Bug Fixes

* update server.json version to 1.1.1 ([17ff270](https://github.com/nesquikm/mcp-rubber-duck/commit/17ff270efea5a8d57a159e81d33b7fe61e67348c))


### Features

* add glama.json for server inspection and scoring ([204221c](https://github.com/nesquikm/mcp-rubber-duck/commit/204221c939d0b0f2cd32e6ba4b4fdf9beea2c861))

## [1.1.1](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.1.0...v1.1.1) (2025-09-17)


### Bug Fixes

* update mcpName format for GitHub namespace ([0786914](https://github.com/nesquikm/mcp-rubber-duck/commit/078691426d54f6ddc4feac7ffd9c5f7fdc15ac34))
* update server.json name format for GitHub namespace ([fe866ff](https://github.com/nesquikm/mcp-rubber-duck/commit/fe866ffabdae8bfd066c809bc4c8e04a18562ec8))

# [1.1.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.0.0...v1.1.0) (2025-09-17)


### Features

* add NPM publishing for MCP Registry ([96a7a5b](https://github.com/nesquikm/mcp-rubber-duck/commit/96a7a5b6e2e25f7113c0ec87880e39d4a2fae02f))

# 1.0.0 (2025-09-11)


### Bug Fixes

* Always silence console logs in MCP mode to prevent JSON-RPC parsing errors ([0761756](https://github.com/nesquikm/mcp-rubber-duck/commit/076175671f67c7bf10118e578a81078b7e798fc0))
* Clean up MCP server output to prevent JSON parsing errors ([e391c46](https://github.com/nesquikm/mcp-rubber-duck/commit/e391c46b1cbd151abc99304055f9a2217ee0e2e6))
* Configure Jest for ESM modules compatibility ([221492d](https://github.com/nesquikm/mcp-rubber-duck/commit/221492dd5aaf049aba637467767626bad6e0bebe))
* Correct Gemini API endpoint URL and add comprehensive tests ([36f4c3d](https://github.com/nesquikm/mcp-rubber-duck/commit/36f4c3d0f3385d3d374fdff6078b8c3204a8fc77))
* Display requested model name instead of resolved API model name ([9acfe25](https://github.com/nesquikm/mcp-rubber-duck/commit/9acfe25e56ac67bb52957e594eb0022187129a33))
* Health checks for reasoning models (GPT-5, Gemini-2.5) ([2af7816](https://github.com/nesquikm/mcp-rubber-duck/commit/2af7816698fac18cf64026404f8cca5061ddb9ce))
* Implement smart parameter detection for OpenAI API compatibility ([fed002f](https://github.com/nesquikm/mcp-rubber-duck/commit/fed002f6db8d61d0fee520d13b454d15533db9ea))
* Prevent Ollama auto-detection when not configured ([9409441](https://github.com/nesquikm/mcp-rubber-duck/commit/940944121500cc54740339c2167040fdb327761f))
* Remove conventionalcommits preset from semantic-release config ([f34934f](https://github.com/nesquikm/mcp-rubber-duck/commit/f34934f4e06b0b9106132415e98b42016c2fcd5d))
* Remove npm publishing from semantic-release configuration ([e3f0f4b](https://github.com/nesquikm/mcp-rubber-duck/commit/e3f0f4b374ff5579565f1bcfcee445bc084c7ae1))
* Remove token limits completely to resolve empty responses from reasoning models ([ac41f73](https://github.com/nesquikm/mcp-rubber-duck/commit/ac41f738ac3b166c8845b271e77ba8315ac9d0b9))
* Temporarily disable lint in CI to fix deployment ([30d8b3b](https://github.com/nesquikm/mcp-rubber-duck/commit/30d8b3bb2412a53086190752bfc95e970382efa2))
* Temporarily disable tests in CI to fix deployment ([d023a32](https://github.com/nesquikm/mcp-rubber-duck/commit/d023a32847115dae6144fe5fe1e3c04b21c85a7e))


### Features

* 🦆 Ducks can now use MCP tools! Per-server trust & smart approvals ([2fa5a0f](https://github.com/nesquikm/mcp-rubber-duck/commit/2fa5a0f1ab3cb81736494ddda7f29919c5c93a51))
* Add automated versioning with semantic-release ([b3c7470](https://github.com/nesquikm/mcp-rubber-duck/commit/b3c7470ba27e2d043b9080b0fe0fcdb54ef56ab3))
* Add conversation reset functionality ([92dc489](https://github.com/nesquikm/mcp-rubber-duck/commit/92dc4895951200afadf7b82e634e12ddd072afa2))
* Add dynamic model listing and selection ([ce84823](https://github.com/nesquikm/mcp-rubber-duck/commit/ce84823eb94c09f767671d8d24875c125ddd21b6))
* Add environment variable support for provider default models ([4ac2272](https://github.com/nesquikm/mcp-rubber-duck/commit/4ac2272cb57bba21195504dea191aaa5bafd5dfe))
* Add GitHub Actions for automated Docker builds and releases ([2ff30d6](https://github.com/nesquikm/mcp-rubber-duck/commit/2ff30d635116f5db2f860412642d794ee5ad2531))
* Add Google Gemini support ([359db64](https://github.com/nesquikm/mcp-rubber-duck/commit/359db641a22d447df25297bee2889352f97614b3))
* Add optional custom duck nicknames via environment variables ([c3b3e6a](https://github.com/nesquikm/mcp-rubber-duck/commit/c3b3e6a9c6ce863e4a0ec03fb8a14099b795d8cd))
* Add systemd service files for production deployment ([63333fb](https://github.com/nesquikm/mcp-rubber-duck/commit/63333fb851b8546fc0e803b7a43d921385b471cc))
* Add universal multi-platform Docker deployment support ([37ea1cb](https://github.com/nesquikm/mcp-rubber-duck/commit/37ea1cb0c2b13cb5b2a82addf23888f3c1898550))
* Display model name in all duck responses ([ab87434](https://github.com/nesquikm/mcp-rubber-duck/commit/ab874347a611406fb47c1002f87696580ed416fe))
* Enhance MCP rubber duck functionality with improved provider support and error handling ([2356389](https://github.com/nesquikm/mcp-rubber-duck/commit/23563898a90c101d794648c411f4d8e29fbaf687))
* Support multiple custom providers via CUSTOM_{NAME}_* environment variables ([5bfeb82](https://github.com/nesquikm/mcp-rubber-duck/commit/5bfeb8224d2d1057d66422253d912424d254b943))


### BREAKING CHANGES

* Removes old CUSTOM_API_KEY/CUSTOM_BASE_URL pattern.

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
