import { marked } from 'marked';
import { sanitizeHTML } from './security';

// Configure marked to process markdown within HTML
marked.setOptions({
  breaks: true,
  gfm: true
});

/**
 * Converts markdown text to sanitized HTML
 * @param {string} markdown - The markdown text to convert
 * @returns {string} - Sanitized HTML string
 */
export function markdownToHTML(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  try {
    // Convert markdown to HTML
    const html = marked.parse(markdown);
    
    // Sanitize the HTML to prevent XSS attacks using enhanced security
    const sanitizedHtml = sanitizeHTML(html);
    
    return sanitizedHtml;
  } catch (error) {
    console.error('Error converting markdown to HTML:', error);
    return '';
  }
}
