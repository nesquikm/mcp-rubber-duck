#!/bin/bash

# MCP Rubber Duck - Multi-Architecture Build Script
# This script builds Docker images for multiple architectures including Raspberry Pi

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="${IMAGE_NAME:-mcp-rubber-duck}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-}"
PUSH_IMAGE="${PUSH_IMAGE:-false}"
USE_GITHUB="${USE_GITHUB:-false}"

# Supported platforms for Raspberry Pi (Pi 3+ supports ARM64)
PLATFORMS="linux/amd64,linux/arm64"

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

Build multi-architecture Docker images for MCP Rubber Duck

OPTIONS:
    -n, --name NAME         Docker image name (default: mcp-rubber-duck)
    -t, --tag TAG           Docker image tag (default: latest)
    -r, --registry REGISTRY Docker registry (e.g., your-username, ghcr.io/username)
    -p, --push              Push image to registry after build
    --gh, --github          Use GitHub Container Registry (ghcr.io) with gh CLI
    --local                 Build for local architecture only (faster)
    --arm-only              Build for ARM architectures only (Pi optimized)
    -h, --help              Show this help message

EXAMPLES:
    # Build for all architectures locally
    $0 --name mcp-rubber-duck --tag v1.0.0
    
    # Build and push to Docker Hub
    $0 --name yourusername/mcp-rubber-duck --push
    
    # Build and push to GitHub Container Registry
    $0 --registry ghcr.io/yourusername --push
    
    # Build and push to GitHub (auto-detects username)
    $0 --github --push
    
    # Build only for Raspberry Pi (ARM)
    $0 --arm-only --name mcp-rubber-duck-arm
    
    # Build for local development (current architecture only)
    $0 --local

ENVIRONMENT VARIABLES:
    IMAGE_NAME      Override default image name
    IMAGE_TAG       Override default tag
    DOCKER_REGISTRY Override default registry
    PUSH_IMAGE      Set to 'true' to push after build
    USE_GITHUB      Set to 'true' to use GitHub Container Registry

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -r|--registry)
            DOCKER_REGISTRY="$2"
            shift 2
            ;;
        -p|--push)
            PUSH_IMAGE="true"
            shift
            ;;
        --gh|--github)
            USE_GITHUB="true"
            shift
            ;;
        --local)
            PLATFORMS=""
            shift
            ;;
        --arm-only)
            PLATFORMS="linux/arm64,linux/arm/v7"
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

# GitHub CLI integration
if [[ "$USE_GITHUB" == "true" ]]; then
    # Check if gh is installed
    if ! command -v gh &> /dev/null; then
        error "GitHub CLI (gh) is not installed. Install from: https://cli.github.com/"
    fi
    
    # Check if user is authenticated
    if ! gh auth status &> /dev/null; then
        error "Not authenticated with GitHub. Run: gh auth login"
    fi
    
    # Get GitHub username
    GITHUB_USER=$(gh api user --jq .login 2>/dev/null)
    if [[ -z "$GITHUB_USER" ]]; then
        error "Could not get GitHub username. Check your gh authentication."
    fi
    
    # Get repository name (fallback to mcp-rubber-duck)
    REPO_NAME=$(gh repo view --json name --jq .name 2>/dev/null || echo "mcp-rubber-duck")
    
    # Set up GitHub Container Registry
    DOCKER_REGISTRY="ghcr.io/$GITHUB_USER"
    IMAGE_NAME="$REPO_NAME"
    PUSH_IMAGE="true"  # Auto-enable push for GitHub
    
    log "Using GitHub Container Registry: ghcr.io/$GITHUB_USER/$REPO_NAME"
    
    # Authenticate Docker with ghcr.io using gh
    info "Authenticating Docker with GitHub Container Registry..."
    if ! gh auth token | docker login ghcr.io -u "$GITHUB_USER" --password-stdin; then
        error "Failed to authenticate Docker with ghcr.io"
    fi
fi

# Build full image name
if [[ -n "$DOCKER_REGISTRY" ]]; then
    FULL_IMAGE_NAME="${DOCKER_REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
else
    FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"
fi

# Validate Docker is installed
if ! command -v docker &> /dev/null; then
    error "Docker is not installed or not in PATH"
fi

# Check if buildx is available
if ! docker buildx version &> /dev/null; then
    error "Docker buildx is not available. Please update Docker to a newer version."
fi

# Change to project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

log "Starting multi-architecture build for MCP Rubber Duck"
info "Image name: $FULL_IMAGE_NAME"
info "Platforms: ${PLATFORMS:-$(uname -m)}"
info "Push to registry: $PUSH_IMAGE"

# Check if Dockerfile exists
if [[ ! -f "Dockerfile" ]]; then
    error "Dockerfile not found in project root"
fi

# Create buildx builder if it doesn't exist
BUILDER_NAME="mcp-multiarch"
if ! docker buildx inspect "$BUILDER_NAME" &> /dev/null; then
    log "Creating buildx builder: $BUILDER_NAME"
    docker buildx create --name "$BUILDER_NAME" --platform "$PLATFORMS" --use
else
    log "Using existing buildx builder: $BUILDER_NAME"
    docker buildx use "$BUILDER_NAME"
fi

# Ensure builder is running
log "Starting buildx builder"
docker buildx inspect --bootstrap

# Build command
BUILD_ARGS=(
    "buildx" "build"
    "--builder" "$BUILDER_NAME"
    "-t" "$FULL_IMAGE_NAME"
    "--progress" "plain"
)

# Add platform specification if not local build
if [[ -n "$PLATFORMS" ]]; then
    BUILD_ARGS+=("--platform" "$PLATFORMS")
fi

# Add push flag if requested
if [[ "$PUSH_IMAGE" == "true" ]]; then
    BUILD_ARGS+=("--push")
    info "Image will be pushed to registry after build"
else
    BUILD_ARGS+=("--load")
    info "Image will be loaded to local Docker daemon"
fi

# Add context
BUILD_ARGS+=(".")

# Print build command for debugging
info "Build command: docker ${BUILD_ARGS[*]}"

# Run the build
log "Building Docker image..."
if docker "${BUILD_ARGS[@]}"; then
    log "✅ Build completed successfully!"
    
    if [[ "$PUSH_IMAGE" == "true" ]]; then
        log "✅ Image pushed to registry: $FULL_IMAGE_NAME"
        
        # Show GitHub package info if using GitHub
        if [[ "$USE_GITHUB" == "true" ]]; then
            log "📦 GitHub Package Information:"
            if gh api "user/packages/container/$IMAGE_NAME" &> /dev/null; then
                echo "   Package URL: https://github.com/$GITHUB_USER/packages/container/package/$IMAGE_NAME"
                echo "   Visibility: $(gh api "user/packages/container/$IMAGE_NAME" --jq .visibility)"
                echo "   Downloads: $(gh api "user/packages/container/$IMAGE_NAME/versions" --jq 'map(.metadata.container.tags | length) | add')"
                
                # Show how to make package public if it's private
                VISIBILITY=$(gh api "user/packages/container/$IMAGE_NAME" --jq .visibility 2>/dev/null)
                if [[ "$VISIBILITY" == "private" ]]; then
                    info "To make package public: gh api --method PATCH user/packages/container/$IMAGE_NAME --field visibility=public"
                fi
            else
                warn "Package info not yet available (may take a moment to appear)"
            fi
        fi
    else
        log "✅ Image loaded locally: $FULL_IMAGE_NAME"
        
        # Show image info
        if [[ -z "$PLATFORMS" ]]; then
            info "Image details:"
            docker images "$FULL_IMAGE_NAME" | head -2
        fi
    fi
    
    # Show next steps
    echo
    log "🚀 Next steps for Raspberry Pi deployment:"
    echo "   1. Copy this image to your Raspberry Pi:"
    if [[ "$PUSH_IMAGE" == "true" ]]; then
        echo "      docker pull $FULL_IMAGE_NAME"
    else
        echo "      docker save $FULL_IMAGE_NAME | ssh pi@your-pi-ip 'docker load'"
    fi
    echo "   2. Use docker-compose.yml to deploy (works on all platforms)"
    echo "   3. Configure your .env file with API keys"
    
else
    error "❌ Build failed!"
fi

# Cleanup
log "Build process completed"