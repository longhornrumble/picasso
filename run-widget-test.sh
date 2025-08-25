#!/bin/bash

# Picasso Widget Memory Test Runner
# This script starts the esbuild dev server and opens the memory test page

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -i :$port >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to wait for server to be ready
wait_for_server() {
    local url=$1
    local timeout=${2:-30}
    local count=0
    
    print_status "Waiting for server to be ready at $url..."
    
    while [ $count -lt $timeout ]; do
        if curl -s --head "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        ((count++))
        printf "."
    done
    echo ""
    return 1
}

# Function to cleanup background processes
cleanup() {
    print_status "Cleaning up..."
    if [ ! -z "$ESBUILD_PID" ]; then
        print_status "Stopping esbuild dev server (PID: $ESBUILD_PID)..."
        kill $ESBUILD_PID 2>/dev/null || true
        wait $ESBUILD_PID 2>/dev/null || true
    fi
    
    # Kill any other processes on port 8000
    if check_port 8000; then
        print_warning "Killing remaining processes on port 8000..."
        lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    fi
}

# Set up cleanup on script exit
trap cleanup EXIT

# Main execution
main() {
    echo "======================================"
    echo "🎭 Picasso Widget Memory Test Runner"
    echo "======================================"
    echo ""
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Please run this script from the picasso-main directory."
        exit 1
    fi
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_warning "node_modules not found. Running npm install..."
        npm install
    fi
    
    # Check if esbuild dev script exists
    if ! npm run | grep -q "dev:esbuild"; then
        print_error "dev:esbuild script not found in package.json"
        exit 1
    fi
    
    # Kill any existing processes on port 8000
    if check_port 8000; then
        print_warning "Port 8000 is already in use. Stopping existing processes..."
        lsof -ti:8000 | xargs kill -9 2>/dev/null || true
        sleep 2
    fi
    
    # Start esbuild dev server
    print_status "Starting esbuild dev server..."
    npm run dev:esbuild &
    ESBUILD_PID=$!
    
    print_status "esbuild dev server started with PID: $ESBUILD_PID"
    
    # Wait for the server to be ready
    if wait_for_server "http://localhost:8000" 30; then
        print_success "esbuild dev server is ready!"
    else
        print_error "esbuild dev server failed to start within 30 seconds"
        exit 1
    fi
    
    # Verify widget.js is accessible
    print_status "Verifying widget.js is accessible..."
    if curl -s --head "http://localhost:8000/widget.js" >/dev/null 2>&1; then
        print_success "widget.js is accessible at http://localhost:8000/widget.js"
    else
        print_error "widget.js is not accessible. Check esbuild configuration."
        exit 1
    fi
    
    # Check if test files exist
    if [ ! -f "test-widget-memory.html" ]; then
        print_error "test-widget-memory.html not found. Please ensure test files are created."
        exit 1
    fi
    
    if [ ! -f "test-widget-automation.js" ]; then
        print_error "test-widget-automation.js not found. Please ensure test files are created."
        exit 1
    fi
    
    print_success "All test files found!"
    
    # Display test information
    echo ""
    echo "======================================"
    echo "🚀 TEST ENVIRONMENT READY"
    echo "======================================"
    echo ""
    print_status "esbuild dev server: http://localhost:8000"
    print_status "Widget endpoint: http://localhost:8000/widget.js"
    print_status "Test page: file://$(pwd)/test-widget-memory.html"
    print_status "Tenant: my87674d777bf9 (staging)"
    print_status "Environment: Staging (real API calls)"
    echo ""
    
    # Provide instructions
    echo "📋 INSTRUCTIONS:"
    echo "1. Open test-widget-memory.html in your browser:"
    echo "   - Chrome/Safari: file://$(pwd)/test-widget-memory.html"
    echo "   - Or serve it with: python3 -m http.server 3000"
    echo ""
    echo "2. The test page will automatically load the widget from localhost:8000"
    echo ""
    echo "3. Run the memory tests:"
    echo "   - Individual tests: Click test buttons"
    echo "   - All tests: Click 'Run All Memory Tests'"
    echo ""
    echo "4. Monitor the logs for test results and any errors"
    echo ""
    
    # Option to serve the test page
    read -p "Do you want to serve the test page on http://localhost:3000? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Starting HTTP server for test page..."
        
        # Check if port 3000 is available
        if check_port 3000; then
            print_warning "Port 3000 is in use. Trying port 3001..."
            PORT=3001
        else
            PORT=3000
        fi
        
        print_status "Serving test page at http://localhost:$PORT"
        print_status "Press Ctrl+C to stop both servers"
        
        # Start HTTP server in background
        python3 -m http.server $PORT &
        HTTP_PID=$!
        
        # Open browser if possible
        if command -v open >/dev/null 2>&1; then
            sleep 2
            open "http://localhost:$PORT/test-widget-memory.html" 2>/dev/null || true
        elif command -v xdg-open >/dev/null 2>&1; then
            sleep 2
            xdg-open "http://localhost:$PORT/test-widget-memory.html" 2>/dev/null || true
        fi
        
        # Wait for user to stop
        echo ""
        print_success "Test environment is running!"
        print_status "Test page: http://localhost:$PORT/test-widget-memory.html"
        print_status "Widget server: http://localhost:8000"
        echo ""
        print_warning "Press Ctrl+C to stop all servers..."
        
        # Wait for interrupt
        wait $HTTP_PID 2>/dev/null || true
        
        # Cleanup HTTP server
        if [ ! -z "$HTTP_PID" ]; then
            kill $HTTP_PID 2>/dev/null || true
        fi
    else
        print_status "esbuild dev server will continue running..."
        print_warning "Press Ctrl+C to stop the server"
        
        # Wait for interrupt
        wait $ESBUILD_PID 2>/dev/null || true
    fi
}

# Check for required commands
check_dependencies() {
    local missing_deps=()
    
    if ! command -v node >/dev/null 2>&1; then
        missing_deps+=("node")
    fi
    
    if ! command -v npm >/dev/null 2>&1; then
        missing_deps+=("npm")
    fi
    
    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi
    
    if ! command -v lsof >/dev/null 2>&1; then
        missing_deps+=("lsof")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        print_error "Please install the missing dependencies and try again."
        exit 1
    fi
}

# Help function
show_help() {
    echo "Picasso Widget Memory Test Runner"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  --check-deps   Check dependencies only"
    echo ""
    echo "This script:"
    echo "1. Starts the esbuild dev server on port 8000"
    echo "2. Serves the widget.js file for testing"
    echo "3. Optionally serves the test page on port 3000"
    echo "4. Provides instructions for running memory tests"
    echo ""
    echo "Prerequisites:"
    echo "- Node.js and npm installed"
    echo "- Run from picasso-main directory"
    echo "- test-widget-memory.html and test-widget-automation.js present"
}

# Parse command line arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    --check-deps)
        check_dependencies
        print_success "All dependencies are available!"
        exit 0
        ;;
    *)
        # Default behavior
        check_dependencies
        main
        ;;
esac