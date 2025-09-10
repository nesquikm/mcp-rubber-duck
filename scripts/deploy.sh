#!/bin/bash

# MCP Rubber Duck - Universal Deployment Script
# Works on macOS, Linux, Windows (WSL), and Raspberry Pi

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-auto}"
PLATFORM="${PLATFORM:-auto}"

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

print_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Universal deployment script for MCP Rubber Duck
Works on: macOS, Linux, Windows (WSL), Raspberry Pi

OPTIONS:
    -m, --mode MODE         Deployment mode: local, docker, ssh
    -p, --platform PLATFORM Target platform: pi, desktop, auto
    --profile PROFILE       Docker compose profile: lightweight, desktop, with-ollama
    --ssh-host HOST         SSH host for remote deployment
    --dry-run               Show what would be done
    -h, --help              Show this help message

DEPLOYMENT MODES:
    local       - Run from source code (npm start)
    docker      - Use Docker containers (recommended)
    ssh         - Deploy via SSH to remote host

PLATFORMS:
    pi          - Raspberry Pi (optimized for low memory)
    desktop     - Desktop/server (higher resource limits)
    auto        - Auto-detect platform

EXAMPLES:
    # Auto-detect platform and deploy with Docker
    $0
    
    # Deploy to Raspberry Pi with lightweight profile
    $0 --platform pi --profile lightweight
    
    # Deploy to desktop with Ollama support
    $0 --platform desktop --profile with-ollama
    
    # Deploy to remote Raspberry Pi via SSH
    $0 --mode ssh --ssh-host pi@192.168.1.100

EOF
}

# Detect platform
detect_platform() {
    if [[ "$PLATFORM" != "auto" ]]; then
        echo "$PLATFORM"
        return
    fi
    
    # Check system info
    local arch=$(uname -m)
    local system=$(uname -s)
    local mem_kb=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "8000000")
    local mem_gb=$((mem_kb / 1024 / 1024))
    
    # Raspberry Pi detection
    if [[ -f /proc/device-tree/model ]] && grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
        echo "pi"
        return
    fi
    
    # Low memory systems (< 2GB)
    if [[ $mem_gb -lt 2 ]]; then
        echo "pi"
        return
    fi
    
    echo "desktop"
}

# Create environment file based on platform
create_env_file() {
    local platform=$1
    local env_file=".env"
    
    if [[ -f "$env_file" ]]; then
        info "Using existing $env_file file"
        return
    fi
    
    log "Creating environment file for $platform platform..."
    
    if [[ "$platform" == "pi" ]]; then
        cp .env.pi.example "$env_file" 2>/dev/null || cp .env.template "$env_file"
    else
        cp .env.desktop.example "$env_file" 2>/dev/null || cp .env.template "$env_file"
    fi
    
    warn "Please edit $env_file and add your API keys"
}

# Deploy with Docker
deploy_docker() {
    local platform=$1
    local profile=${COMPOSE_PROFILE:-}
    
    log "Deploying with Docker for $platform platform..."
    
    # Set platform-specific defaults
    if [[ "$platform" == "pi" ]]; then
        export DOCKER_CPU_LIMIT="${DOCKER_CPU_LIMIT:-1.5}"
        export DOCKER_MEMORY_LIMIT="${DOCKER_MEMORY_LIMIT:-512M}"
        export DOCKER_MEMORY_RESERVATION="${DOCKER_MEMORY_RESERVATION:-256M}"
        export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=256}"
        profile="${profile:-lightweight}"
    else
        export DOCKER_CPU_LIMIT="${DOCKER_CPU_LIMIT:-4.0}"
        export DOCKER_MEMORY_LIMIT="${DOCKER_MEMORY_LIMIT:-2G}"
        export DOCKER_MEMORY_RESERVATION="${DOCKER_MEMORY_RESERVATION:-1G}"
        export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"
        profile="${profile:-desktop}"
    fi
    
    # Create environment file
    create_env_file "$platform"
    
    # Docker commands
    local compose_cmd="docker compose"
    if [[ -n "$profile" && "$profile" != "default" ]]; then
        compose_cmd="$compose_cmd --profile $profile"
    fi
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would run:"
        info "  $compose_cmd pull"
        info "  $compose_cmd up -d"
        return
    fi
    
    # Pull and start
    log "Pulling Docker images..."
    $compose_cmd pull
    
    log "Starting containers..."
    $compose_cmd up -d
    
    # Show status
    log "Checking container status..."
    docker ps --filter name=mcp-rubber-duck
    
    log "✅ Deployment completed!"
    info "Check logs with: docker logs mcp-rubber-duck"
    info "Stop with: $compose_cmd down"
}

# Deploy via SSH
deploy_ssh() {
    local ssh_host=$1
    
    if [[ -z "$ssh_host" ]]; then
        error "SSH host not specified. Use --ssh-host option."
    fi
    
    log "Deploying to remote host: $ssh_host"
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would deploy to $ssh_host"
        return
    fi
    
    # Copy files to remote host
    log "Copying files to remote host..."
    ssh "$ssh_host" "mkdir -p ~/mcp-rubber-duck"
    scp docker-compose.yml "$ssh_host:~/mcp-rubber-duck/"
    scp .env.template "$ssh_host:~/mcp-rubber-duck/"
    scp scripts/deploy.sh "$ssh_host:~/mcp-rubber-duck/"
    
    # Run deployment on remote host
    log "Running deployment on remote host..."
    ssh "$ssh_host" "cd ~/mcp-rubber-duck && bash deploy.sh --mode docker --platform pi"
    
    log "✅ Remote deployment completed!"
}

# Deploy from source
deploy_local() {
    local platform=$1
    
    log "Deploying from source for $platform platform..."
    
    # Check prerequisites
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
    fi
    
    # Set platform-specific environment
    create_env_file "$platform"
    
    if [[ "$platform" == "pi" ]]; then
        export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=256}"
    else
        export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"
    fi
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would run:"
        info "  npm install"
        info "  npm run build"
        info "  npm start"
        return
    fi
    
    # Build and run
    log "Installing dependencies..."
    npm install
    
    log "Building project..."
    npm run build
    
    log "Starting MCP server..."
    info "MCP Rubber Duck is now running from source"
    npm start
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--mode)
            DEPLOYMENT_MODE="$2"
            shift 2
            ;;
        -p|--platform)
            PLATFORM="$2"
            shift 2
            ;;
        --profile)
            COMPOSE_PROFILE="$2"
            shift 2
            ;;
        --ssh-host)
            SSH_HOST="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Main execution
log "🦆 Starting MCP Rubber Duck deployment"

# Detect platform
DETECTED_PLATFORM=$(detect_platform)
log "Platform: $DETECTED_PLATFORM"

# Auto-detect deployment mode if needed
if [[ "$DEPLOYMENT_MODE" == "auto" ]]; then
    if command -v docker &> /dev/null; then
        DEPLOYMENT_MODE="docker"
    else
        DEPLOYMENT_MODE="local"
    fi
fi

info "Deployment mode: $DEPLOYMENT_MODE"
info "Target platform: $DETECTED_PLATFORM"

# Deploy based on mode
case $DEPLOYMENT_MODE in
    docker)
        deploy_docker "$DETECTED_PLATFORM"
        ;;
    ssh)
        deploy_ssh "${SSH_HOST:-}"
        ;;
    local)
        deploy_local "$DETECTED_PLATFORM"
        ;;
    *)
        error "Unknown deployment mode: $DEPLOYMENT_MODE"
        ;;
esac

log "🎉 Deployment completed successfully!"