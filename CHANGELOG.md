# [1.10.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.9.5...v1.10.0) (2026-01-29)


### Bug Fixes

* allowlist GHSA-p5wg-g6qr-c7cg (eslint circular ref stack overflow) ([bf5388e](https://github.com/nesquikm/mcp-rubber-duck/commit/bf5388e26f91e412dba28986a4c177b60539b4f4))


### Features

* add interactive UIs for compare, vote, debate, and usage tools via MCP Apps ([9904ad9](https://github.com/nesquikm/mcp-rubber-duck/commit/9904ad94b12b2c69a8c5c50e18778966fc7e0069))

## [1.9.5](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.9.4...v1.9.5) (2026-01-29)


### Bug Fixes

* allowlist GHSA-34x7-hfp2-rc4v (tar via npm internals) ([76718d8](https://github.com/nesquikm/mcp-rubber-duck/commit/76718d86391469b04e1d74792ed8ab212d547e3d))

## [1.9.4](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.9.3...v1.9.4) (2026-01-26)


### Bug Fixes

* override lodash to 4.17.23 to address CVE-2025-13465 ([8cb5a3a](https://github.com/nesquikm/mcp-rubber-duck/commit/8cb5a3a0b3a644b2ed368537412cda32b8a333f2))

## [1.9.3](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.9.2...v1.9.3) (2026-01-19)


### Bug Fixes

* upgrade npm to latest for OIDC trusted publishing ([a6ca82c](https://github.com/nesquikm/mcp-rubber-duck/commit/a6ca82cddd15bbd56a9e7eaabb513d7cb5b13d8c))

## [1.9.2](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.9.1...v1.9.2) (2026-01-19)


### Bug Fixes

* configure registry-url for npm OIDC auth ([0798f7c](https://github.com/nesquikm/mcp-rubber-duck/commit/0798f7c94a0a69470d6cae9f27ca984ee2975ac8))

## [1.9.1](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.9.0...v1.9.1) (2026-01-19)


### Bug Fixes

* switch to npm OIDC trusted publishing ([b1f92ca](https://github.com/nesquikm/mcp-rubber-duck/commit/b1f92ca97baba8ac50b77cf16c880174a4dd32fa))
* use native npm publish for OIDC provenance ([99fb6d8](https://github.com/nesquikm/mcp-rubber-duck/commit/99fb6d8d77a786e1b1c748bc9a3b68c81cffec99))

# [1.9.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.8.0...v1.9.0) (2026-01-15)


### Features

* add pluggable guardrails system for LLM request/response interception ([8e86d5b](https://github.com/nesquikm/mcp-rubber-duck/commit/8e86d5b8853cc95e6c5efe9e75af7d0ce2bb1ac0))
* implement max_output_tokens, fix modify action, add tests and docs ([27457d7](https://github.com/nesquikm/mcp-rubber-duck/commit/27457d79ab68377921996e0c0336cf7e84e0ea8b))

# [1.8.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.7.0...v1.8.0) (2026-01-14)


### Features

* add MCP prompts capability with 8 multi-LLM focused templates ([e62bfc1](https://github.com/nesquikm/mcp-rubber-duck/commit/e62bfc10dc3302ef8ea254684fb2bcaec1ac7fdd)), closes [#23](https://github.com/nesquikm/mcp-rubber-duck/issues/23)

# [1.7.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.6.1...v1.7.0) (2026-01-13)


### Features

* add tool annotations for MCP spec compliance ([7d03f2d](https://github.com/nesquikm/mcp-rubber-duck/commit/7d03f2d3545bcaf455c3077bda420d0db7c0ce7a)), closes [#22](https://github.com/nesquikm/mcp-rubber-duck/issues/22)

## [1.6.1](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.6.0...v1.6.1) (2026-01-09)


### Bug Fixes

* **docs:** add missing get_usage_stats tool to README ([c507f07](https://github.com/nesquikm/mcp-rubber-duck/commit/c507f07092018ad48aa24f6e9115a0761d0d7d49))

# [1.6.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.5.2...v1.6.0) (2026-01-08)


### Features

* add usage tracking and cost estimation ([#11](https://github.com/nesquikm/mcp-rubber-duck/issues/11)) ([1f60118](https://github.com/nesquikm/mcp-rubber-duck/commit/1f60118fc00a028e91c9af87c1daa236a228cc5a))

## [1.5.2](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.5.1...v1.5.2) (2026-01-08)


### Bug Fixes

* **ci:** trigger patch releases for dependency updates ([b1c92c4](https://github.com/nesquikm/mcp-rubber-duck/commit/b1c92c4f56e4a8e67c307c28284b9f03256dc72f))

## [1.5.1](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.5.0...v1.5.1) (2026-01-02)


### Bug Fixes

* update qs to resolve CVE (GHSA-6rw7-vpxm-498p) ([3c15c66](https://github.com/nesquikm/mcp-rubber-duck/commit/3c15c66a3c81c741e38d9cc22d8df5e6537ba7d9))

# [1.5.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.4.2...v1.5.0) (2025-12-08)


### Features

* add Claude Code agent definitions for project-specific tasks ([1843c1b](https://github.com/nesquikm/mcp-rubber-duck/commit/1843c1b1b970155d37cf79925b4fd674eade28bd))

## [1.4.2](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.4.1...v1.4.2) (2025-12-08)


### Bug Fixes

* update MCP Registry badge URL ([c840e60](https://github.com/nesquikm/mcp-rubber-duck/commit/c840e6043dc1214796f146500f8188a913dfeefe))

## [1.4.1](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.4.0...v1.4.1) (2025-12-08)


### Bug Fixes

* **security:** update MCP SDK and address code scanning alerts ([08b3a40](https://github.com/nesquikm/mcp-rubber-duck/commit/08b3a40f9aaa053138003258812b0d4c8bbddfc3))

# [1.4.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.3.0...v1.4.0) (2025-11-30)


### Features

* add support for latest LLM models (Nov 2025) ([80ce45f](https://github.com/nesquikm/mcp-rubber-duck/commit/80ce45f8222762ea1b12af07fd54e9a19ac8532c))

# [1.3.0](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.2.5...v1.3.0) (2025-11-24)


### Bug Fixes

* improve JSON parsing in consensus and judge tools ([92f64e5](https://github.com/nesquikm/mcp-rubber-duck/commit/92f64e525681886bfe791d72b07f71511da62ee0))


### Features

* add multi-agent consensus and debate tools ([55352d8](https://github.com/nesquikm/mcp-rubber-duck/commit/55352d856d59ede6cb0e8a9d763c27afe3a9e33e))

## [1.2.5](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.2.4...v1.2.5) (2025-11-24)


### Bug Fixes

* align semantic-release audit config with security workflow ([940a160](https://github.com/nesquikm/mcp-rubber-duck/commit/940a1605874bb3f7c435ecde2e25c135b8a4b5c8))
* improve security workflow and update dependencies ([55703a4](https://github.com/nesquikm/mcp-rubber-duck/commit/55703a4f50cef0066d63512c3cbd44c1c90ce111))

## [1.2.4](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.2.3...v1.2.4) (2025-11-17)


### Bug Fixes

* avoid npm ci on ARM64 by copying node_modules from builder ([b5a9777](https://github.com/nesquikm/mcp-rubber-duck/commit/b5a977772c44a138dc65554e8f2448be63fb0976))

## [1.2.3](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.2.2...v1.2.3) (2025-11-17)


### Bug Fixes

* resolve js-yaml security vulnerability with package override ([822a550](https://github.com/nesquikm/mcp-rubber-duck/commit/822a550397cb9b3e3966a8c5335c2ab1182bfd91))

## [1.2.2](https://github.com/nesquikm/mcp-rubber-duck/compare/v1.2.1...v1.2.2) (2025-09-17)

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
