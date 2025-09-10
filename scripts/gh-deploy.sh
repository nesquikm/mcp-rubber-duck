#!/bin/bash

# MCP Rubber Duck - GitHub Container Registry Deployment Script
# This script simplifies deployment using GitHub CLI and GitHub Container Registry

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_TAG="${IMAGE_TAG:-latest}"
MAKE_PUBLIC="${MAKE_PUBLIC:-false}"
BUILD_PLATFORMS="${BUILD_PLATFORMS:-linux/amd64,linux/arm64,linux/arm/v7}"

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

Deploy MCP Rubber Duck to GitHub Container Registry using GitHub CLI

OPTIONS:
    -t, --tag TAG           Docker image tag (default: latest)
    --public                Make package public after push
    --platforms PLATFORMS   Target platforms (default: linux/amd64,linux/arm64,linux/arm/v7)
    --local-only            Build for local architecture only (faster testing)
    --dry-run              Show what would be done without executing
    -v, --verbose          Verbose output
    -h, --help             Show this help message

EXAMPLES:
    # Deploy latest version to GitHub Container Registry
    $0
    
    # Deploy with specific tag
    $0 --tag v1.2.0
    
    # Deploy and make package public
    $0 --public
    
    # Local development build
    $0 --local-only --tag dev
    
    # See what would happen
    $0 --dry-run

REQUIREMENTS:
    - GitHub CLI (gh) installed and authenticated
    - Docker with buildx support
    - Repository must be initialized as git repo
    - Must have push access to repository

EOF
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if gh is installed
    if ! command -v gh &> /dev/null; then
        error "GitHub CLI (gh) is not installed. Install from: https://cli.github.com/"
    fi
    
    # Check if authenticated with GitHub
    if ! gh auth status &> /dev/null; then
        error "Not authenticated with GitHub. Run: gh auth login"
    fi
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
    fi
    
    # Check if buildx is available
    if ! docker buildx version &> /dev/null; then
        error "Docker buildx is not available. Please update Docker to a newer version."
    fi
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir &> /dev/null; then
        error "This script must be run from within a git repository"
    fi
    
    log "✅ All prerequisites satisfied"
}

# Get GitHub and repository information
get_github_info() {
    log "Getting GitHub repository information..."
    
    # Get GitHub username
    GITHUB_USER=$(gh api user --jq .login 2>/dev/null)
    if [[ -z "$GITHUB_USER" ]]; then
        error "Could not get GitHub username. Check your gh authentication."
    fi
    
    # Try to get repository info from current directory
    if gh repo view &> /dev/null; then
        REPO_NAME=$(gh repo view --json name --jq .name)
        REPO_OWNER=$(gh repo view --json owner --jq .owner.login)
        REPO_URL=$(gh repo view --json url --jq .url)
        
        # Check if we have push access
        if ! gh api "repos/$REPO_OWNER/$REPO_NAME" --jq .permissions.push | grep -q true; then
            warn "You may not have push access to $REPO_OWNER/$REPO_NAME"
        fi
    else
        # Fallback to git remote
        REPO_NAME=$(basename "$(git rev-parse --show-toplevel)" 2>/dev/null || echo "mcp-rubber-duck")
        REPO_OWNER="$GITHUB_USER"
        REPO_URL="https://github.com/$REPO_OWNER/$REPO_NAME"
        warn "Could not get repository info from gh. Using fallback: $REPO_OWNER/$REPO_NAME"
    fi
    
    # Build image name
    IMAGE_NAME="ghcr.io/$REPO_OWNER/$REPO_NAME"
    
    info "GitHub User: $GITHUB_USER"
    info "Repository: $REPO_OWNER/$REPO_NAME"
    info "Image name: $IMAGE_NAME:$IMAGE_TAG"
    info "Repository URL: $REPO_URL"
    
    log "✅ GitHub information gathered"
}

# Authenticate Docker with GitHub Container Registry
authenticate_docker() {
    log "Authenticating Docker with GitHub Container Registry..."
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would authenticate Docker with ghcr.io"
        return
    fi
    
    if ! gh auth token | docker login ghcr.io -u "$GITHUB_USER" --password-stdin; then
        error "Failed to authenticate Docker with ghcr.io"
    fi
    
    log "✅ Docker authenticated with ghcr.io"
}

# Build and push Docker image
build_and_push() {
    log "Building and pushing Docker image..."
    
    # Determine platforms
    local platforms="$BUILD_PLATFORMS"
    if [[ "${LOCAL_ONLY:-false}" == "true" ]]; then
        platforms=""
        info "Building for local architecture only"
    fi
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would build and push:"
        info "  Image: $IMAGE_NAME:$IMAGE_TAG"
        info "  Platforms: ${platforms:-$(uname -m)}"
        return
    fi
    
    # Use the enhanced build script with GitHub support
    local build_args=(
        "./scripts/build-multiarch.sh"
        "--github"
        "--tag" "$IMAGE_TAG"
    )
    
    if [[ "${LOCAL_ONLY:-false}" == "true" ]]; then
        build_args+=("--local")
    fi
    
    if [[ "${VERBOSE:-false}" == "true" ]]; then
        build_args+=("--verbose")
    fi
    
    log "Running: ${build_args[*]}"
    if "${build_args[@]}"; then
        log "✅ Build and push completed successfully"
    else
        error "❌ Build and push failed"
    fi
}

# Manage package visibility and settings
manage_package() {
    log "Managing GitHub package settings..."
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would manage package settings"
        return
    fi
    
    # Wait a moment for package to appear
    sleep 5
    
    # Check if package exists
    if ! gh api "user/packages/container/$REPO_NAME" &> /dev/null; then
        warn "Package not yet available. It may take a moment to appear in GitHub."
        return
    fi
    
    # Make package public if requested
    if [[ "$MAKE_PUBLIC" == "true" ]]; then
        log "Making package public..."
        if gh api --method PATCH "user/packages/container/$REPO_NAME" --field visibility=public; then
            log "✅ Package is now public"
        else
            warn "Failed to make package public (may require manual action)"
        fi
    fi
    
    # Link package to repository
    log "Linking package to repository..."
    if gh api --method PUT "user/packages/container/$REPO_NAME/restore" --field token="$(gh auth token)" &> /dev/null; then
        log "✅ Package linked to repository"
    else
        info "Package repository linking may require manual action"
    fi
    
    log "✅ Package management completed"
}

# Show package information and next steps
show_package_info() {
    log "📦 Package Information:"
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Package would be available at:"
        info "  URL: https://github.com/$REPO_OWNER/packages/container/package/$REPO_NAME"
        info "  Pull command: docker pull ghcr.io/$REPO_OWNER/$REPO_NAME:$IMAGE_TAG"
        return
    fi
    
    # Package URL
    echo "   📍 Package URL: https://github.com/$REPO_OWNER/packages/container/package/$REPO_NAME"
    
    # Pull command
    echo "   🐳 Pull command: docker pull $IMAGE_NAME:$IMAGE_TAG"
    
    # Try to get package info
    if gh api "user/packages/container/$REPO_NAME" &> /dev/null; then
        local visibility
        local updated
        visibility=$(gh api "user/packages/container/$REPO_NAME" --jq .visibility 2>/dev/null || echo "unknown")
        updated=$(gh api "user/packages/container/$REPO_NAME" --jq .updated_at 2>/dev/null || echo "unknown")
        
        echo "   👁️  Visibility: $visibility"
        echo "   📅 Updated: $updated"
        
        # Show versions
        local versions
        versions=$(gh api "user/packages/container/$REPO_NAME/versions" --jq 'length' 2>/dev/null || echo "0")
        echo "   🏷️  Versions: $versions"
        
    else
        warn "Package information not yet available"
    fi
    
    echo
    log "🚀 Multi-Platform Deployment:"
    echo "   1. On your deployment target, update docker-compose.yml (or create .env):"
    echo "      DOCKER_IMAGE=$IMAGE_NAME:$IMAGE_TAG"
    echo "   2. Pull and run (works on all platforms):"
    echo "      docker compose pull"
    echo "      docker compose up -d"
    
    if [[ "$MAKE_PUBLIC" != "true" ]]; then
        echo
        info "💡 To make package public for easier access:"
        echo "   gh api --method PATCH user/packages/container/$REPO_NAME --field visibility=public"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --public)
            MAKE_PUBLIC="true"
            shift
            ;;
        --platforms)
            BUILD_PLATFORMS="$2"
            shift 2
            ;;
        --local-only)
            LOCAL_ONLY="true"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        -v|--verbose)
            VERBOSE="true"
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
log "🦆 Starting GitHub Container Registry deployment for MCP Rubber Duck"

check_prerequisites
get_github_info
authenticate_docker
build_and_push
manage_package
show_package_info

log "🎉 GitHub deployment completed successfully!"