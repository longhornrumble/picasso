#!/bin/bash

# Build script for optimized Lambda deployment package
# This creates a minimal deployment package excluding AWS SDK packages

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME="lambda-optimized.zip"
TEMP_DIR="/tmp/lambda-build-$$"

echo "=== Lambda Optimization Build Script ==="
echo "Script directory: $SCRIPT_DIR"
echo "Output package: $PACKAGE_NAME"
echo "Temporary directory: $TEMP_DIR"

# Clean up any existing build artifacts
echo "Cleaning up existing build artifacts..."
rm -f "$SCRIPT_DIR/$PACKAGE_NAME"

# Create temporary build directory
echo "Creating temporary build directory..."
mkdir -p "$TEMP_DIR"

# Function to copy file if it exists
copy_if_exists() {
    local src="$1"
    local dest="$2"
    if [[ -f "$src" ]]; then
        echo "  Copying: $(basename "$src")"
        cp "$src" "$dest"
        return 0
    else
        echo "  WARNING: File not found: $src"
        return 1
    fi
}

# Copy required Python application files
echo "Copying required Python application files..."
REQUIRED_FILES=(
    "lambda_function.py"
    "intent_router.py"
    "bedrock_handler.py"
    "response_formatter.py"
    "session_utils.py"
    "tenant_config_loader.py"
    "conversation_handler.py"
)

all_files_found=true
for file in "${REQUIRED_FILES[@]}"; do
    if ! copy_if_exists "$SCRIPT_DIR/$file" "$TEMP_DIR/"; then
        all_files_found=false
    fi
done

if [[ "$all_files_found" != true ]]; then
    echo "ERROR: Some required files were not found. Aborting build."
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Copy PyJWT library (only external dependency needed)
echo "Copying PyJWT library..."
if [[ -d "$SCRIPT_DIR/jwt" ]]; then
    echo "  Copying: jwt/ directory"
    cp -r "$SCRIPT_DIR/jwt" "$TEMP_DIR/"
else
    echo "  ERROR: PyJWT library directory 'jwt' not found!"
    rm -rf "$TEMP_DIR"
    exit 1
fi

# Copy PyJWT distribution info (optional but recommended)
if [[ -d "$SCRIPT_DIR/PyJWT-2.8.0.dist-info" ]]; then
    echo "  Copying: PyJWT-2.8.0.dist-info/ directory"
    cp -r "$SCRIPT_DIR/PyJWT-2.8.0.dist-info" "$TEMP_DIR/"
fi

# Create the optimized package
echo "Creating optimized deployment package..."
cd "$TEMP_DIR"
zip -r "$SCRIPT_DIR/$PACKAGE_NAME" . -x "*.pyc" "*/__pycache__/*" "*.DS_Store"

# Clean up temporary directory
echo "Cleaning up temporary directory..."
rm -rf "$TEMP_DIR"

# Display package information
if [[ -f "$SCRIPT_DIR/$PACKAGE_NAME" ]]; then
    package_size=$(du -h "$SCRIPT_DIR/$PACKAGE_NAME" | cut -f1)
    package_size_bytes=$(stat -f%z "$SCRIPT_DIR/$PACKAGE_NAME" 2>/dev/null || stat -c%s "$SCRIPT_DIR/$PACKAGE_NAME" 2>/dev/null)
    
    echo "=== Build Complete ==="
    echo "Package: $PACKAGE_NAME"
    echo "Size: $package_size ($(numfmt --to=iec --suffix=B $package_size_bytes))"
    echo "Location: $SCRIPT_DIR/$PACKAGE_NAME"
    
    # Check if size is under 1MB
    if [[ $package_size_bytes -lt 1048576 ]]; then
        echo "✅ SUCCESS: Package size is under 1MB target!"
    else
        echo "⚠️  WARNING: Package size exceeds 1MB target"
    fi
    
    # List contents for verification
    echo ""
    echo "Package contents:"
    unzip -l "$SCRIPT_DIR/$PACKAGE_NAME" | head -20
    
    echo ""
    echo "=== What was excluded ==="
    echo "❌ boto3/ (1.4MB) - Provided by Lambda runtime"
    echo "❌ botocore/ (24MB) - Provided by Lambda runtime"  
    echo "❌ urllib3/ (1MB) - Dependency of boto3"
    echo "❌ dateutil/ (836KB) - Dependency of boto3"
    echo "❌ s3transfer/ (708KB) - Dependency of boto3"
    echo "❌ jmespath/ (184KB) - Dependency of boto3"
    echo "❌ six.py (36KB) - Dependency of boto3"
    echo "❌ All test files (*test*.py)"
    echo "❌ All documentation files (*.md)"
    echo "❌ All existing zip files"
    echo "❌ All dist-info directories (except PyJWT)"
    echo ""
    echo "=== What was included ==="
    echo "✅ All 7 required application Python files"
    echo "✅ PyJWT library (only external dependency)"
    echo "✅ PyJWT distribution info"
    
else
    echo "ERROR: Failed to create package!"
    exit 1
fi