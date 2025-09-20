import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked for proper markdown parsing
marked.setOptions({
  gfm: true,          // GitHub Flavored Markdown
  breaks: true,       // Line breaks
  mangle: false,      // Keep emails intact
  headerIds: false,   // Avoid auto-id clutter
  pedantic: false,    // Don't be strict
  smartypants: false, // Don't use smart quotes
  sanitize: false     // We handle sanitization with DOMPurify
});

// Regex for email and URL detection
const emailRegex = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,})\b/gi;
const urlRegex = /(?:^|[^"])(https?:\/\/[^\s<>"]+[^\s<>".,:;'!?\]\)])/gi;

/**
 * Convert plain URLs and email addresses to markdown links
 */
const linkifyText = (text) => {
  // First linkify emails
  let result = text.replace(emailRegex, (match) => `[${match}](mailto:${match})`);
  
  // Then linkify URLs (but avoid double-linking markdown links)
  result = result.replace(urlRegex, (match, url) => {
    // Check if this URL is already part of a markdown link
    const beforeUrl = result.substring(0, result.indexOf(url));
    if (beforeUrl.endsWith('](') || beforeUrl.endsWith('(')) {
      return match; // Already in markdown link format, don't double-link
    }
    return match.replace(url, `[${url}](${url})`);
  });
  
  return result;
};

/**
 * Process markdown text to safe HTML with proper link handling
 * @param {string} rawText - The raw text to process
 * @returns {string} - Safe HTML string ready for rendering
 */
export function renderMarkdownToSafeHtml(rawText) {
  if (!rawText) return '';
  
  // 1) Convert to string and linkify URLs and emails
  const text = String(rawText);
  const withLinks = linkifyText(text);
  
  // Debug logging
  console.log('[MarkdownProcessor] Input:', text.substring(0, 200));
  console.log('[MarkdownProcessor] After linkify:', withLinks.substring(0, 200));
  
  // 2) Convert markdown to HTML
  const html = marked.parse(withLinks);
  console.log('[MarkdownProcessor] After marked:', html.substring(0, 200));
  
  // 3) Sanitize HTML while preserving links
  const safeHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'strike', 'del', 's',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ],
    ALLOWED_ATTR: [
      'href', 'title', 'target', 'rel', 'alt', 'src',
      'width', 'height', 'class', 'start'
    ],
    ADD_ATTR: ['target', 'rel'],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'button'],
    KEEP_CONTENT: true
  });
  
  // 4) Post-process to ensure all external links have target="_blank"
  // This is a simple regex approach since DOMPurify already made it safe
  const finalHtml = safeHtml.replace(
    /<a\s+([^>]*href=["'](?:https?:|mailto:|tel:)[^"']+["'][^>]*)>/gi,
    (match, attrs) => {
      // Check if target already exists
      if (!/target=/i.test(attrs)) {
        return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
      }
      return match;
    }
  );
  
  console.log('[MarkdownProcessor] Final HTML:', finalHtml.substring(0, 200));
  
  return finalHtml;
}

/**
 * Process markdown for streaming (lighter weight, real-time updates)
 * Same as renderMarkdownToSafeHtml but can be optimized if needed
 */
export function renderStreamingMarkdown(rawText) {
  // For now, use the same processing
  // Could optimize later if performance becomes an issue
  return renderMarkdownToSafeHtml(rawText);
}