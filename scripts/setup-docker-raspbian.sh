#!/bin/bash

# MCP Rubber Duck - Raspberry Pi Docker Setup Script
# This script installs and configures Docker and Docker Compose on Raspberry Pi

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_COMPOSE_VERSION="${DOCKER_COMPOSE_VERSION:-2.24.0}"
SETUP_SWAP="${SETUP_SWAP:-true}"
SWAP_SIZE="${SWAP_SIZE:-1G}"
ENABLE_MEMORY_CGROUPS="${ENABLE_MEMORY_CGROUPS:-true}"

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

Setup Docker and Docker Compose on Raspberry Pi for MCP Rubber Duck

OPTIONS:
    --no-swap                 Don't setup swap file
    --swap-size SIZE          Swap file size (default: 1G)
    --no-memory-cgroups       Don't enable memory cgroups
    --docker-compose-version  Docker Compose version (default: 2.24.0)
    --dry-run                 Show what would be done without executing
    -y, --yes                 Assume yes to all prompts
    -h, --help               Show this help message

EXAMPLES:
    # Full setup with defaults
    $0
    
    # Setup without swap
    $0 --no-swap
    
    # Custom swap size
    $0 --swap-size 2G
    
    # Dry run to see what would be done
    $0 --dry-run

REQUIREMENTS:
    - Raspberry Pi running Raspberry Pi OS (Debian-based)
    - Internet connection
    - sudo privileges

EOF
}

# System detection
detect_system() {
    log "Detecting system..."
    
    # Check if we're on Raspberry Pi
    if [[ -f /proc/device-tree/model ]] && grep -q "Raspberry Pi" /proc/device-tree/model; then
        PI_MODEL=$(tr -d '\0' < /proc/device-tree/model)
        log "Detected: $PI_MODEL"
    else
        warn "This doesn't appear to be a Raspberry Pi"
    fi
    
    # Check OS
    if [[ ! -f /etc/debian_version ]]; then
        error "This script requires a Debian-based OS (Raspberry Pi OS recommended)"
    fi
    
    # Check architecture
    ARCH=$(uname -m)
    case $ARCH in
        armv7l|armv6l)
            DOCKER_ARCH="armhf"
            ;;
        aarch64|arm64)
            DOCKER_ARCH="arm64"
            ;;
        x86_64)
            DOCKER_ARCH="amd64"
            warn "Running on x86_64, this setup is optimized for ARM"
            ;;
        *)
            error "Unsupported architecture: $ARCH"
            ;;
    esac
    
    info "Architecture: $ARCH (Docker arch: $DOCKER_ARCH)"
    
    # Check memory
    TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))
    info "Total memory: ${TOTAL_MEM_MB}MB"
    
    # Recommendations based on memory
    if [[ $TOTAL_MEM_MB -lt 1024 ]]; then
        warn "Low memory detected. Consider enabling swap and limiting container memory."
    fi
}

# Update system
update_system() {
    log "Updating system packages..."
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would update system packages"
        return
    fi
    
    sudo apt-get update
    sudo apt-get upgrade -y
    
    # Install prerequisites
    sudo apt-get install -y \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release \
        software-properties-common \
        git \
        htop \
        nano
    
    log "✅ System updated"
}

# Setup memory cgroups
setup_memory_cgroups() {
    if [[ "${ENABLE_MEMORY_CGROUPS}" != "true" ]]; then
        info "Skipping memory cgroups setup"
        return
    fi
    
    log "Setting up memory cgroups..."
    
    local cmdline_file="/boot/cmdline.txt"
    local boot_config="/boot/config.txt"
    
    # Check if running on newer Raspberry Pi OS with /boot/firmware
    if [[ -f "/boot/firmware/cmdline.txt" ]]; then
        cmdline_file="/boot/firmware/cmdline.txt"
        boot_config="/boot/firmware/config.txt"
    fi
    
    if [[ ! -f "$cmdline_file" ]]; then
        warn "Cannot find cmdline.txt, skipping cgroups setup"
        return
    fi
    
    # Check if cgroups are already enabled
    if grep -q "cgroup_enable=memory" "$cmdline_file"; then
        info "Memory cgroups already enabled"
    else
        log "Enabling memory cgroups..."
        
        if [[ "${DRY_RUN:-false}" == "true" ]]; then
            info "DRY RUN: Would enable memory cgroups in $cmdline_file"
        else
            # Backup original file
            sudo cp "$cmdline_file" "$cmdline_file.backup.$(date +%Y%m%d_%H%M%S)"
            
            # Add cgroup parameters
            sudo sed -i '$ s/$/ cgroup_enable=cpuset cgroup_enable=memory cgroup_memory=1/' "$cmdline_file"
            
            info "Memory cgroups enabled. Reboot required for changes to take effect."
            REBOOT_REQUIRED=true
        fi
    fi
    
    log "✅ Memory cgroups configured"
}

# Setup swap
setup_swap() {
    if [[ "${SETUP_SWAP}" != "true" ]]; then
        info "Skipping swap setup"
        return
    fi
    
    log "Setting up swap file ($SWAP_SIZE)..."
    
    # Check if swap is already active
    if swapon --show | grep -q "/swapfile"; then
        info "Swap file already exists and is active"
        return
    fi
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would create ${SWAP_SIZE} swap file"
        return
    fi
    
    # Create swap file
    if [[ ! -f /swapfile ]]; then
        log "Creating swap file..."
        sudo fallocate -l "$SWAP_SIZE" /swapfile
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile
    fi
    
    # Enable swap
    sudo swapon /swapfile
    
    # Add to fstab for persistence
    if ! grep -q "/swapfile" /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    
    # Configure swappiness (how aggressively to use swap)
    echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
    
    log "✅ Swap configured: $(swapon --show)"
}

# Install Docker
install_docker() {
    log "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | sed 's/,//')
        info "Docker already installed: $DOCKER_VERSION"
        
        # Check if user is in docker group
        if groups "$USER" | grep -q docker; then
            info "User $USER is already in docker group"
        else
            log "Adding user $USER to docker group..."
            if [[ "${DRY_RUN:-false}" != "true" ]]; then
                sudo usermod -aG docker "$USER"
                info "Please log out and log back in for group changes to take effect"
            fi
        fi
        return
    fi
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would install Docker"
        return
    fi
    
    # Install Docker using convenience script
    log "Downloading Docker installation script..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    
    log "Installing Docker..."
    sudo sh get-docker.sh
    
    # Add user to docker group
    sudo usermod -aG docker "$USER"
    
    # Enable and start Docker service
    sudo systemctl enable docker
    sudo systemctl start docker
    
    # Cleanup
    rm get-docker.sh
    
    # Configure Docker for Raspberry Pi
    configure_docker()
    
    log "✅ Docker installed successfully"
    info "Please log out and log back in for group changes to take effect"
}

# Configure Docker for Raspberry Pi
configure_docker() {
    log "Configuring Docker for Raspberry Pi..."
    
    # Create Docker daemon configuration
    local docker_config="/etc/docker/daemon.json"
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would configure Docker daemon"
        return
    fi
    
    # Create Docker configuration
    cat << 'EOF' | sudo tee "$docker_config"
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": {
      "hard": 64000,
      "soft": 32000
    }
  }
}
EOF
    
    # Restart Docker to apply configuration
    sudo systemctl restart docker
    
    log "✅ Docker configured for Raspberry Pi"
}

# Install Docker Compose
install_docker_compose() {
    log "Installing Docker Compose..."
    
    if command -v docker-compose &> /dev/null; then
        COMPOSE_VERSION=$(docker-compose --version | cut -d' ' -f4 | sed 's/,//')
        info "Docker Compose already installed: $COMPOSE_VERSION"
        return
    fi
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would install Docker Compose v$DOCKER_COMPOSE_VERSION"
        return
    fi
    
    # Install Docker Compose
    case $DOCKER_ARCH in
        armhf|arm64)
            # For ARM, install via pip
            log "Installing Docker Compose via pip (ARM optimization)..."
            sudo apt-get install -y python3-pip python3-dev libffi-dev
            sudo pip3 install docker-compose=="$DOCKER_COMPOSE_VERSION"
            ;;
        amd64)
            # For x86_64, download binary
            log "Downloading Docker Compose binary..."
            sudo curl -L "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
                -o /usr/local/bin/docker-compose
            sudo chmod +x /usr/local/bin/docker-compose
            ;;
    esac
    
    # Verify installation
    docker-compose --version
    
    log "✅ Docker Compose installed successfully"
}

# Performance optimizations
optimize_system() {
    log "Applying Raspberry Pi optimizations..."
    
    if [[ "${DRY_RUN:-false}" == "true" ]]; then
        info "DRY RUN: Would apply system optimizations"
        return
    fi
    
    # GPU memory split (give more RAM to system)
    echo 'gpu_mem=16' | sudo tee -a /boot/config.txt
    
    # Disable unnecessary services to save memory
    sudo systemctl disable bluetooth
    sudo systemctl disable hciuart
    
    # Configure log rotation
    cat << 'EOF' | sudo tee /etc/logrotate.d/docker-containers
/var/lib/docker/containers/*/*.log {
    rotate 3
    daily
    compress
    size=10M
    missingok
    delaycompress
    copytruncate
}
EOF
    
    log "✅ System optimizations applied"
}

# Verification
verify_installation() {
    log "Verifying installation..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed or not in PATH"
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed or not in PATH"
    fi
    
    # Test Docker (if not dry run)
    if [[ "${DRY_RUN:-false}" != "true" ]]; then
        log "Testing Docker installation..."
        if ! docker run --rm hello-world &> /dev/null; then
            warn "Docker test failed. You may need to log out and log back in."
        else
            log "Docker test successful"
        fi
    fi
    
    log "✅ Installation verified"
}

# Summary and next steps
show_summary() {
    log "🎉 Setup completed successfully!"
    
    echo
    info "Installation Summary:"
    echo "  • Docker: $(docker --version 2>/dev/null || echo 'Installed')"
    echo "  • Docker Compose: $(docker-compose --version 2>/dev/null || echo 'Installed')"
    echo "  • Memory cgroups: $(grep -q 'cgroup_enable=memory' /boot/cmdline.txt 2>/dev/null && echo 'Enabled' || echo 'Disabled')"
    echo "  • Swap: $(swapon --show | grep -q '/swapfile' && echo 'Enabled' || echo 'Disabled')"
    
    echo
    log "Next steps:"
    echo "  1. Log out and log back in to apply group changes"
    if [[ "${REBOOT_REQUIRED:-false}" == "true" ]]; then
        echo "  2. Reboot to enable memory cgroups: sudo reboot"
        echo "  3. After reboot, deploy MCP Rubber Duck:"
    else
        echo "  2. Deploy MCP Rubber Duck:"
    fi
    echo "     ./scripts/deploy-raspbian.sh"
    echo "  4. Edit .env file with your API keys"
    echo "  5. Monitor with: docker stats"
    
    echo
    log "Useful commands:"
    echo "  • Check Docker status: sudo systemctl status docker"
    echo "  • View Docker logs: sudo journalctl -u docker.service"
    echo "  • Monitor resources: htop"
    echo "  • Check memory: free -h"
    echo "  • Check swap: swapon --show"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-swap)
            SETUP_SWAP="false"
            shift
            ;;
        --swap-size)
            SWAP_SIZE="$2"
            shift 2
            ;;
        --no-memory-cgroups)
            ENABLE_MEMORY_CGROUPS="false"
            shift
            ;;
        --docker-compose-version)
            DOCKER_COMPOSE_VERSION="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        -y|--yes)
            ASSUME_YES="true"
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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
    error "This script should not be run as root. Run as your regular user."
fi

# Check for sudo access
if ! sudo -n true 2>/dev/null; then
    error "This script requires sudo access. Please ensure you can run sudo commands."
fi

# Confirmation prompt
if [[ "${ASSUME_YES:-false}" != "true" && "${DRY_RUN:-false}" != "true" ]]; then
    echo "This script will:"
    echo "  • Update system packages"
    echo "  • Install Docker and Docker Compose"
    echo "  • Configure memory cgroups (requires reboot)"
    echo "  • Setup swap file ($SWAP_SIZE)"
    echo "  • Apply Raspberry Pi optimizations"
    echo
    read -p "Continue? (y/N): " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Setup cancelled by user"
        exit 0
    fi
fi

# Main execution
log "Starting Raspberry Pi Docker setup for MCP Rubber Duck"

detect_system
update_system
setup_memory_cgroups
setup_swap
install_docker
install_docker_compose
optimize_system
verify_installation
show_summary

log "🚀 Setup completed! Happy ducking! 🦆"