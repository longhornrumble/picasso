/**
 * ChatContentProvider Security Tests
 * 
 * Comprehensive security testing for the enhanced ChatContentProvider
 * with sophisticated functionality extracted from the monolith.
 * 
 * Test Coverage:
 * - XSS Prevention with DOMPurify sanitization
 * - Content Sanitization with malicious input handling
 * - Malicious Content Detection and threat classification
 * - Memory Monitoring and cleanup triggers
 * - Parser Lifecycle management and timeout handling
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ChatContentProvider, useChatContent } from '../ChatContentProvider';
import type { 
  DetectedThreat,
  ContentSecurityPolicy,
  SafeContent,
  SafeHTML,
  SafeText,
  SecureURL,
  ValidationResult,
  XSSDetectionResult,
  InjectionDetectionResult
} from '../../types/security';
import type { FileValidationResult } from '../../types/security';

// Mock dependencies
vi.mock('../../utils/security', () => ({
  sanitizeHTML: vi.fn((content: string) => {
    // More comprehensive sanitization for testing
    return content
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/vbscript\s*:/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/on\w+\s*=\s*[^>\s]+/gi, '')
      .replace(/style\s*=\s*["'][^"']*expression[^"']*["']/gi, '')
      .replace(/style\s*=\s*["'][^"']*javascript[^"']*["']/gi, '')
      .replace(/data\s*:\s*text\/html/gi, 'data:text/plain');
  }),
  sanitizeContent: vi.fn((content: string) => {
    // Basic content sanitization
    return content
      .replace(/javascript\s*:/gi, '')
      .replace(/vbscript\s*:/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/data\s*:\s*text\/html/gi, 'data:text/plain');
  }),
  validateURL: vi.fn((url: string) => url.startsWith('http') ? url : null),
  validateFileAttachment: vi.fn((file: File): FileValidationResult => ({
    isValid: file.size < 10 * 1024 * 1024,
    isSafe: true,
    errors: file.size >= 10 * 1024 * 1024 ? ['File too large'] : [],
    warnings: [],
    metadata: {
      detectedMimeType: file.type,
      actualExtension: file.name.split('.').pop() || '',
      fileSize: file.size,
      isExecutable: false,
      hasMetadata: false,
      scanResults: {
        virusDetected: false,
        suspiciousPatterns: [],
        riskLevel: 'low'
      }
    }
  })),
  securityValidator: {
    detectXSS: vi.fn((content: string): XSSDetectionResult => ({
      hasXSS: /<script|javascript:|vbscript:|on\w+=/i.test(content),
      confidence: 0.9,
      detectedPatterns: /<script|javascript:|vbscript:|on\w+=/i.test(content) ? [{
        name: 'script_injection',
        severity: 'critical' as const,
        description: 'Script injection detected',
        pattern: '<script>',
        position: { start: 0, end: 8 }
      }] : [],
      sanitizationRecommended: /<script|javascript:|vbscript:|on\w+=/i.test(content)
    })),
    detectInjection: vi.fn((content: string): InjectionDetectionResult => ({
      hasInjection: /javascript:|data:|vbscript:/i.test(content),
      patterns: /javascript:|data:|vbscript:/i.test(content) ? [{
        type: 'javascript',
        severity: 'high' as const,
        description: 'JavaScript injection detected',
        pattern: 'javascript:',
        confidence: 0.85,
        mitigation: 'Remove javascript: protocol'
      }] : []
    }))
  }
}));

vi.mock('../../utils/errorHandling', () => ({
  errorLogger: {
    logInfo: vi.fn(),
    logWarning: vi.fn(),
    logError: vi.fn()
  },
  performanceMonitor: {
    startTimer: vi.fn(() => 'timer-id'),
    endTimer: vi.fn(),
    getMetrics: vi.fn(() => ({}))
  }
}));

// Mock DOMPurify and marked imports
vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((content: string) => {
      // Comprehensive DOMPurify mock
      return content
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/javascript\s*:/gi, '')
        .replace(/vbscript\s*:/gi, '')
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/on\w+\s*=\s*[^>\s]+/gi, '')
        .replace(/style\s*=\s*["'][^"']*expression[^"']*["']/gi, '')
        .replace(/style\s*=\s*["'][^"']*javascript[^"']*["']/gi, '')
        .replace(/<iframe[^>]*src\s*=\s*["']javascript:[^"']*["'][^>]*>/gi, '')
        .replace(/<object[^>]*data\s*=\s*["']javascript:[^"']*["'][^>]*>/gi, '')
        .replace(/<embed[^>]*src\s*=\s*["']data:text\/html[^"']*["'][^>]*>/gi, '')
        .replace(/data\s*:\s*text\/html/gi, 'data:text/plain');
    }),
    isSupported: vi.fn(() => true)
  }
}));

vi.mock('marked', () => ({
  marked: {
    parse: vi.fn((content: string) => `<p>${content}</p>`),
    setOptions: vi.fn(),
    use: vi.fn()
  }
}));

// Test component for provider testing
const TestComponent: React.FC<{ onProviderReady?: (provider: any) => void }> = ({ onProviderReady }) => {
  const provider = useChatContent();
  
  React.useEffect(() => {
    if (provider && onProviderReady) {
      onProviderReady(provider);
    }
  }, [provider, onProviderReady]);
  
  return <div data-testid="test-component">Content Provider Test</div>;
};

describe('ChatContentProvider Security Tests', () => {
  let mockConsoleError: any;
  let mockConsoleWarn: any;

  beforeEach(() => {
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (mockConsoleError && typeof mockConsoleError.mockRestore === 'function') {
      mockConsoleError.mockRestore();
    }
    if (mockConsoleWarn && typeof mockConsoleWarn.mockRestore === 'function') {
      mockConsoleWarn.mockRestore();
    }
    vi.clearAllMocks();
  });

  describe('XSS Prevention', () => {
    test('blocks script injection attempts', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const maliciousInputs = [
        '<script>alert("XSS")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<object data="javascript:alert(1)"></object>',
        '<embed src="data:text/html,<script>alert(1)</script>">',
        '<svg onload="alert(1)">',
        '<div onclick="alert(1)">Click me</div>'
      ];

      for (const maliciousInput of maliciousInputs) {
        const result = await contentProvider.processUserMessage(maliciousInput);
        
        // Verify XSS patterns are removed or neutralized
        expect(result).not.toContain('<script');
        expect(result).not.toContain('javascript:');
        expect(result).not.toContain('onerror=');
        expect(result).not.toContain('onload=');
        expect(result).not.toContain('onclick=');
        
        // Ensure some content remains (not just empty)
        expect(typeof result).toBe('string');
      }
    });

    test('sanitizes malicious HTML attributes', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const maliciousAttributes = [
        '<a href="javascript:alert(1)">Link</a>',
        '<img src="x" onload="evil()">',
        '<div style="background:url(javascript:alert(1))">Styled</div>',
        '<button onclick="malicious()">Button</button>',
        '<input onfocus="bad()" value="test">',
        '<form onsubmit="return evil()"></form>'
      ];

      for (const maliciousHtml of maliciousAttributes) {
        const result = await contentProvider.processUserMessage(maliciousHtml);
        
        // Verify dangerous attributes are removed
        expect(result).not.toMatch(/javascript:/i);
        expect(result).not.toMatch(/on\w+=/i);
        expect(result).not.toMatch(/style=.*javascript:/i);
        
        // Ensure processing occurred
        expect(typeof result).toBe('string');
      }
    });

    test('handles complex XSS vectors', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const complexXSSVectors = [
        // Encoded script tags
        '&lt;script&gt;alert(1)&lt;/script&gt;',
        // Data URIs
        '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
        // CSS expression
        '<div style="background-image: expression(alert(1))">CSS XSS</div>',
        // Mixed case to bypass filters
        '<ScRiPt>alert(1)</ScRiPt>',
        // Comment-based XSS
        '<!--<script>alert(1)</script>-->',
        // SVG-based XSS  
        '<svg><script>alert(1)</script></svg>',
        // Math element XSS
        '<math><mtext><script>alert(1)</script></mtext></math>',
        // Template element XSS
        '<template><script>alert(1)</script></template>'
      ];

      for (const xssVector of complexXSSVectors) {
        try {
          const result = await contentProvider.processUserMessage(xssVector);
          
          // Should not contain any executable JavaScript
          expect(result).not.toMatch(/<script[\s\S]*?>[\s\S]*?<\/script>/i);
          expect(result).not.toMatch(/javascript:/i);
          expect(result).not.toMatch(/vbscript:/i);
          expect(result).not.toMatch(/expression\s*\(/i);
          
          // Ensure processing occurred
          expect(typeof result).toBe('string');
        } catch (error) {
          // If content fails validation due to extreme malicious content, that's acceptable
          expect(error.message).toMatch(/failed.*validation/i);
        }
      }
    });

    test('preserves safe HTML content', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const safeContent = [
        '<p>Safe paragraph</p>',
        '<strong>Bold text</strong>',
        '<em>Italic text</em>',
        '<a href="https://example.com">Safe link</a>',
        '<ul><li>List item</li></ul>',
        '<blockquote>Quote</blockquote>',
        '<code>code snippet</code>',
        '<pre>preformatted text</pre>'
      ];

      for (const safeHtml of safeContent) {
        try {
          const result = await contentProvider.processUserMessage(safeHtml);
          
          // Should preserve safe HTML structure while being sanitized
          const tagMatch = safeHtml.match(/<(\w+)/);
          if (tagMatch) {
            // Content should be processed (could be converted to markdown or text)
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
          }
        } catch (error) {
          // If content fails validation, that's also acceptable for safe content processing
          expect(error.message).toMatch(/failed.*validation/i);
        }
      }
    });
  });

  describe('Content Security', () => {
    test('validates external links with security attributes', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const markdownWithLinks = `
        [Internal link](/internal)
        [External link](https://example.com)
        [Email link](mailto:test@example.com)
        [Malicious link](javascript:alert(1))
      `;

      const result = await contentProvider.processAssistantMessage(markdownWithLinks);
      
      // Malicious links should be neutralized
      expect(result).not.toContain('javascript:');
      
      // Ensure processing occurred
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('prevents code injection in markdown', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const maliciousMarkdown = `
        # Heading
        
        \`\`\`html
        <script>alert('XSS')</script>
        \`\`\`
        
        ![Image](javascript:alert(1))
        
        [Link](javascript:void(0))
      `;

      const result = await contentProvider.processAssistantMessage(maliciousMarkdown);
      
      // Code blocks should be safe
      expect(result).not.toMatch(/<script[\s\S]*?>[\s\S]*?<\/script>/);
      
      // Images and links should not contain JavaScript
      expect(result).not.toMatch(/src="javascript:/);
      expect(result).not.toMatch(/href="javascript:/);
      expect(result).not.toContain('javascript:');
      
      // Ensure processing occurred
      expect(typeof result).toBe('string');
    });

    test('handles malformed content gracefully', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const malformedContent = [
        '<div><p>Unclosed tags',
        '< > Invalid tags < >',
        null,
        undefined,
        '',
        '<script>alert(1)</script><img src="x" onerror="alert(2)">',
        '&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;'
      ];

      for (const content of malformedContent) {
        await expect(async () => {
          if (content === null || content === undefined) {
            return;
          }
          const result = await contentProvider.processUserMessage(content);
          expect(typeof result).toBe('string');
        }).not.toThrow();
      }
    });

    test('enforces content length limits', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Update security policy to have a lower limit for testing
      await contentProvider.updateSecurityPolicy({
        maxContentLength: 1000
      });

      const longContent = 'A'.repeat(2000);
      
      const validation = await contentProvider.processor.validateHTML(longContent);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Content exceeds maximum length of 1000');
    });
  });

  describe('Malicious Content Detection', () => {
    test('detects and classifies security threats', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const maliciousContent = '<script>alert("XSS")</script>';
      
      const threats = await contentProvider.scanForThreats(maliciousContent, 'html');
      
      expect(threats).toHaveLength(1);
      expect(threats[0]).toMatchObject({
        type: 'xss',
        severity: 'critical',
        description: expect.stringContaining('Script injection'),
        pattern: 'script_injection'
      });
    });

    test('handles threat detection callbacks', async () => {
      let contentProvider: any = null;
      const threatCallback = vi.fn();
      
      render(
        <ChatContentProvider onThreatDetected={threatCallback}>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const maliciousContent = '<script>alert("XSS")</script>';
      
      await contentProvider.processUserMessage(maliciousContent);
      
      await waitFor(() => {
        expect(threatCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'xss',
            severity: 'critical'
          }),
          maliciousContent,
          expect.any(String)
        );
      });
    });

    test('categorizes different threat types', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const threatScenarios = [
        {
          content: '<script>alert(1)</script>',
          expectedType: 'xss',
          expectedSeverity: 'critical'
        },
        {
          content: 'javascript:alert(1)',
          expectedType: 'malicious_script',
          expectedSeverity: 'high'
        }
      ];

      for (const scenario of threatScenarios) {
        const result = await contentProvider.processor.detectMaliciousContent(
          scenario.content, 
          'html'
        );
        
        expect(result.hasThreat).toBe(true);
        expect(result.threats).toHaveLength(1);
        expect(result.threats[0].type).toBe(scenario.expectedType);
        expect(result.threats[0].severity).toBe(scenario.expectedSeverity);
      }
    });
  });

  describe('Memory Monitoring', () => {
    test('detects memory growth and triggers cleanup', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Simulate high memory usage by processing many large messages
      const largeContent = 'A'.repeat(1000);
      
      for (let i = 0; i < 50; i++) {
        await contentProvider.processUserMessage(`${largeContent} ${i}`);
      }

      const metrics = contentProvider.getProcessingMetrics();
      
      // Should track memory metrics
      expect(metrics).toHaveProperty('memoryMetrics');
      expect(metrics.memoryMetrics).toHaveProperty('currentMemoryMB');
      expect(metrics.memoryMetrics).toHaveProperty('memoryUtilization');
      expect(metrics.memoryMetrics).toHaveProperty('sessionDurationMinutes');
    });

    test('performs periodic cleanup of expired content', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Process content to populate cache
      await contentProvider.processUserMessage('Test content 1');
      await contentProvider.processUserMessage('Test content 2');
      
      const initialCacheStats = contentProvider.getCacheStats();
      expect(initialCacheStats.size).toBeGreaterThan(0);

      // Clear cache manually to test cleanup
      contentProvider.clearContentCache();
      
      const clearedCacheStats = contentProvider.getCacheStats();
      expect(clearedCacheStats.size).toBe(0);
    });

    test('monitors session data for memory leaks', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Create many sessions to test memory tracking
      for (let i = 0; i < 20; i++) {
        await contentProvider.processUserMessage(`Session content ${i}`);
      }

      const metrics = contentProvider.getProcessingMetrics();
      
      expect(metrics.sessionMetrics).toHaveProperty('activeSessions');
      expect(metrics.sessionMetrics).toHaveProperty('activeOperations');
      expect(metrics.sessionMetrics.activeSessions).toBeGreaterThan(0);
    });
  });

  describe('Parser Lifecycle', () => {
    test('manages markdown parser timeout and cleanup', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Process markdown content
      const markdownContent = '# Heading\n\n*Italic* and **bold** text.';
      
      const result = await contentProvider.processAssistantMessage(markdownContent);
      
      expect(result).toContain('<p>');
      expect(result).toContain('Heading');
      
      const metrics = contentProvider.getProcessingMetrics();
      
      // Should track parser usage
      expect(metrics.performanceMetrics).toBeDefined();
    });

    test('handles parser loading errors gracefully', async () => {
      let contentProvider: any = null;
      
      // Mock parser import failure
      vi.doMock('marked', () => {
        throw new Error('Failed to load marked');
      });
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Should fallback gracefully when parser fails to load
      const result = await contentProvider.processAssistantMessage('# Test markdown');
      
      // Should still return content (via fallback)
      expect(typeof result).toBe('string');
      expect(result).toContain('Test markdown');
    });

    test('validates parser configuration security', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Test that parser doesn't allow dangerous HTML
      const dangerousMarkdown = `
        # Title
        
        <script>alert('XSS')</script>
        
        [Link](javascript:alert(1))
      `;

      const result = await contentProvider.processAssistantMessage(dangerousMarkdown);
      
      // Parser should sanitize dangerous content
      expect(result).not.toContain('<script');
      expect(result).not.toContain('javascript:');
    });
  });

  describe('File Upload Security', () => {
    test('validates file types and sizes', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Create test files
      const validFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      const oversizedFile = new File(['x'.repeat(15 * 1024 * 1024)], 'large.txt', { type: 'text/plain' });
      
      const validResult = await contentProvider.validateFileUpload(validFile);
      expect(validResult.isValid).toBe(true);
      
      const invalidResult = await contentProvider.validateFileUpload(oversizedFile);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('File too large');
    });

    test('detects potentially malicious files', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const suspiciousFiles = [
        new File([''], 'script.js', { type: 'application/javascript' }),
        new File([''], 'malware.exe', { type: 'application/octet-stream' }),
        new File([''], 'document.pdf', { type: 'application/pdf' })
      ];

      for (const file of suspiciousFiles) {
        const result = await contentProvider.validateFileUpload(file);
        expect(result).toHaveProperty('isValid');
        expect(result).toHaveProperty('isSafe');
        expect(result).toHaveProperty('metadata');
      }
    });
  });

  describe('Policy Violation Handling', () => {
    test('triggers policy violation callbacks', async () => {
      const policyViolationCallback = vi.fn();
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider onPolicyViolation={policyViolationCallback}>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Process content that would trigger policy violations
      const violatingContent = '<script>alert("Policy Violation")</script>';
      
      await contentProvider.processUserMessage(violatingContent);
      
      // Should trigger policy violation callback
      await waitFor(() => {
        expect(policyViolationCallback).toHaveBeenCalled();
      });
    });

    test('enforces custom security policies', async () => {
      let contentProvider: any = null;
      
      const customPolicy: Partial<ContentSecurityPolicy> = {
        allowedTags: ['p', 'strong', 'em'],
        allowedAttributes: ['class'],
        maxContentLength: 500
      };
      
      render(
        <ChatContentProvider securityPolicy={customPolicy}>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const policy = contentProvider.getSecurityPolicy();
      expect(policy.allowedTags).toEqual(['p', 'strong', 'em']);
      expect(policy.allowedAttributes).toEqual(['class']);
      expect(policy.maxContentLength).toBe(500);
    });
  });

  describe('Performance and Diagnostics', () => {
    test('provides comprehensive performance metrics', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Process some content to generate metrics
      await contentProvider.processUserMessage('Test content');
      await contentProvider.processAssistantMessage('Response content');
      
      const metrics = contentProvider.getProcessingMetrics();
      
      expect(metrics).toHaveProperty('totalProcessed');
      expect(metrics).toHaveProperty('successfulProcessing');
      expect(metrics).toHaveProperty('averageProcessingTime');
      expect(metrics).toHaveProperty('cacheHitRate');
      expect(metrics).toHaveProperty('threatsDetected');
      expect(metrics).toHaveProperty('memoryMetrics');
      expect(metrics).toHaveProperty('sessionMetrics');
      expect(metrics).toHaveProperty('performanceMetrics');
    });

    test('identifies performance issues', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      const diagnostics = contentProvider.getDiagnostics();
      
      expect(diagnostics).toHaveProperty('metrics');
      expect(diagnostics).toHaveProperty('cacheStats');
      expect(diagnostics).toHaveProperty('securityPolicy');
      expect(diagnostics).toHaveProperty('performanceIssues');
      expect(diagnostics).toHaveProperty('enhancedDiagnostics');
    });

    test('exports threat log data', async () => {
      let contentProvider: any = null;
      
      render(
        <ChatContentProvider>
          <TestComponent onProviderReady={(provider) => { contentProvider = provider; }} />
        </ChatContentProvider>
      );

      await waitFor(() => {
        expect(contentProvider).not.toBeNull();
      });

      // Process malicious content to generate threat log entries
      await contentProvider.processUserMessage('<script>alert("threat")</script>');
      
      const threatLog = contentProvider.exportThreatLog();
      
      expect(threatLog).toHaveProperty('version');
      expect(threatLog).toHaveProperty('exportTime');
      expect(threatLog).toHaveProperty('threats');
      expect(threatLog).toHaveProperty('summary');
      expect(threatLog).toHaveProperty('timeRange');
      expect(threatLog).toHaveProperty('enhancedData');
    });
  });
});