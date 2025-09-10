#!/bin/bash

# MCP Rubber Duck - Raspberry Pi Deployment Script
# This script deploys MCP Rubber Duck on Raspberry Pi using Docker Compose

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="${PROJECT_NAME:-mcp-rubber-duck}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.raspbian.yml}"
ENV_FILE="${ENV_FILE:-.env}"
DATA_DIR="${DATA_DIR:-./data}"
CONFIG_DIR="${CONFIG_DIR:-./config}"

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
Usage: $0 [OPTIONS] [COMMAND]

Deploy and manage MCP Rubber Duck on Raspberry Pi

COMMANDS:
    deploy          Deploy the application (default)
    update          Update the application (pull + restart)
    stop            Stop the application
    start           Start the application
    restart         Restart the application
    logs            Show application logs
    status          Show application status
    clean           Clean up unused Docker resources
    health          Check application health
    backup          Backup configuration and data

OPTIONS:
    -f, --compose-file FILE   Docker compose file (default: docker-compose.raspbian.yml)
    -e, --env-file FILE       Environment file (default: .env)
    --pull                    Pull latest images before deploy
    --build                   Build image locally before deploy
    --with-ollama            Include Ollama service
    -v, --verbose            Verbose output
    -h, --help               Show this help message

EXAMPLES:
    # Deploy with default settings
    $0 deploy
    
    # Deploy with Ollama support
    $0 --with-ollama deploy
    
    # Update to latest version
    $0 update
    
    # View logs in real-time
    $0 logs -f
    
    # Check health status
    $0 health

EOF
}

# System checks
check_system() {
    log "Performing system checks..."
    
    # Check if we're on ARM (Raspberry Pi)
    ARCH=$(uname -m)
    if [[ "$ARCH" != "armv7l" && "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
        warn "This script is optimized for Raspberry Pi (ARM). Current architecture: $ARCH"
    fi
    
    # Check available memory
    TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))
    
    if [[ $TOTAL_MEM_MB -lt 1024 ]]; then
        warn "Low memory detected: ${TOTAL_MEM_MB}MB. Consider adjusting memory limits."
    fi
    
    info "System: $ARCH, Memory: ${TOTAL_MEM_MB}MB"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Run setup-docker-raspbian.sh first."
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed. Run setup-docker-raspbian.sh first."
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running. Try: sudo systemctl start docker"
    fi
    
    log "✅ System checks passed"
}

# Environment setup
setup_environment() {
    log "Setting up environment..."
    
    # Create directories
    mkdir -p "$DATA_DIR" "$CONFIG_DIR"
    
    # Create .env file if it doesn't exist
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f ".env.raspbian.template" ]]; then
            log "Creating $ENV_FILE from template"
            cp .env.raspbian.template "$ENV_FILE"
            warn "Please edit $ENV_FILE and add your API keys before proceeding"
            
            # Check if nano is available for editing
            if command -v nano &> /dev/null; then
                read -p "Would you like to edit $ENV_FILE now? (y/N): " -r
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    nano "$ENV_FILE"
                fi
            fi
        else
            error "No $ENV_FILE found and no .env.raspbian.template available"
        fi
    fi
    
    # Validate .env file has required keys
    if ! grep -q "OPENAI_API_KEY=sk-" "$ENV_FILE" 2>/dev/null; then
        warn "OPENAI_API_KEY not found in $ENV_FILE. Please configure your API keys."
    fi
    
    log "✅ Environment setup complete"
}

# Deployment functions
deploy() {
    log "Starting deployment of MCP Rubber Duck..."
    
    # Stop existing containers
    if docker-compose -f "$COMPOSE_FILE" ps -q 2>/dev/null | grep -q .; then
        log "Stopping existing containers..."
        docker-compose -f "$COMPOSE_FILE" down
    fi
    
    # Pull images if requested
    if [[ "${PULL_IMAGES:-false}" == "true" ]]; then
        log "Pulling latest Docker images..."
        docker-compose -f "$COMPOSE_FILE" pull
    fi
    
    # Build locally if requested
    if [[ "${BUILD_LOCAL:-false}" == "true" ]]; then
        log "Building Docker image locally..."
        docker-compose -f "$COMPOSE_FILE" build
    fi
    
    # Start services
    log "Starting services..."
    if [[ "${WITH_OLLAMA:-false}" == "true" ]]; then
        docker-compose -f "$COMPOSE_FILE" --profile with-ollama up -d
    else
        docker-compose -f "$COMPOSE_FILE" up -d
    fi
    
    # Wait for services to be ready
    log "Waiting for services to start..."
    sleep 10
    
    # Check health
    check_health
    
    log "✅ Deployment completed successfully!"
    show_status
}

update() {
    log "Updating MCP Rubber Duck..."
    PULL_IMAGES=true deploy
}

stop() {
    log "Stopping MCP Rubber Duck..."
    docker-compose -f "$COMPOSE_FILE" down
    log "✅ Services stopped"
}

start() {
    log "Starting MCP Rubber Duck..."
    if [[ "${WITH_OLLAMA:-false}" == "true" ]]; then
        docker-compose -f "$COMPOSE_FILE" --profile with-ollama up -d
    else
        docker-compose -f "$COMPOSE_FILE" up -d
    fi
    log "✅ Services started"
}

restart() {
    log "Restarting MCP Rubber Duck..."
    docker-compose -f "$COMPOSE_FILE" restart
    log "✅ Services restarted"
}

show_logs() {
    docker-compose -f "$COMPOSE_FILE" logs "$@"
}

show_status() {
    log "Service Status:"
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo
    log "Resource Usage:"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
    
    echo
    log "Health Status:"
    check_health
}

check_health() {
    local container_name="mcp-rubber-duck"
    
    if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
        local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "unknown")
        
        case "$health_status" in
            "healthy")
                log "✅ Application is healthy"
                return 0
                ;;
            "unhealthy")
                warn "❌ Application is unhealthy"
                return 1
                ;;
            "starting")
                info "🔄 Application is starting..."
                return 0
                ;;
            *)
                info "ℹ️  Health status: $health_status"
                return 0
                ;;
        esac
    else
        warn "❌ Container is not running"
        return 1
    fi
}

clean() {
    log "Cleaning up Docker resources..."
    
    # Remove stopped containers
    docker container prune -f
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes (ask for confirmation)
    read -p "Remove unused volumes? This may delete data! (y/N): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker volume prune -f
    fi
    
    # Remove unused networks
    docker network prune -f
    
    log "✅ Cleanup completed"
}

backup() {
    local backup_dir="backup_$(date +%Y%m%d_%H%M%S)"
    log "Creating backup in $backup_dir..."
    
    mkdir -p "$backup_dir"
    
    # Backup configuration
    if [[ -f "$ENV_FILE" ]]; then
        cp "$ENV_FILE" "$backup_dir/"
    fi
    
    if [[ -d "$CONFIG_DIR" ]]; then
        cp -r "$CONFIG_DIR" "$backup_dir/"
    fi
    
    # Backup data
    if [[ -d "$DATA_DIR" ]]; then
        cp -r "$DATA_DIR" "$backup_dir/"
    fi
    
    # Create archive
    tar -czf "${backup_dir}.tar.gz" "$backup_dir"
    rm -rf "$backup_dir"
    
    log "✅ Backup created: ${backup_dir}.tar.gz"
}

# Parse command line arguments
COMMAND="deploy"
while [[ $# -gt 0 ]]; do
    case $1 in
        deploy|update|stop|start|restart|logs|status|clean|health|backup)
            COMMAND="$1"
            shift
            ;;
        -f|--compose-file)
            COMPOSE_FILE="$2"
            shift 2
            ;;
        -e|--env-file)
            ENV_FILE="$2"
            shift 2
            ;;
        --pull)
            PULL_IMAGES="true"
            shift
            ;;
        --build)
            BUILD_LOCAL="true"
            shift
            ;;
        --with-ollama)
            WITH_OLLAMA="true"
            shift
            ;;
        -v|--verbose)
            set -x
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            # Pass remaining args to docker-compose logs
            if [[ "$COMMAND" == "logs" ]]; then
                break
            fi
            error "Unknown option: $1"
            ;;
    esac
done

# Validate compose file exists
if [[ ! -f "$COMPOSE_FILE" ]]; then
    error "Compose file not found: $COMPOSE_FILE"
fi

# Main execution
case "$COMMAND" in
    deploy)
        check_system
        setup_environment
        deploy
        ;;
    update)
        check_system
        update
        ;;
    stop)
        stop
        ;;
    start)
        start
        ;;
    restart)
        restart
        ;;
    logs)
        show_logs "$@"
        ;;
    status)
        show_status
        ;;
    clean)
        clean
        ;;
    health)
        check_health
        ;;
    backup)
        backup
        ;;
    *)
        error "Unknown command: $COMMAND"
        ;;
esac