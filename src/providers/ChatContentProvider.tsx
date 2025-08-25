/**
 * ChatContentProvider - Content Security and Processing
 * 
 * Handles advanced content sanitization, markdown processing, XSS prevention,
 * and file attachment validation for the distributed ChatProvider architecture.
 * Provides type-safe operations with DOMPurify integration and parser caching.
 */

import React, { createContext, useContext, useCallback, useEffect, useRef, useMemo } from 'react';
import { BaseProvider } from '../context/providers/BaseProvider';
import type {
  ChatContentProvider as IChatContentProvider,
  ChatContentProviderProps,
  ContentProcessor,
  ContentSecurityPolicy,
  ContentCache,
  ContentType,
  MarkdownProcessingOptions,
  DetectedThreat,
  ThreatDetectionResult,
  LinkInfo,
  LinkValidationResult,
  ProcessedFile,
  FileProcessingOptions,
  ContentProcessingMetrics,
  ContentProviderConfiguration,
  ContentProviderDiagnostics,
  ThreatLogExport,
  SecurityThreatCallback,
  ContentProcessedCallback,
  FileValidatedCallback,
  PolicyViolationCallback
} from '../types/providers/content';
import { DEFAULT_CONTENT_SECURITY_POLICY } from '../types/providers/content';
import type {
  SafeContent,
  SafeHTML,
  SafeText,
  SecureURL,
  ValidationResult,
  HTMLSanitizationConfig,
  FileValidationResult,
  XSSDetectionResult,
  InjectionDetectionResult
} from '../types/security';
import type {
  OperationId,
  Timestamp,
  Duration,
  CacheKey
} from '../types/branded';
import { createTimestamp, createDuration } from '../types/branded';
import { PROVIDER_IDS } from '../types/providers';
import { 
  sanitizeHTML, 
  sanitizeContent, 
  validateURL, 
  validateFileAttachment, 
  securityValidator 
} from '../utils/security';
import { 
  errorLogger, 
  performanceMonitor 
} from '../utils/errorHandling';

/* ===== ENHANCED BRANDED TYPES WITH RUNTIME VALIDATION ===== */

/**
 * Runtime validation for branded types with enhanced security
 */
const validateSafeContent = (content: unknown): content is SafeContent => {
  if (typeof content !== 'string') return false;
  if (content.length === 0) return true; // Empty content is safe
  
  // For processing purposes, allow potentially unsafe content to be sanitized
  // Only block extreme cases that could break the processing pipeline
  const blockingPatterns = [
    /data:\s*text\/html/i,
    /javascript:\s*void\s*\(/i
  ];
  
  return !blockingPatterns.some(pattern => pattern.test(content));
};

const validateSafeHTML = (html: unknown): html is SafeHTML => {
  if (!validateSafeContent(html)) return false;
  if (typeof html !== 'string') return false;
  
  // Additional HTML-specific validation
  const htmlPatterns = [
    /<\/?[a-zA-Z][^>]*>/,  // Contains HTML tags
    /&[a-zA-Z0-9#]+;/     // Contains HTML entities
  ];
  
  // Either contains valid HTML or is plain text
  return htmlPatterns.some(pattern => pattern.test(html)) || 
         !html.includes('<'); // Plain text
};

const validateSafeText = (text: unknown): text is SafeText => {
  if (typeof text !== 'string') return false;
  if (text.length === 0) return true; // Empty text is safe
  
  // For text processing, we allow HTML tags since they will be sanitized
  // Only block obviously dangerous patterns that can't be safely processed
  const criticalPatterns = [
    /javascript:\s*void\s*\(/i,
    /data:\s*text\/html/i
  ];
  
  return !criticalPatterns.some(pattern => pattern.test(text));
};

const validateSecureURL = (url: unknown): url is SecureURL => {
  if (typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url);
    const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
    return allowedProtocols.includes(parsed.protocol);
  } catch {
    return false;
  }
};

/**
 * Enhanced branded type constructors with validation
 */
export const createSafeContent = (content: string): SafeContent => {
  if (!validateSafeContent(content)) {
    throw new Error('Content failed safety validation');
  }
  return content as SafeContent;
};

export const createSafeHTML = (html: string): SafeHTML => {
  if (!validateSafeHTML(html)) {
    throw new Error('HTML failed safety validation');
  }
  return html as SafeHTML;
};

export const createSafeText = (text: string): SafeText => {
  if (!validateSafeText(text)) {
    throw new Error('Text failed safety validation');
  }
  return text as SafeText;
};

export const createSecureURL = (url: string): SecureURL => {
  if (!validateSecureURL(url)) {
    throw new Error('URL failed security validation');
  }
  return url as SecureURL;
};

/* ===== MEMORY MONITORING SYSTEM ===== */

/**
 * Advanced memory monitoring utility for long-running content processing sessions
 */
interface MemoryMonitor {
  getMemoryInfo(): MemoryInfo;
  checkMemoryGrowth(previousMemory: MemoryInfo | null, currentMemory: MemoryInfo): boolean;
  getGrowthAlerts(): number;
  incrementGrowthAlerts(): void;
  getSessionDuration(): number;
  getLastMemoryCheck(): number;
  updateLastMemoryCheck(): void;
}

interface MemoryInfo {
  timestamp: string;
  sessionDurationMinutes: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  memoryUtilization: number;
}

const createMemoryMonitor = (): MemoryMonitor => {
  const startTime = Date.now();
  let lastMemoryCheck = Date.now();
  let memoryGrowthAlerts = 0;
  
  const getMemoryInfo = (): MemoryInfo => {
    // Try to get performance memory info if available
    const memory = (performance as any).memory || {};
    const sessionDuration = Date.now() - startTime;
    
    return {
      timestamp: new Date().toISOString(),
      sessionDurationMinutes: Math.round(sessionDuration / (1000 * 60)),
      usedJSHeapSize: memory.usedJSHeapSize || 0,
      totalJSHeapSize: memory.totalJSHeapSize || 0,
      jsHeapSizeLimit: memory.jsHeapSizeLimit || 0,
      memoryUtilization: memory.totalJSHeapSize ? 
        Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100) : 0
    };
  };
  
  const checkMemoryGrowth = (previousMemory: MemoryInfo | null, currentMemory: MemoryInfo): boolean => {
    if (!previousMemory || !currentMemory.usedJSHeapSize) return false;
    
    const growthMB = (currentMemory.usedJSHeapSize - previousMemory.usedJSHeapSize) / (1024 * 1024);
    const growthPercent = ((currentMemory.usedJSHeapSize - previousMemory.usedJSHeapSize) / previousMemory.usedJSHeapSize) * 100;
    
    // Alert if memory grew by more than 5MB or 20% in a short period
    return growthMB > 5 || growthPercent > 20;
  };
  
  return {
    getMemoryInfo,
    checkMemoryGrowth,
    getGrowthAlerts: () => memoryGrowthAlerts,
    incrementGrowthAlerts: () => memoryGrowthAlerts++,
    getSessionDuration: () => Date.now() - startTime,
    getLastMemoryCheck: () => lastMemoryCheck,
    updateLastMemoryCheck: () => lastMemoryCheck = Date.now()
  };
};

/* ===== ENHANCED MARKDOWN PARSER MANAGEMENT ===== */

interface MarkdownParserCache {
  marked: any;
  DOMPurify: any;
  lastUsed: number;
  loadTime: number;
  usageCount: number;
}

let markdownParser: MarkdownParserCache | null = null;
const MARKDOWN_PARSER_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const MARKDOWN_PARSER_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Enhanced cleanup with performance monitoring
const cleanupMarkdownParser = (): boolean => {
  if (markdownParser && Date.now() - markdownParser.lastUsed > MARKDOWN_PARSER_TIMEOUT) {
    errorLogger.logInfo('🧹 Cleaning up unused markdown parser', {
      usageCount: markdownParser.usageCount,
      loadTime: markdownParser.loadTime,
      idleTime: Date.now() - markdownParser.lastUsed
    });
    markdownParser = null;
    return true;
  }
  return false;
};

// Advanced periodic cleanup with memory monitoring
if (typeof window !== 'undefined') {
  setInterval(() => {
    const cleaned = cleanupMarkdownParser();
    if (cleaned) {
      // Force garbage collection hint if available
      if (window.gc && typeof window.gc === 'function') {
        try {
          window.gc();
        } catch (e) {
          // Ignore GC errors
        }
      }
    }
  }, MARKDOWN_PARSER_CLEANUP_INTERVAL);
}

/**
 * Enhanced markdown parser with advanced caching and performance monitoring
 */
async function getMarkdownParser(): Promise<MarkdownParserCache> {
  if (markdownParser) {
    markdownParser.lastUsed = Date.now();
    markdownParser.usageCount++;
    return markdownParser;
  }

  const loadStartTime = Date.now();
  performanceMonitor.startTimer('markdown_load');
  
  errorLogger.logInfo('🚀 Loading markdown parser with enhanced configuration');
  
  try {
    const [{ marked }, { default: DOMPurify }] = await Promise.all([
      import('marked'),
      import('dompurify')
    ]);

    // Enhanced marked configuration with security focus
    marked.setOptions({
      breaks: true,
      gfm: true,
      sanitize: false, // We handle sanitization with DOMPurify
      smartLists: true,
      smartypants: false,
      xhtml: false,
      mangle: false, // Don't mangle email addresses
      headerIds: false, // Prevent XSS via header IDs
      headerPrefix: '', // Clean header prefixes
    });

    // Advanced autolink extension with security enhancements
    marked.use({
      extensions: [{
        name: 'autolink',
        level: 'inline',
        start(src: string) {
          // CRITICAL FIX: Ensure src is a string and not undefined/null
          if (!src || typeof src !== 'string') {
            return -1;
          }
          const match = src.match(/https?:\/\/|www\.|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          return match ? match.index : -1;
        },
        tokenizer(src: string) {
          // CRITICAL FIX: Ensure src is a string and not undefined/null
          if (!src || typeof src !== 'string') {
            return false;
          }
          
          // Enhanced URL patterns with security validation
          const urlRegex = /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/;
          const wwwRegex = /^(www\.[^\s<]+[^<.,:;"')\]\s])/;
          const emailRegex = /^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
          
          let match;
          if (match = urlRegex.exec(src)) {
            // Validate URL for security
            try {
              new URL(match[1]);
              return {
                type: 'autolink',
                raw: match[0],
                href: match[1],
                text: match[1]
              };
            } catch (e) {
              return false; // Invalid URL
            }
          } else if (match = wwwRegex.exec(src)) {
            const fullUrl = 'http://' + match[1];
            try {
              new URL(fullUrl);
              return {
                type: 'autolink', 
                raw: match[0],
                href: fullUrl,
                text: match[1]
              };
            } catch (e) {
              return false;
            }
          } else if (match = emailRegex.exec(src)) {
            // Enhanced email validation
            const email = match[1];
            if (email.length > 254 || email.includes('..')) {
              return false; // Invalid email
            }
            return {
              type: 'autolink',
              raw: match[0], 
              href: 'mailto:' + email,
              text: email
            };
          }
          return false;
        },
        renderer(token: any) {
          // Enhanced external link detection with security headers
          const isExternal = (() => {
            if (!token.href) return false;
            if (token.href.startsWith('mailto:')) return true;
            
            try {
              const linkUrl = new URL(token.href, window.location.href);
              const currentUrl = new URL(window.location.href);
              return linkUrl.origin !== currentUrl.origin;
            } catch (e) {
              return true; // Treat as external if parsing fails
            }
          })();
          
          // Enhanced security attributes for external links
          const securityAttrs = isExternal ? 
            ' target="_blank" rel="noopener noreferrer nofollow"' : '';
          
          // Sanitize href to prevent JavaScript injection
          const sanitizedHref = token.href.replace(/javascript:/gi, '');
          
          return `<a href="${sanitizedHref}"${securityAttrs}>${token.text}</a>`;
        }
      }]
    });

    const loadTime = Date.now() - loadStartTime;
    performanceMonitor.endTimer('markdown_load');
    
    markdownParser = { 
      marked, 
      DOMPurify, 
      lastUsed: Date.now(),
      loadTime,
      usageCount: 1
    };
    
    errorLogger.logInfo('✅ Enhanced markdown parser loaded successfully', {
      loadTime: loadTime + 'ms',
      features: ['autolink', 'security-headers', 'url-validation', 'xss-prevention']
    });

    return markdownParser;
  } catch (error) {
    performanceMonitor.endTimer('markdown_load');
    errorLogger.logError(error as Error, { context: 'markdown_parser_load' });
    throw new Error('Failed to load markdown parser: ' + (error as Error).message);
  }
}

/* ===== CONTENT CACHE IMPLEMENTATION ===== */

class ContentCacheImpl implements ContentCache {
  private cache = new Map<CacheKey, import('../types/providers/content').CachedContent>();
  private hitCount = 0;
  private missCount = 0;
  private evictions = 0;
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: CacheKey): import('../types/providers/content').CachedContent | null {
    const item = this.cache.get(key);
    if (item) {
      // Check if expired
      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        this.missCount++;
        return null;
      }
      // Update access information
      const updatedItem = {
        ...item,
        accessCount: item.accessCount + 1,
        lastAccessed: createTimestamp(Date.now())
      };
      this.cache.set(key, updatedItem);
      this.hitCount++;
      return updatedItem;
    }
    this.missCount++;
    return null;
  }

  set(key: CacheKey, content: import('../types/providers/content').CachedContent, ttl?: Duration): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      // Evict oldest item
      const oldestKey = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)[0][0];
      this.cache.delete(oldestKey);
      this.evictions++;
    }

    const expiresAt = ttl ? createTimestamp(Date.now() + ttl) : content.expiresAt;
    this.cache.set(key, { ...content, expiresAt });
  }

  delete(key: CacheKey): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: CacheKey): boolean {
    const item = this.cache.get(key);
    if (item && Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return !!item;
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): import('../types/providers/content').ContentCacheStats {
    const entries = Array.from(this.cache.values());
    const totalRequests = this.hitCount + this.missCount;
    
    return {
      size: this.cache.size,
      memoryUsage: JSON.stringify(Array.from(this.cache.entries())).length,
      hitRate: totalRequests > 0 ? this.hitCount / totalRequests : 0,
      missRate: totalRequests > 0 ? this.missCount / totalRequests : 0,
      totalHits: this.hitCount,
      totalMisses: this.missCount,
      evictions: this.evictions,
      oldestEntry: Math.min(...entries.map(e => e.createdAt)),
      newestEntry: Math.max(...entries.map(e => e.createdAt))
    };
  }
}

/* ===== CONTENT PROCESSOR IMPLEMENTATION ===== */

class ContentProcessorImpl implements ContentProcessor {
  private securityPolicy: ContentSecurityPolicy;
  private contentCache: ContentCache;

  constructor(securityPolicy: ContentSecurityPolicy, contentCache: ContentCache) {
    this.securityPolicy = securityPolicy;
    this.contentCache = contentCache;
  }

  /**
   * Advanced HTML sanitization with comprehensive security measures
   */
  async sanitizeHTML(
    content: string,
    config?: Partial<HTMLSanitizationConfig>,
    operationId?: OperationId
  ): Promise<SafeHTML> {
    if (!content || typeof content !== 'string') {
      return '' as SafeHTML;
    }

    // Check cache first with enhanced key generation
    const configHash = config ? this.generateChecksum(JSON.stringify(config)) : 'default';
    const cacheKey = `html_${this.generateChecksum(content.substring(0, 100))}_${configHash}` as CacheKey;
    const cached = this.contentCache.get(cacheKey);
    if (cached && cached.contentType === 'html') {
      return cached.content as SafeHTML;
    }

    try {
      // Use advanced sanitization with DOMPurify for comprehensive security
      const parserCache = await getMarkdownParser();
      const { DOMPurify } = parserCache;
      
      const enhancedConfig = {
        ...this.getDOMPurifyConfig(),
        ...config
      };
      
      const sanitized = DOMPurify.sanitize(content, enhancedConfig) as string;
      
      // Enhanced link security processing
      const finalHtml = this.enhanceLinkSecurity(sanitized);
      
      // Validate result with branded type validation
      const safeHtml = createSafeHTML(finalHtml);
      
      // Cache result with enhanced metadata
      this.contentCache.set(cacheKey, {
        content: safeHtml as SafeContent,
        contentType: 'html',
        checksum: this.generateChecksum(content),
        createdAt: createTimestamp(Date.now()),
        expiresAt: createTimestamp(Date.now() + 10 * 60 * 1000), // 10 minutes
        accessCount: 0,
        lastAccessed: createTimestamp(Date.now())
      });

      return safeHtml;
    } catch (error) {
      errorLogger.logError(error as Error, { 
        context: 'html_sanitization_fallback',
        operationId 
      });
      
      // Fallback to basic HTML sanitization with validation
      const fallbackSanitized = sanitizeHTML(content, config);
      return createSafeHTML(fallbackSanitized);
    }
  }

  async validateHTML(
    content: string,
    config?: Partial<HTMLSanitizationConfig>
  ): Promise<ValidationResult> {
    const xssResult = await this.scanForXSS(content);
    const injectionResult = await this.scanForInjection(content);
    
    const errors: string[] = [];
    const warnings: string[] = [];

    if (xssResult.hasXSS) {
      errors.push('XSS patterns detected');
    }

    if (injectionResult.hasInjection) {
      errors.push('Code injection patterns detected');
    }

    if (content.length > this.securityPolicy.maxContentLength) {
      errors.push(`Content exceeds maximum length of ${this.securityPolicy.maxContentLength}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  async processMarkdown(
    markdown: string,
    options?: MarkdownProcessingOptions,
    operationId?: OperationId
  ): Promise<SafeHTML> {
    if (!markdown || typeof markdown !== 'string') {
      return '' as SafeHTML;
    }

    const cacheKey = `md_${markdown.substring(0, 50)}_${JSON.stringify(options)}` as CacheKey;
    const cached = this.contentCache.get(cacheKey);
    if (cached && cached.contentType === 'markdown') {
      return cached.content as SafeHTML;
    }

    try {
      const parserCache = await getMarkdownParser();
      const { marked, DOMPurify } = parserCache;
      
      // Process markdown with enhanced security
      const html = marked.parse(markdown);
      
      // Advanced DOMPurify configuration with comprehensive security rules
      const sanitized = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 's',
          'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
        ],
        ALLOWED_ATTR: [
          'href', 'title', 'target', 'rel', 'alt', 'src', 
          'width', 'height', 'style', 'class'
        ],
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur'],
        FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea'],
        KEEP_CONTENT: true,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
        RETURN_TRUSTED_TYPE: false,
        SAFE_FOR_TEMPLATES: true
      }) as string;

      // Post-process links to add enhanced security attributes
      const finalHtml = this.enhanceLinkSecurity(sanitized);
      
      // Validate result with branded type validation
      const safeHtml = createSafeHTML(finalHtml);

      // Cache result with enhanced metadata
      this.contentCache.set(cacheKey, {
        content: safeHtml as SafeContent,
        contentType: 'markdown',
        checksum: this.generateChecksum(markdown),
        createdAt: createTimestamp(Date.now()),
        expiresAt: createTimestamp(Date.now() + 10 * 60 * 1000),
        accessCount: 0,
        lastAccessed: createTimestamp(Date.now())
      });

      return safeHtml;
    } catch (error) {
      errorLogger.logError(error as Error, { 
        context: 'markdown_processing_fallback',
        operationId 
      });
      // Fallback to basic sanitization with error context
      return this.sanitizeHTML(markdown, undefined, operationId);
    }
  }

  async validateMarkdown(
    markdown: string,
    options?: import('../types/providers/content').MarkdownValidationOptions
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!markdown || typeof markdown !== 'string') {
      errors.push('Invalid markdown content');
      return { isValid: false, errors, warnings };
    }

    // Check for excessive nesting
    const nestingLevel = this.calculateNestingLevel(markdown);
    if (options?.maxNestingLevel && nestingLevel > options.maxNestingLevel) {
      errors.push(`Markdown nesting exceeds maximum level of ${options.maxNestingLevel}`);
    }

    // Check link count
    const linkCount = (markdown.match(/\[.*?\]\(.*?\)/g) || []).length;
    if (options?.maxLinkCount && linkCount > options.maxLinkCount) {
      errors.push(`Too many links: ${linkCount} (max: ${options.maxLinkCount})`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  async sanitizeText(
    text: string,
    options?: import('../types/providers/content').TextSanitizationOptions,
    operationId?: OperationId
  ): Promise<SafeText> {
    if (!text || typeof text !== 'string') {
      return '' as SafeText;
    }

    let sanitized = text;

    if (options?.removeControlCharacters !== false) {
      sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    }

    if (options?.normalizeWhitespace !== false) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }

    if (options?.trimContent !== false) {
      sanitized = sanitized.trim();
    }

    if (options?.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    return createSafeText(sanitized);
  }

  async validateText(
    text: string,
    options?: import('../types/providers/content').TextValidationOptions
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (options?.minLength && text.length < options.minLength) {
      errors.push(`Text too short: ${text.length} (min: ${options.minLength})`);
    }

    if (options?.maxLength && text.length > options.maxLength) {
      errors.push(`Text too long: ${text.length} (max: ${options.maxLength})`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  async validateContent(
    content: string,
    contentType: ContentType,
    options?: import('../types/providers/content').ContentValidationOptions
  ): Promise<ValidationResult> {
    switch (contentType) {
      case 'html':
        return this.validateHTML(content);
      case 'markdown':
        return this.validateMarkdown(content);
      case 'text':
        return this.validateText(content);
      default:
        return { isValid: true, errors: [], warnings: [] };
    }
  }

  async detectMaliciousContent(
    content: string,
    contentType: ContentType
  ): Promise<ThreatDetectionResult> {
    const xssResult = await this.scanForXSS(content);
    const injectionResult = await this.scanForInjection(content);
    
    const threats: DetectedThreat[] = [];
    
    if (xssResult.hasXSS) {
      xssResult.detectedPatterns.forEach(pattern => {
        threats.push({
          type: 'xss',
          severity: pattern.severity,
          description: pattern.description,
          pattern: pattern.name,
          position: { start: 0, end: content.length },
          context: content.substring(0, 100),
          mitigation: 'Content sanitized'
        });
      });
    }

    if (injectionResult.hasInjection) {
      injectionResult.patterns.forEach(pattern => {
        threats.push({
          type: pattern.type === 'javascript' ? 'malicious_script' : 'unknown',
          severity: pattern.severity,
          description: pattern.description,
          pattern: pattern.type,
          position: { start: 0, end: content.length },
          context: content.substring(0, 100),
          mitigation: 'Input sanitized'
        });
      });
    }

    const hasThreat = threats.length > 0;
    const threatLevel = hasThreat ? 
      (threats.some(t => t.severity === 'critical') ? 'critical' : 'high') : 'none';

    return {
      hasThreat,
      threatLevel,
      threats,
      confidence: hasThreat ? 0.8 : 0.1,
      recommendations: hasThreat ? ['Sanitize content', 'Review security policies'] : []
    };
  }

  async scanForXSS(content: string): Promise<XSSDetectionResult> {
    return securityValidator.detectXSS(content);
  }

  async scanForInjection(content: string): Promise<InjectionDetectionResult> {
    return securityValidator.detectInjection(content);
  }

  extractLinks(content: string): readonly LinkInfo[] {
    const links: LinkInfo[] = [];
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)|https?:\/\/[^\s<]+/g;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const url = match[2] || match[0];
      try {
        const parsed = new URL(url);
        links.push({
          url,
          text: match[1] || url,
          position: { start: match.index, end: match.index + match[0].length },
          protocol: parsed.protocol,
          domain: parsed.hostname,
          isExternal: parsed.origin !== window.location.origin
        });
      } catch (e) {
        // Invalid URL, skip
      }
    }

    return links;
  }

  async validateLinks(links: readonly string[]): Promise<readonly LinkValidationResult[]> {
    return links.map(url => {
      const validUrl = validateURL(url);
      return {
        url,
        isValid: !!validUrl,
        isSafe: !!validUrl,
        isReachable: false, // Would need actual HTTP check
        redirectChain: [],
        finalUrl: validUrl || url,
        errors: validUrl ? [] : ['Invalid URL format'],
        warnings: [],
        securityFlags: []
      };
    });
  }

  sanitizeLinks(links: readonly string[]): readonly SecureURL[] {
    return links
      .map(link => {
        const validatedUrl = validateURL(link);
        return validatedUrl ? createSecureURL(validatedUrl) : null;
      })
      .filter((url): url is SecureURL => url !== null);
  }

  async processAttachments(
    files: readonly File[],
    options?: FileProcessingOptions
  ): Promise<readonly ProcessedFile[]> {
    const results: ProcessedFile[] = [];
    
    for (const file of files) {
      const startTime = Date.now();
      const validation = validateFileAttachment(file);
      const processingTime = createDuration(Date.now() - startTime);

      results.push({
        originalFile: file,
        metadata: {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: createTimestamp(file.lastModified),
          extension: file.name.slice(file.name.lastIndexOf('.')),
          checksum: this.generateChecksum(file.name + file.size),
          customProperties: {}
        },
        validation,
        processingTime
      });
    }

    return results;
  }

  async validateFile(
    file: File,
    options?: import('../types/providers/content').FileValidationOptions
  ): Promise<FileValidationResult> {
    return validateFileAttachment(file);
  }

  async processBatch(
    items: readonly import('../types/providers/content').ContentProcessingItem[],
    options?: import('../types/providers/content').BatchProcessingOptions
  ): Promise<readonly import('../types/providers/content').ContentProcessingResult[]> {
    const results: import('../types/providers/content').ContentProcessingResult[] = [];
    
    for (const item of items) {
      const startTime = Date.now();
      try {
        const validation = await this.validateContent(item.content, item.contentType);
        const threatDetection = await this.detectMaliciousContent(item.content, item.contentType);
        
        let processedContent: SafeContent;
        switch (item.contentType) {
          case 'html':
            processedContent = await this.sanitizeHTML(item.content) as SafeContent;
            break;
          case 'markdown':
            processedContent = await this.processMarkdown(item.content) as SafeContent;
            break;
          default:
            processedContent = await this.sanitizeText(item.content) as SafeContent;
        }

        results.push({
          id: item.id,
          success: true,
          processedContent,
          validationResult: validation,
          threatDetection,
          processingTime: createDuration(Date.now() - startTime),
          errors: [],
          warnings: []
        });
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          validationResult: { isValid: false, errors: [(error as Error).message], warnings: [] },
          processingTime: createDuration(Date.now() - startTime),
          errors: [(error as Error).message],
          warnings: []
        });
      }
    }

    return results;
  }

  /**
   * Enhanced link security processing with external link handling
   */
  private enhanceLinkSecurity(html: string): string {
    return html.replace(
      /<a\s+href="([^"]+)"/gi,
      (match, url) => {
        // Check if URL is external with enhanced validation
        const isExternal = (() => {
          if (!url) return false;
          if (url.startsWith('mailto:') || url.startsWith('tel:')) return true;
          
          try {
            const linkUrl = new URL(url, window.location.href);
            const currentUrl = new URL(window.location.href);
            return linkUrl.origin !== currentUrl.origin;
          } catch (e) {
            // Treat as external if URL parsing fails (security precaution)
            return true;
          }
        })();
        
        if (isExternal) {
          // Enhanced security attributes for external links
          return `<a target="_blank" rel="noopener noreferrer nofollow" href="${url}"`;
        }
        return `<a href="${url}"`;
      }
    );
  }

  /**
   * Advanced DOMPurify configuration with comprehensive security rules
   */
  private getDOMPurifyConfig(): any {
    return {
      ALLOWED_TAGS: this.securityPolicy.allowedTags,
      ALLOWED_ATTR: this.securityPolicy.allowedAttributes,
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
      FORBID_ATTR: [
        'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 
        'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset'
      ],
      FORBID_TAGS: [
        'script', 'object', 'embed', 'form', 'input', 'button', 
        'select', 'textarea', 'iframe', 'frame', 'frameset'
      ],
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_TRUSTED_TYPE: false,
      SAFE_FOR_TEMPLATES: true,
      // Additional security options
      SANITIZE_DOM: true,
      WHOLE_DOCUMENT: false,
      USE_PROFILES: {
        html: true,
        svg: false,
        svgFilters: false,
        mathMl: false
      }
    };
  }

  private calculateNestingLevel(markdown: string): number {
    const lines = markdown.split('\n');
    let maxLevel = 0;
    
    for (const line of lines) {
      const headerMatch = line.match(/^(#+)/);
      if (headerMatch) {
        maxLevel = Math.max(maxLevel, headerMatch[1].length);
      }
      
      const listMatch = line.match(/^(\s*)/);
      if (listMatch && (line.includes('*') || line.includes('-'))) {
        maxLevel = Math.max(maxLevel, Math.floor(listMatch[1].length / 2) + 1);
      }
    }
    
    return maxLevel;
  }

  /**
   * Simple hash fallback method
   */
  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Enhanced checksum generation with collision resistance
   */
  private generateChecksum(content: string): string {
    // Enhanced hash function with better distribution
    let hash = 5381; // FNV offset basis
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) + hash) + char; // hash * 33 + char
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Add content length and timestamp for uniqueness
    const finalHash = (hash ^ content.length ^ (Date.now() & 0xFFFF)) >>> 0;
    return finalHash.toString(16).padStart(8, '0');
  }
}

/* ===== CHAT CONTENT PROVIDER IMPLEMENTATION ===== */

class ChatContentProviderImpl extends BaseProvider implements IChatContentProvider {
  public readonly processor: ContentProcessor;
  public readonly securityPolicy: ContentSecurityPolicy;
  public readonly contentCache: ContentCache;

  // Event listeners
  private securityThreatListeners = new Set<SecurityThreatCallback>();
  private contentProcessedListeners = new Set<ContentProcessedCallback>();
  private fileValidatedListeners = new Set<FileValidatedCallback>();
  private policyViolationListeners = new Set<PolicyViolationCallback>();

  // Advanced Memory Management
  private memoryMonitor: MemoryMonitor;
  private lastMemorySnapshot: MemoryInfo | null = null;
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Session Management
  private sessionData = new Map<string, {
    content: SafeContent;
    timestamp: Timestamp;
    accessCount: number;
  }>();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly MEMORY_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
  private readonly MEMORY_ALERT_THRESHOLD = 50; // MB
  private readonly MAX_CONTROLLER_AGE = 10 * 60 * 1000; // 10 minutes

  // Performance Tracking
  private operationTimers = new Map<string, number>();
  private activeOperations = new Set<OperationId>();

  // Metrics
  private metrics: ContentProcessingMetrics = {
    totalProcessed: 0,
    successfulProcessing: 0,
    failedProcessing: 0,
    averageProcessingTime: createDuration(0),
    cacheHitRate: 0,
    threatsDetected: 0,
    threatsByType: {} as Record<import('../types/providers/content').ThreatType, number>,
    sanitizationStats: {} as Record<import('../types/security').SanitizationLevel, number>,
    fileProcessingStats: {
      totalFiles: 0,
      validFiles: 0,
      rejectedFiles: 0,
      averageFileSize: 0
    }
  };

  // Configuration
  private configuration: ContentProviderConfiguration;

  constructor() {
    super(PROVIDER_IDS.CONTENT, 'ChatContentProvider');
    this.securityPolicy = { ...DEFAULT_CONTENT_SECURITY_POLICY };
    this.contentCache = new ContentCacheImpl();
    this.processor = new ContentProcessorImpl(this.securityPolicy, this.contentCache);
    this.memoryMonitor = createMemoryMonitor();
    
    this.configuration = {
      securityPolicy: this.securityPolicy,
      enableCache: true,
      cacheMaxSize: 1000,
      cacheTtl: createDuration(10 * 60 * 1000), // 10 minutes
      enableThreatDetection: true,
      threatDetectionLevel: 'advanced',
      enableFileValidation: true,
      maxFileProcessingTime: createDuration(30000), // 30 seconds
      enableBatchProcessing: true,
      batchSize: 100,
      processingTimeout: createDuration(60000) // 1 minute
    };

    // Initialize memory monitoring
    this.initializeMemoryMonitoring();
    
    // Initialize periodic cleanup
    this.initializePeriodicCleanup();
  }

  protected async onInitialize(options: import('../types/providers/base').ProviderInitOptions): Promise<void> {
    this.debugLog('Initializing ChatContentProvider with advanced features');
    
    // Initialize memory monitoring baseline
    this.lastMemorySnapshot = this.memoryMonitor.getMemoryInfo();
    
    errorLogger.logInfo('🚀 ChatContentProvider initialized', {
      memoryBaseline: this.lastMemorySnapshot,
      securityPolicy: Object.keys(this.securityPolicy).length,
      cacheEnabled: this.configuration.enableCache,
      threatDetection: this.configuration.enableThreatDetection
    });
    
    this.recordOperation();
  }

  protected onCleanup(): void {
    errorLogger.logInfo('🧹 Starting ChatContentProvider cleanup');
    
    // Clear all intervals
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clear all listeners
    this.securityThreatListeners.clear();
    this.contentProcessedListeners.clear();
    this.fileValidatedListeners.clear();
    this.policyViolationListeners.clear();

    // Clear session data
    this.sessionData.clear();
    
    // Clear operation tracking
    this.operationTimers.clear();
    this.activeOperations.clear();

    // Clear cache
    this.contentCache.clear();

    // Clean up markdown parser
    cleanupMarkdownParser();
    
    errorLogger.logInfo('✅ ChatContentProvider cleanup completed', {
      finalMemoryStats: this.memoryMonitor.getMemoryInfo(),
      sessionDuration: this.memoryMonitor.getSessionDuration(),
      totalProcessed: this.metrics.totalProcessed
    });
  }

  protected validateOptions(options: import('../types/providers/base').ProviderInitOptions): boolean {
    return true; // Content provider has minimal requirements
  }

  // Content Operations
  async processUserMessage(content: string, operationId?: OperationId): Promise<SafeContent> {
    // Allow operation before full initialization, but log it
    if (!this.isInitialized) {
      this.debugLog('Processing user message before full initialization - proceeding with basic processing');
    }
    const timerId = this.startTiming('processUserMessage');
    const opId = operationId || (`op_${Date.now()}_${Math.random()}` as OperationId);
    
    try {
      // Track active operation
      this.activeOperations.add(opId);
      this.operationTimers.set(opId.toString(), Date.now());
      
      this.metrics.totalProcessed++;
      
      // Check session cache first
      const sessionKey = `user_${(() => {
        try {
          return this.generateChecksum ? this.generateChecksum(content) : 
                 content.split('').reduce((hash, char) => {
                   const charCode = char.charCodeAt(0);
                   return ((hash << 5) - hash) + charCode;
                 }, 0).toString(16);
        } catch (e) {
          return content.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        }
      })()}`;
      const cachedContent = this.getSessionContent ? this.getSessionContent(sessionKey) : null;
      if (cachedContent) {
        this.metrics.successfulProcessing++;
        return cachedContent;
      }
      
      // Enhanced threat detection with performance monitoring
      const threatStartTime = Date.now();
      const threatResult = await this.processor.detectMaliciousContent(content, 'text');
      const threatDetectionTime = Date.now() - threatStartTime;
      
      if (threatResult.hasThreat && threatResult.threats.length > 0) {
        this.metrics.threatsDetected++;
        
        // Update threat metrics by type
        threatResult.threats.forEach(threat => {
          this.metrics.threatsByType[threat.type] = 
            (this.metrics.threatsByType[threat.type] || 0) + 1;
            
          this.securityThreatListeners.forEach(listener => {
            try {
              listener(threat, content, opId);
            } catch (error) {
              this.logError(error as Error, 'security_threat_listener');
            }
          });
        });
        
        errorLogger.logWarning('🚨 Security threat detected in user message', {
          threatCount: threatResult.threats.length,
          threatLevel: threatResult.threatLevel,
          detectionTime: threatDetectionTime + 'ms',
          operationId: opId
        });
      }

      // Process content with enhanced type detection
      const processingStartTime = Date.now();
      let processedContent: SafeContent;
      
      if (this.containsMarkdown(content)) {
        const markdownResult = await this.processor.processMarkdown(content, undefined, opId);
        processedContent = createSafeContent(markdownResult);
      } else if (this.containsHTML(content)) {
        // If content contains HTML tags, sanitize as HTML
        const htmlResult = await this.processor.sanitizeHTML(content, undefined, opId);
        processedContent = createSafeContent(htmlResult);
      } else {
        const textResult = await this.processor.sanitizeText(content, undefined, opId);
        processedContent = createSafeContent(textResult);
      }
      
      const processingTime = Date.now() - processingStartTime;

      // Cache in session for quick access
      this.manageSession(sessionKey, processedContent);

      // Notify content processed listeners with enhanced context
      this.contentProcessedListeners.forEach(listener => {
        try {
          listener(content, processedContent, opId);
        } catch (error) {
          this.logError(error as Error, 'content_processed_listener');
        }
      });

      this.metrics.successfulProcessing++;
      
      // Update average processing time
      const totalTime = threatDetectionTime + processingTime;
      this.metrics.averageProcessingTime = createDuration(
        ((this.metrics.averageProcessingTime * (this.metrics.successfulProcessing - 1)) + totalTime) / 
        this.metrics.successfulProcessing
      );
      
      this.recordOperation();
      
      errorLogger.logInfo('✅ User message processed successfully', {
        contentLength: content.length,
        processingTime: totalTime + 'ms',
        threatDetectionTime: threatDetectionTime + 'ms',
        containsMarkdown: this.containsMarkdown(content),
        operationId: opId
      });
      
      return processedContent;
    } catch (error) {
      this.metrics.failedProcessing++;
      this.logError(error as Error, 'process_user_message', { operationId: opId });
      throw error;
    } finally {
      // Clean up operation tracking
      this.activeOperations.delete(opId);
      this.endTiming(timerId);
    }
  }

  async processAssistantMessage(content: string, operationId?: OperationId): Promise<SafeContent> {
    // Allow operation before full initialization, but log it
    if (!this.isInitialized) {
      this.debugLog('Processing assistant message before full initialization - proceeding with basic processing');
    }
    const timerId = this.startTiming('processAssistantMessage');
    const opId = operationId || (`op_${Date.now()}_${Math.random()}` as OperationId);
    
    try {
      // Track active operation
      this.activeOperations.add(opId);
      this.operationTimers.set(opId.toString(), Date.now());
      
      this.metrics.totalProcessed++;
      
      // Check session cache first
      const sessionKey = `assistant_${(() => {
        try {
          return this.generateChecksum ? this.generateChecksum(content) : 
                 content.split('').reduce((hash, char) => {
                   const charCode = char.charCodeAt(0);
                   return ((hash << 5) - hash) + charCode;
                 }, 0).toString(16);
        } catch (e) {
          return content.slice(0, 8).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        }
      })()}`;
      const cachedContent = this.getSessionContent ? this.getSessionContent(sessionKey) : null;
      if (cachedContent) {
        this.metrics.successfulProcessing++;
        return cachedContent;
      }
      
      const processingStartTime = Date.now();
      
      // Assistant messages typically contain markdown with enhanced processing
      const markdownResult = await this.processor.processMarkdown(
        content, 
        {
          enableGFM: true,
          enableTables: true,
          enableCodeBlocks: true,
          enableLinks: true,
          enableImages: false, // Disable images for security
          enableHTML: false, // Strict markdown only
          sanitizationLevel: 'strict',
          allowedProtocols: ['http', 'https', 'mailto'],
          maxContentLength: this.securityPolicy.maxContentLength,
          enableLineBreaks: true,
          enableEmoji: false,
          enableMath: false
        },
        opId
      );
      
      const processedContent = createSafeContent(markdownResult);
      
      const processingTime = Date.now() - processingStartTime;

      // Cache in session for quick access
      this.manageSession(sessionKey, processedContent);

      // Enhanced listener notification with processing context
      this.contentProcessedListeners.forEach(listener => {
        try {
          listener(content, processedContent, opId);
        } catch (error) {
          this.logError(error as Error, 'content_processed_listener');
        }
      });

      this.metrics.successfulProcessing++;
      
      // Update average processing time
      this.metrics.averageProcessingTime = createDuration(
        ((this.metrics.averageProcessingTime * (this.metrics.successfulProcessing - 1)) + processingTime) / 
        this.metrics.successfulProcessing
      );
      
      this.recordOperation();
      
      errorLogger.logInfo('✅ Assistant message processed successfully', {
        contentLength: content.length,
        processingTime: processingTime + 'ms',
        markdownComplexity: this.assessMarkdownComplexity(content),
        operationId: opId
      });
      
      return processedContent;
    } catch (error) {
      this.metrics.failedProcessing++;
      this.logError(error as Error, 'process_assistant_message', { operationId: opId });
      throw error;
    } finally {
      // Clean up operation tracking
      this.activeOperations.delete(opId);
      this.endTiming(timerId);
    }
  }

  /**
   * Assess markdown complexity for performance optimization
   */
  private assessMarkdownComplexity(content: string): {
    headers: number;
    links: number;
    codeBlocks: number;
    lists: number;
    complexity: 'low' | 'medium' | 'high';
  } {
    const headers = (content.match(/^#{1,6}\s/gm) || []).length;
    const links = (content.match(/\[.*?\]\(.*?\)/g) || []).length;
    const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
    const lists = (content.match(/^\s*[-*+]\s/gm) || []).length;
    
    const totalComplexity = headers + links * 2 + codeBlocks * 3 + lists;
    let complexity: 'low' | 'medium' | 'high' = 'low';
    
    if (totalComplexity > 20) complexity = 'high';
    else if (totalComplexity > 10) complexity = 'medium';
    
    return { headers, links, codeBlocks, lists, complexity };
  }

  async validateFileUpload(
    file: File,
    options?: import('../types/providers/content').FileValidationOptions
  ): Promise<FileValidationResult> {
    // Allow operation before full initialization, but log it
    if (!this.isInitialized) {
      this.debugLog('Validating file upload before full initialization - proceeding with basic validation');
    }
    const timerId = this.startTiming('validateFileUpload');
    
    try {
      this.metrics.fileProcessingStats.totalFiles++;
      
      const result = await this.processor.validateFile(file, options);
      
      if (result.isValid) {
        this.metrics.fileProcessingStats.validFiles++;
      } else {
        this.metrics.fileProcessingStats.rejectedFiles++;
      }

      // Update average file size
      const totalFiles = this.metrics.fileProcessingStats.totalFiles;
      this.metrics.fileProcessingStats.averageFileSize = 
        (this.metrics.fileProcessingStats.averageFileSize * (totalFiles - 1) + file.size) / totalFiles;

      // Notify file validated listeners
      this.fileValidatedListeners.forEach(listener => {
        try {
          listener(file, result);
        } catch (error) {
          this.logError(error as Error, 'file_validated_listener');
        }
      });

      this.recordOperation();
      return result;
    } finally {
      this.endTiming(timerId);
    }
  }

  async scanForThreats(
    content: string,
    contentType: ContentType
  ): Promise<readonly DetectedThreat[]> {
    const result = await this.processor.detectMaliciousContent(content, contentType);
    return result.threats;
  }

  // Content Cache Operations
  getCachedContent(hash: string): SafeContent | null {
    const cached = this.contentCache.get(hash as CacheKey);
    return cached ? cached.content : null;
  }

  setCachedContent(hash: string, content: SafeContent, ttl?: Duration): void {
    this.contentCache.set(hash as CacheKey, {
      content,
      contentType: 'text',
      checksum: hash,
      createdAt: createTimestamp(Date.now()),
      expiresAt: createTimestamp(Date.now() + (ttl || this.configuration.cacheTtl)),
      accessCount: 0,
      lastAccessed: createTimestamp(Date.now())
    }, ttl);
  }

  clearContentCache(): void {
    const statsBeforeClear = this.contentCache.getStats();
    this.contentCache.clear();
    
    errorLogger.logInfo('🧹 Content cache cleared', {
      previousStats: statsBeforeClear,
      clearedEntries: statsBeforeClear.size
    });
  }

  getCacheStats(): import('../types/providers/content').ContentCacheStats {
    return this.contentCache.getStats();
  }

  // Security Policy Management
  async updateSecurityPolicy(policy: Partial<ContentSecurityPolicy>): Promise<void> {
    Object.assign(this.securityPolicy, policy);
    this.configuration.securityPolicy = this.securityPolicy;
  }

  getSecurityPolicy(): ContentSecurityPolicy {
    return { ...this.securityPolicy };
  }

  async resetSecurityPolicy(): Promise<void> {
    this.securityPolicy = { ...DEFAULT_CONTENT_SECURITY_POLICY };
    this.configuration.securityPolicy = this.securityPolicy;
  }

  // Event Handlers
  onSecurityThreatDetected(callback: SecurityThreatCallback): () => void {
    this.securityThreatListeners.add(callback);
    return () => this.securityThreatListeners.delete(callback);
  }

  onContentProcessed(callback: ContentProcessedCallback): () => void {
    this.contentProcessedListeners.add(callback);
    return () => this.contentProcessedListeners.delete(callback);
  }

  onFileValidated(callback: FileValidatedCallback): () => void {
    this.fileValidatedListeners.add(callback);
    return () => this.fileValidatedListeners.delete(callback);
  }

  onPolicyViolation(callback: PolicyViolationCallback): () => void {
    this.policyViolationListeners.add(callback);
    return () => this.policyViolationListeners.delete(callback);
  }

  // Performance & Monitoring
  getProcessingMetrics(): ContentProcessingMetrics {
    // Update cache hit rate and enhanced metrics
    const cacheStats = this.contentCache.getStats();
    this.metrics.cacheHitRate = cacheStats.hitRate;
    
    // Include memory and session metrics
    const memoryInfo = this.memoryMonitor.getMemoryInfo();
    const enhancedMetrics = {
      ...this.metrics,
      memoryMetrics: {
        currentMemoryMB: (memoryInfo.usedJSHeapSize / (1024 * 1024)).toFixed(2),
        memoryUtilization: memoryInfo.memoryUtilization + '%',
        sessionDurationMinutes: memoryInfo.sessionDurationMinutes,
        memoryGrowthAlerts: this.memoryMonitor.getGrowthAlerts()
      },
      sessionMetrics: {
        activeSessions: this.sessionData.size,
        activeOperations: this.activeOperations.size,
        operationTimers: this.operationTimers.size
      },
      performanceMetrics: {
        cacheStats,
        parserUsage: markdownParser ? {
          usageCount: markdownParser.usageCount,
          loadTime: markdownParser.loadTime,
          lastUsed: Date.now() - markdownParser.lastUsed
        } : null
      }
    };
    
    return enhancedMetrics as ContentProcessingMetrics;
  }

  clearProcessingMetrics(): void {
    errorLogger.logInfo('🧹 Clearing processing metrics', {
      previousMetrics: {
        totalProcessed: this.metrics.totalProcessed,
        successRate: this.metrics.totalProcessed > 0 ? 
          (this.metrics.successfulProcessing / this.metrics.totalProcessed * 100).toFixed(2) + '%' : '0%',
        threatsDetected: this.metrics.threatsDetected
      }
    });
    
    this.metrics = {
      totalProcessed: 0,
      successfulProcessing: 0,
      failedProcessing: 0,
      averageProcessingTime: createDuration(0),
      cacheHitRate: 0,
      threatsDetected: 0,
      threatsByType: {} as Record<import('../types/providers/content').ThreatType, number>,
      sanitizationStats: {} as Record<import('../types/security').SanitizationLevel, number>,
      fileProcessingStats: {
        totalFiles: 0,
        validFiles: 0,
        rejectedFiles: 0,
        averageFileSize: 0
      }
    };
    
    // Also clear session data and operation tracking
    this.sessionData.clear();
    this.operationTimers.clear();
    this.activeOperations.clear();
  }

  // Configuration
  getConfiguration(): ContentProviderConfiguration {
    return { ...this.configuration };
  }

  async updateConfiguration(config: Partial<ContentProviderConfiguration>): Promise<void> {
    const previousConfig = { ...this.configuration };
    
    Object.assign(this.configuration, config);
    
    if (config.securityPolicy) {
      await this.updateSecurityPolicy(config.securityPolicy);
    }
    
    // Handle cache size changes
    if (config.cacheMaxSize && config.cacheMaxSize !== previousConfig.cacheMaxSize) {
      // Clear cache if new size is smaller
      if (config.cacheMaxSize < this.contentCache.size()) {
        this.contentCache.clear();
        errorLogger.logInfo('🧹 Cache cleared due to size reduction', {
          previousSize: previousConfig.cacheMaxSize,
          newSize: config.cacheMaxSize
        });
      }
    }
    
    errorLogger.logInfo('⚙️ ContentProvider configuration updated', {
      changedFields: Object.keys(config),
      newConfiguration: this.configuration
    });
  }

  // Diagnostics
  getDiagnostics(): ContentProviderDiagnostics {
    const memoryInfo = this.memoryMonitor.getMemoryInfo();
    const performanceIssues = this.identifyPerformanceIssues();
    
    return {
      metrics: this.getProcessingMetrics(),
      cacheStats: this.getCacheStats(),
      securityPolicy: this.getSecurityPolicy(),
      recentThreats: [], // Would store recent threats in production
      recentErrors: [], // Would store recent errors in production
      memoryUsage: memoryInfo.usedJSHeapSize,
      performanceIssues,
      enhancedDiagnostics: {
        memoryDetails: memoryInfo,
        sessionHealth: {
          totalSessions: this.sessionData.size,
          activeOperations: this.activeOperations.size,
          averageSessionAge: this.calculateAverageSessionAge(),
          memoryGrowthAlerts: this.memoryMonitor.getGrowthAlerts()
        },
        systemHealth: {
          parserStatus: markdownParser ? 'loaded' : 'unloaded',
          cacheEfficiency: this.contentCache.getStats().hitRate,
          processingSuccessRate: this.metrics.totalProcessed > 0 ? 
            (this.metrics.successfulProcessing / this.metrics.totalProcessed) : 0
        }
      }
    };
  }

  /**
   * Identify potential performance issues
   */
  private identifyPerformanceIssues(): readonly string[] {
    const issues: string[] = [];
    const memoryInfo = this.memoryMonitor.getMemoryInfo();
    const cacheStats = this.contentCache.getStats();
    
    // Memory issues
    if (memoryInfo.memoryUtilization > 85) {
      issues.push('High memory utilization detected');
    }
    
    if (this.memoryMonitor.getGrowthAlerts() > 3) {
      issues.push('Excessive memory growth alerts');
    }
    
    // Cache issues
    if (cacheStats.hitRate < 0.3 && cacheStats.totalHits + cacheStats.totalMisses > 100) {
      issues.push('Low cache hit rate affecting performance');
    }
    
    // Processing issues
    if (this.metrics.failedProcessing / this.metrics.totalProcessed > 0.1) {
      issues.push('High processing failure rate');
    }
    
    // Session management issues
    if (this.sessionData.size > 1000) {
      issues.push('Excessive session data accumulation');
    }
    
    if (this.activeOperations.size > 50) {
      issues.push('Too many concurrent operations');
    }
    
    return issues;
  }

  /**
   * Calculate average session age for diagnostics
   */
  private calculateAverageSessionAge(): number {
    if (this.sessionData.size === 0) return 0;
    
    const now = Date.now();
    let totalAge = 0;
    
    this.sessionData.forEach(data => {
      totalAge += now - data.timestamp;
    });
    
    return totalAge / this.sessionData.size;
  }

  exportThreatLog(): ThreatLogExport {
    const now = createTimestamp(Date.now());
    const sessionStart = createTimestamp(Date.now() - this.memoryMonitor.getSessionDuration());
    
    return {
      version: '2.0.0',
      exportTime: now,
      threats: [], // Would export actual threat log in production
      summary: { ...this.metrics.threatsByType } as Record<import('../types/providers/content').ThreatType, number>,
      timeRange: {
        start: sessionStart,
        end: now
      },
      enhancedData: {
        totalThreatsDetected: this.metrics.threatsDetected,
        sessionDuration: this.memoryMonitor.getSessionDuration(),
        contentProcessed: this.metrics.totalProcessed,
        securityPolicyVersion: 'enhanced-v2',
        memoryGrowthAlerts: this.memoryMonitor.getGrowthAlerts(),
        averageProcessingTime: this.metrics.averageProcessingTime
      }
    };
  }

  // Provider Event Emitter Interface
  public readonly emit = <T extends unknown>(type: import('../types/providers/base').ProviderEventType, data: T, correlationId?: OperationId): void => {
    this.debugLog('Event emitted', { type, correlationId });
  };

  public readonly on = <T extends unknown>(type: import('../types/providers/base').ProviderEventType, listener: import('../types/providers/base').ProviderEventListener<T>): import('../types/providers/base').ProviderEventSubscription => {
    return () => {};
  };

  public readonly once = <T extends unknown>(type: import('../types/providers/base').ProviderEventType, listener: import('../types/providers/base').ProviderEventListener<T>): import('../types/providers/base').ProviderEventSubscription => {
    return () => {};
  };

  public readonly off = (type: import('../types/providers/base').ProviderEventType, listener: import('../types/providers/base').ProviderEventListener): void => {
    // Implementation would remove listener
  };

  public readonly removeAllListeners = (type?: import('../types/providers/base').ProviderEventType): void => {
    // Implementation would remove all listeners
  };

  /**
   * Initialize advanced memory monitoring system
   */
  private initializeMemoryMonitoring(): void {
    this.memoryCheckInterval = setInterval(() => {
      const currentMemory = this.memoryMonitor.getMemoryInfo();
      const sessionDuration = this.memoryMonitor.getSessionDuration();
      
      // Log memory status every 10 minutes
      if (sessionDuration % (10 * 60 * 1000) < this.MEMORY_CHECK_INTERVAL) {
        errorLogger.logInfo('📊 Memory Status Report', {
          ...currentMemory,
          activeOperations: this.activeOperations.size,
          sessionDataSize: this.sessionData.size,
          cacheSize: this.contentCache.size(),
          processingMetrics: {
            totalProcessed: this.metrics.totalProcessed,
            successRate: this.metrics.totalProcessed > 0 ? 
              (this.metrics.successfulProcessing / this.metrics.totalProcessed * 100).toFixed(2) + '%' : '0%'
          }
        });
      }
      
      // Check for memory growth issues
      if (this.lastMemorySnapshot) {
        const hasMemoryGrowth = this.memoryMonitor.checkMemoryGrowth(
          this.lastMemorySnapshot, 
          currentMemory
        );
        
        if (hasMemoryGrowth) {
          this.memoryMonitor.incrementGrowthAlerts();
          const growthMB = (currentMemory.usedJSHeapSize - this.lastMemorySnapshot.usedJSHeapSize) / (1024 * 1024);
          
          errorLogger.logWarning('🚨 Memory growth detected in ContentProvider', {
            growthMB: growthMB.toFixed(2),
            currentMemoryMB: (currentMemory.usedJSHeapSize / (1024 * 1024)).toFixed(2),
            sessionDurationMinutes: currentMemory.sessionDurationMinutes,
            totalGrowthAlerts: this.memoryMonitor.getGrowthAlerts(),
            activeOperations: this.activeOperations.size,
            cacheStats: this.contentCache.getStats()
          });
          
          // Trigger aggressive cleanup if memory growth is excessive
          if (growthMB > this.MEMORY_ALERT_THRESHOLD || this.memoryMonitor.getGrowthAlerts() > 3) {
            this.performAggressiveCleanup();
          }
        }
      }
      
      this.lastMemorySnapshot = currentMemory;
      this.memoryMonitor.updateLastMemoryCheck();
    }, this.MEMORY_CHECK_INTERVAL);
  }

  /**
   * Initialize periodic cleanup processes
   */
  private initializePeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let sessionsCleanedUp = 0;
      let operationsCleanedUp = 0;
      
      // Clean up expired session data
      this.sessionData.forEach((data, sessionId) => {
        if (now - data.timestamp > this.SESSION_TIMEOUT) {
          this.sessionData.delete(sessionId);
          sessionsCleanedUp++;
        }
      });
      
      // Clean up old operation timers
      this.operationTimers.forEach((timestamp, operationId) => {
        if (now - timestamp > this.MAX_CONTROLLER_AGE) {
          this.operationTimers.delete(operationId);
          operationsCleanedUp++;
        }
      });
      
      // Force markdown parser cleanup
      const parserCleaned = cleanupMarkdownParser();
      
      if (sessionsCleanedUp > 0 || operationsCleanedUp > 0 || parserCleaned) {
        errorLogger.logInfo('🧹 Periodic cleanup completed', {
          sessionsCleanedUp,
          operationsCleanedUp,
          parserCleaned,
          remainingSessions: this.sessionData.size,
          remainingOperations: this.operationTimers.size
        });
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Perform aggressive memory cleanup when growth is detected
   */
  private performAggressiveCleanup(): void {
    errorLogger.logWarning('🧹 Performing aggressive memory cleanup');
    
    const beforeStats = {
      cacheSize: this.contentCache.size(),
      sessionDataSize: this.sessionData.size(),
      activeOperations: this.activeOperations.size
    };
    
    // Clear old cache entries
    this.contentCache.clear();
    
    // Clear expired session data aggressively (reduce timeout)
    const now = Date.now();
    const aggressiveTimeout = this.SESSION_TIMEOUT / 2;
    
    this.sessionData.forEach((data, sessionId) => {
      if (now - data.timestamp > aggressiveTimeout) {
        this.sessionData.delete(sessionId);
      }
    });
    
    // Clear old operation tracking
    this.operationTimers.clear();
    this.activeOperations.clear();
    
    // Force parser cleanup
    cleanupMarkdownParser();
    
    // Force garbage collection hint if available
    if (typeof window !== 'undefined' && (window as any).gc) {
      try {
        (window as any).gc();
      } catch (e) {
        // Ignore GC errors
      }
    }
    
    const afterStats = {
      cacheSize: this.contentCache.size(),
      sessionDataSize: this.sessionData.size(),
      activeOperations: this.activeOperations.size
    };
    
    errorLogger.logInfo('✅ Aggressive cleanup completed', {
      before: beforeStats,
      after: afterStats,
      memoryFreed: {
        cache: beforeStats.cacheSize - afterStats.cacheSize,
        sessions: beforeStats.sessionDataSize - afterStats.sessionDataSize,
        operations: beforeStats.activeOperations - afterStats.activeOperations
      }
    });
  }

  /**
   * Enhanced session management for content caching
   */
  private manageSession(sessionId: string, content: SafeContent): void {
    const now = createTimestamp(Date.now());
    const existing = this.sessionData.get(sessionId);
    
    this.sessionData.set(sessionId, {
      content,
      timestamp: now,
      accessCount: existing ? existing.accessCount + 1 : 1
    });
  }

  /**
   * Get session content with TTL validation
   */
  private getSessionContent(sessionId: string): SafeContent | null {
    const sessionEntry = this.sessionData.get(sessionId);
    if (!sessionEntry) return null;
    
    const now = Date.now();
    if (now - sessionEntry.timestamp > this.SESSION_TIMEOUT) {
      this.sessionData.delete(sessionId);
      return null;
    }
    
    // Update access time and count
    sessionEntry.timestamp = createTimestamp(now);
    sessionEntry.accessCount++;
    
    return sessionEntry.content;
  }

  // Private helper methods
  private containsMarkdown(content: string): boolean {
    const markdownPatterns = [
      /^#{1,6}\s/, // Headers
      /\*\*.*\*\*/, // Bold
      /\*.*\*/, // Italic
      /\[.*\]\(.*\)/, // Links
      /^[-*+]\s/, // Lists
      /`.*`/, // Code
      /^>\s/ // Blockquotes
    ];
    
    return markdownPatterns.some(pattern => pattern.test(content));
  }

  private containsHTML(content: string): boolean {
    // Check for HTML tags
    const htmlPatterns = [
      /<[a-zA-Z][^>]*>/,  // Opening tags
      /<\/[a-zA-Z][^>]*>/, // Closing tags
      /&[a-zA-Z0-9#]+;/   // HTML entities
    ];
    
    return htmlPatterns.some(pattern => pattern.test(content));
  }
}

/* ===== REACT CONTEXT ===== */

const ChatContentContext = createContext<IChatContentProvider | null>(null);

/* ===== PROVIDER COMPONENT ===== */

export const ChatContentProvider: React.FC<ChatContentProviderProps> = ({
  children,
  securityPolicy,
  enableCache = true,
  cacheSize = 1000,
  enableThreatDetection = true,
  threatDetectionLevel = 'advanced',
  onError,
  onThreatDetected,
  onPolicyViolation
}) => {
  // Create provider instance synchronously to avoid null context issues
  const providerRef = useRef<ChatContentProviderImpl | null>(null);
  
  if (!providerRef.current) {
    providerRef.current = new ChatContentProviderImpl();
  }

  // Initialize provider asynchronously
  useEffect(() => {
    const initProvider = async () => {
      try {
        const provider = providerRef.current!;

        // Update configuration
        await provider.updateConfiguration({
          enableCache,
          cacheMaxSize: cacheSize,
          enableThreatDetection,
          threatDetectionLevel,
          securityPolicy: securityPolicy || DEFAULT_CONTENT_SECURITY_POLICY
        });

        // Set up event handlers
        if (onThreatDetected) {
          provider.onSecurityThreatDetected(onThreatDetected);
        }

        if (onPolicyViolation) {
          provider.onPolicyViolation(onPolicyViolation);
        }

        // Initialize provider
        await (provider as any).initialize({
          tenantHash: 'test_tenant_hash_12345',
          sessionId: null,
          debug: process.env.NODE_ENV === 'development'
        });
      } catch (error) {
        console.error('Failed to initialize ChatContentProvider:', error);
        if (onError) {
          onError(error as any);
        }
      }
    };

    initProvider();

    return () => {
      if (providerRef.current) {
        providerRef.current.cleanup();
      }
    };
  }, []);

  // Provider is always available, even during initialization
  const providerValue = providerRef.current;

  return (
    <ChatContentContext.Provider value={providerValue}>
      {children}
    </ChatContentContext.Provider>
  );
};

/* ===== CUSTOM HOOK ===== */

export const useChatContent = (): IChatContentProvider => {
  const context = useContext(ChatContentContext);
  if (!context) {
    throw new Error('useChatContent must be used within a ChatContentProvider');
  }
  return context;
};

export default ChatContentProvider;