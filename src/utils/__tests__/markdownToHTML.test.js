import { describe, it, expect } from 'vitest';
import { markdownToHTML } from '../markdownToHTML';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

describe('markdownToHTML', () => {
  it('should have working dependencies', () => {
    // Test that marked works
    const markedResult = marked.parse('**bold**');
    console.log('Marked result:', markedResult);
    expect(markedResult).toContain('<strong>bold</strong>');
    
    // Test that DOMPurify works
    const dirtyHtml = '<script>alert("xss")</script><strong>bold</strong>';
    const cleanHtml = DOMPurify.sanitize(dirtyHtml);
    console.log('DOMPurify result:', cleanHtml);
    expect(cleanHtml).not.toContain('<script>');
    expect(cleanHtml).toContain('<strong>bold</strong>');
  });

  it('should debug the malicious HTML case step by step', () => {
    const maliciousMarkdown = '<script>alert("xss")</script>**bold**';
    
    // Step 1: Test marked conversion
    const markedResult = marked.parse(maliciousMarkdown);
    console.log('Step 1 - Marked result:', markedResult);
    
    // Step 2: Test DOMPurify sanitization
    const sanitizedResult = DOMPurify.sanitize(markedResult);
    console.log('Step 2 - DOMPurify result:', sanitizedResult);
    
    // Step 3: Test the actual function
    const functionResult = markdownToHTML(maliciousMarkdown);
    console.log('Step 3 - Function result:', functionResult);
    
    // Marked behavior: HTML blocks prevent markdown processing
    // But DOMPurify should remove the script tag
    expect(markedResult).toContain('<script>');
    expect(sanitizedResult).not.toContain('<script>');
    expect(functionResult).not.toContain('<script>');
  });

  it('should convert basic markdown to HTML', () => {
    const markdown = '**bold** and *italic* text';
    const result = markdownToHTML(markdown);
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('text');
  });

  it('should convert external links to HTML with target="_blank"', () => {
    const markdown = '[Link text](https://example.com)';
    const result = markdownToHTML(markdown);
    expect(result).toContain('<a target="_blank" rel="noopener noreferrer" href="https://example.com"');
    expect(result).toContain('>Link text</a>');
  });

  it('should convert internal links to HTML without target="_blank"', () => {
    // Mock window.location for testing
    const originalLocation = window.location;
    delete window.location;
    window.location = { href: 'http://localhost:3000/page1' };
    
    const markdown = '[Internal link](/page2)';
    const result = markdownToHTML(markdown);
    expect(result).toContain('<a href="/page2"');
    expect(result).not.toContain('target="_blank"');
    expect(result).toContain('>Internal link</a>');
    
    // Restore window.location
    window.location = originalLocation;
  });

  it('should convert code blocks to HTML', () => {
    const markdown = '```javascript\nconsole.log("hello");\n```';
    const result = markdownToHTML(markdown);
    expect(result).toContain('<pre><code class="language-javascript">');
    expect(result).toContain('console.log("hello");');
    expect(result).toContain('</code></pre>');
  });

  it('should convert inline code to HTML', () => {
    const markdown = 'Use `console.log()` for debugging';
    const result = markdownToHTML(markdown);
    expect(result).toContain('<code>console.log()</code>');
  });

  it('should convert lists to HTML', () => {
    const markdown = '- Item 1\n- Item 2\n- Item 3';
    const result = markdownToHTML(markdown);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>Item 1</li>');
    expect(result).toContain('<li>Item 2</li>');
    expect(result).toContain('<li>Item 3</li>');
    expect(result).toContain('</ul>');
  });

  it('should handle empty input', () => {
    const result = markdownToHTML('');
    expect(result).toBe('');
  });

  it('should handle null/undefined input', () => {
    const result1 = markdownToHTML(null);
    const result2 = markdownToHTML(undefined);
    expect(result1).toBe('');
    expect(result2).toBe('');
  });

  it('should sanitize malicious HTML', () => {
    const maliciousMarkdown = '<script>alert("xss")</script>**bold**';
    const result = markdownToHTML(maliciousMarkdown);
    console.log('DEBUG - Input:', maliciousMarkdown);
    console.log('DEBUG - Output:', result);
    // The script tag should be removed by DOMPurify
    expect(result).not.toContain('<script>');
    // Note: Marked may not process markdown after HTML blocks
    // The important thing is that the script is removed
  });

  it('should handle line breaks as paragraphs', () => {
    const markdown = 'Line 1\nLine 2\n\nNew paragraph';
    const result = markdownToHTML(markdown);
    // With breaks: true, single line breaks become <br> tags
    expect(result).toContain('<p>Line 1<br>Line 2</p>');
    expect(result).toContain('<p>New paragraph</p>');
  });

  it('should handle headers', () => {
    const markdown = '# Header 1\n## Header 2';
    const result = markdownToHTML(markdown);
    expect(result).toContain('<h1>Header 1</h1>');
    expect(result).toContain('<h2>Header 2</h2>');
  });

  it('should handle markdown with embedded HTML properly', () => {
    const markdown = '**Bold text** <span>and HTML</span> *italic*';
    const result = markdownToHTML(markdown);
    expect(result).toContain('<strong>Bold text</strong>');
    expect(result).toContain('<span>and HTML</span>');
    expect(result).toContain('<em>italic</em>');
  });
}); 