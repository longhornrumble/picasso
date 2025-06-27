#!/usr/bin/env python3
"""
Script to analyze Lambda function code for URL/markdown handling issues
Run this in your Lambda function directory to identify potential problems
"""

import os
import re
import json
from pathlib import Path

def find_text_processing(file_path):
    """Find lines that might be processing/stripping text content"""
    issues = []
    
    with open(file_path, 'r') as f:
        lines = f.readlines()
    
    patterns = [
        # Look for text manipulation
        (r'\.strip\(\)', 'Stripping whitespace - might affect markdown'),
        (r'\.replace\(', 'Text replacement - could modify URLs'),
        (r're\.sub\(', 'Regex substitution - might strip URLs'),
        (r'\.split\(', 'Text splitting - could break URLs'),
        
        # Look for content extraction
        (r'\.get\([\'"]content[\'"]', 'Content extraction'),
        (r'\.get\([\'"]message[\'"]', 'Message extraction'),
        (r'\.get\([\'"]text[\'"]', 'Text extraction'),
        
        # Look for JSON operations
        (r'json\.dumps', 'JSON encoding - check for double encoding'),
        (r'json\.loads', 'JSON decoding'),
        
        # Look for URL/email patterns
        (r'https?://', 'URL pattern found'),
        (r'@[a-zA-Z]', 'Email pattern found'),
        
        # Look for markdown processing
        (r'markdown', 'Markdown processing'),
        (r'parse.*html', 'HTML parsing'),
        (r'sanitize', 'Sanitization - might strip content'),
        
        # Bedrock response handling
        (r'bedrock', 'Bedrock interaction'),
        (r'knowledge.*base', 'Knowledge base access'),
    ]
    
    for i, line in enumerate(lines, 1):
        for pattern, description in patterns:
            if re.search(pattern, line, re.IGNORECASE):
                issues.append({
                    'file': file_path,
                    'line': i,
                    'content': line.strip(),
                    'issue': description
                })
    
    return issues

def analyze_response_formatting(file_path):
    """Specifically analyze response formatting logic"""
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Look for response building patterns
    response_patterns = [
        r'return\s*{[^}]*[\'"]content[\'"]',
        r'response\s*=\s*{',
        r'format.*response',
        r'build.*response',
    ]
    
    findings = []
    for pattern in response_patterns:
        matches = re.finditer(pattern, content, re.IGNORECASE | re.MULTILINE)
        for match in matches:
            # Get surrounding context
            start = max(0, match.start() - 200)
            end = min(len(content), match.end() + 200)
            context = content[start:end]
            findings.append({
                'pattern': pattern,
                'context': context
            })
    
    return findings

def check_markdown_preservation():
    """Create test cases to verify markdown preservation"""
    test_cases = [
        {
            'name': 'Inline link',
            'input': 'Visit our [donation page](https://www.fostervillageaustin.org/give) to contribute.',
            'expected': 'Visit our <a href="https://www.fostervillageaustin.org/give">donation page</a> to contribute.'
        },
        {
            'name': 'Plain URL',
            'input': 'Visit https://www.fostervillageaustin.org/give to contribute.',
            'expected': 'Visit <a href="https://www.fostervillageaustin.org/give">https://www.fostervillageaustin.org/give</a> to contribute.'
        },
        {
            'name': 'Email',
            'input': 'Contact us at info@fostervillageaustin.org for details.',
            'expected': 'Contact us at <a href="mailto:info@fostervillageaustin.org">info@fostervillageaustin.org</a> for details.'
        }
    ]
    
    return test_cases

def main():
    print("Lambda Function URL/Markdown Analysis")
    print("=" * 50)
    
    # Files to analyze
    files_to_check = [
        'lambda_function.py',
        'response_formatter.py',
        'bedrock_handler.py',
        'intent_router.py',
        'tenant_config_loader.py',
        'session_utils.py'
    ]
    
    # Find Python files in current directory
    python_files = list(Path('.').glob('**/*.py'))
    
    print(f"\nFound {len(python_files)} Python files")
    
    all_issues = []
    
    for file in python_files:
        if file.name in files_to_check or 'format' in file.name.lower() or 'response' in file.name.lower():
            print(f"\nAnalyzing {file}...")
            issues = find_text_processing(file)
            all_issues.extend(issues)
    
    # Group issues by type
    print("\n\nPotential Issues Found:")
    print("-" * 50)
    
    issue_types = {}
    for issue in all_issues:
        issue_type = issue['issue']
        if issue_type not in issue_types:
            issue_types[issue_type] = []
        issue_types[issue_type].append(issue)
    
    for issue_type, issues in issue_types.items():
        print(f"\n{issue_type} ({len(issues)} occurrences):")
        for issue in issues[:3]:  # Show first 3 examples
            print(f"  {issue['file']}:{issue['line']} - {issue['content'][:80]}...")
    
    # Look for response formatting
    print("\n\nResponse Formatting Analysis:")
    print("-" * 50)
    
    for file in python_files:
        if 'response' in file.name.lower() or 'format' in file.name.lower():
            findings = analyze_response_formatting(file)
            if findings:
                print(f"\nIn {file}:")
                for finding in findings:
                    print(f"  Found: {finding['pattern']}")
                    print(f"  Context: ...{finding['context'][:200]}...")
    
    # Suggest test cases
    print("\n\nTest Cases for Markdown Preservation:")
    print("-" * 50)
    
    test_cases = check_markdown_preservation()
    for test in test_cases:
        print(f"\nTest: {test['name']}")
        print(f"Input:    {test['input']}")
        print(f"Expected: {test['expected']}")
    
    # Recommendations
    print("\n\nRecommendations:")
    print("-" * 50)
    print("""
1. Check response_formatter.py for:
   - Any .strip() or .replace() operations on content
   - How Bedrock response is extracted
   - JSON encoding (avoid double-encoding)

2. In bedrock_handler.py verify:
   - Knowledge base responses preserve markdown
   - No plain text conversion is happening

3. Test the Lambda directly:
   - Send a test message with URLs/emails
   - Log the raw Bedrock response
   - Log each transformation step
   - Check final response format

4. Common fixes:
   - Preserve raw markdown from Bedrock
   - Use single 'content' field in response
   - Avoid regex operations on content
   - Don't strip/clean the message content
""")

if __name__ == '__main__':
    main()