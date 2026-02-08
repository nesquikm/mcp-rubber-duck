# Docker Support

<p align="center">
  <img src="../assets/docs-docker.jpg" alt="Docker deployment ship" width="600">
</p>

MCP Rubber Duck provides multi-platform Docker support, working on **macOS (Intel & Apple Silicon)**, **Linux (x86_64 & ARM64)**, **Windows (WSL2)**, and **Raspberry Pi 3+**.

## Quick Start with Pre-built Image

The easiest way to get started is with our pre-built multi-architecture image:

```bash
# Pull the image (works on all platforms)
docker pull ghcr.io/nesquikm/mcp-rubber-duck:latest

# Create environment file
cp .env.template .env
# Edit .env and add your API keys

# Run with Docker Compose (recommended)
docker compose up -d
```

## Platform-Specific Deployment

### Desktop/Server (macOS, Linux, Windows)

```bash
# Use desktop-optimized settings
./scripts/deploy.sh --platform desktop

# Or with more resources and local AI
./scripts/deploy.sh --platform desktop --profile with-ollama
```

### Raspberry Pi

```bash
# Use Pi-optimized settings (memory limits, etc.)
./scripts/deploy.sh --platform pi

# Or copy optimized config directly
cp .env.pi.example .env
# Edit .env and add your API keys
docker compose up -d
```

### Remote Deployment via SSH

```bash
# Deploy to remote Raspberry Pi
./scripts/deploy.sh --mode ssh --ssh-host pi@192.168.1.100
```

## Universal Deployment Script

The `scripts/deploy.sh` script auto-detects your platform and applies optimal settings:

```bash
# Auto-detect platform and deploy
./scripts/deploy.sh

# Options:
./scripts/deploy.sh --help
```

**Available options:**
- `--mode`: `docker` (default), `local`, or `ssh`
- `--platform`: `pi`, `desktop`, or `auto` (default)
- `--profile`: `lightweight`, `desktop`, `with-ollama`
- `--ssh-host`: For remote deployment

## Platform-Specific Configuration

### Raspberry Pi (Memory-Optimized)
```env
# .env.pi.example - Optimized for Pi 3+
DOCKER_CPU_LIMIT=1.5
DOCKER_MEMORY_LIMIT=512M
NODE_OPTIONS=--max-old-space-size=256
```

### Desktop/Server (High-Performance)
```env
# .env.desktop.example - Optimized for powerful systems
DOCKER_CPU_LIMIT=4.0
DOCKER_MEMORY_LIMIT=2G
NODE_OPTIONS=--max-old-space-size=1024
```

## Docker Compose Profiles

```bash
# Default profile (lightweight, good for Pi)
docker compose up -d

# Desktop profile (higher resource limits)
docker compose --profile desktop up -d

# With local Ollama AI
docker compose --profile with-ollama up -d
```

## Build Multi-Architecture Images

For developers who want to build and publish their own multi-architecture images:

```bash
# Build for AMD64 + ARM64
./scripts/build-multiarch.sh --platforms linux/amd64,linux/arm64

# Build and push to GitHub Container Registry
./scripts/gh-deploy.sh --public
```

## Claude Desktop with Remote Docker

Connect Claude Desktop to MCP Rubber Duck running on a remote system:

```json
{
  "mcpServers": {
    "rubber-duck-remote": {
      "command": "ssh",
      "args": [
        "user@remote-host",
        "docker exec -i mcp-rubber-duck node /app/dist/index.js"
      ]
    }
  }
}
```

## Platform Compatibility

| Platform | Architecture | Status | Notes |
|----------|-------------|---------|-------|
| **macOS Intel** | AMD64 | Full | Via Docker Desktop |
| **macOS Apple Silicon** | ARM64 | Full | Native ARM64 support |
| **Linux x86_64** | AMD64 | Full | Direct Docker support |
| **Linux ARM64** | ARM64 | Full | Servers, Pi 4+ |
| **Raspberry Pi 3+** | ARM64 | Optimized | Memory-limited config |
| **Windows** | AMD64 | Full | Via Docker Desktop + WSL2 |

## Manual Docker Commands

If you prefer not to use docker-compose:

```bash
# Raspberry Pi
docker run -d \
  --name mcp-rubber-duck \
  --memory=512m --cpus=1.5 \
  --env-file .env \
  --restart unless-stopped \
  ghcr.io/nesquikm/mcp-rubber-duck:latest

# Desktop/Server
docker run -d \
  --name mcp-rubber-duck \
  --memory=2g --cpus=4 \
  --env-file .env \
  --restart unless-stopped \
  ghcr.io/nesquikm/mcp-rubber-duck:latest
```
