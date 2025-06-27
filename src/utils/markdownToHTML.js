import { marked } from 'marked';
import { sanitizeHTML } from './security';

// Helper function to check if URL is external
function isExternalUrl(url) {
  if (!url) return false;
  
  // Handle mailto links
  if (url.startsWith('mailto:')) return true;
  
  try {
    const linkUrl = new URL(url, window.location.href);
    const currentUrl = new URL(window.location.href);
    
    // Compare origins (protocol + domain + port)
    return linkUrl.origin !== currentUrl.origin;
  } catch (e) {
    // If URL parsing fails, treat as external for safety
    return true;
  }
}

// Configure marked to process markdown within HTML
marked.setOptions({
  breaks: true,
  gfm: true,
  mangle: false  // Don't mangle email addresses
});

// Custom extension to auto-link URLs and emails
marked.use({
  extensions: [{
    name: 'autolink',
    level: 'inline',
    start(src) {
      const match = src.match(/https?:\/\/|www\.|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      return match ? match.index : -1;
    },
    tokenizer(src) {
      const urlRegex = /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/;
      const wwwRegex = /^(www\.[^\s<]+[^<.,:;"')\]\s])/;
      const emailRegex = /^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
      
      let match;
      if (match = urlRegex.exec(src)) {
        return {
          type: 'autolink',
          raw: match[0],
          href: match[1],
          text: match[1]
        };
      } else if (match = wwwRegex.exec(src)) {
        return {
          type: 'autolink', 
          raw: match[0],
          href: 'http://' + match[1],
          text: match[1]
        };
      } else if (match = emailRegex.exec(src)) {
        return {
          type: 'autolink',
          raw: match[0], 
          href: 'mailto:' + match[1],
          text: match[1]
        };
      }
      return false;
    },
    renderer(token) {
      const isExternal = isExternalUrl(token.href);
      const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${token.href}"${targetAttr}>${token.text}</a>`;
    }
  }]
});

// Don't use custom renderer - it causes [object Object] issues

/**
 * Converts markdown text to sanitized HTML
 * @param {string} markdown - The markdown text to convert
 * @returns {string} - Sanitized HTML string
 */
export function markdownToHTML(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return '';
  }

  console.log('🔍 markdownToHTML - Input:', markdown);

  try {
    // Convert markdown to HTML
    const html = marked.parse(markdown);
    console.log('🔍 markdownToHTML - After marked:', html);
    
    // Sanitize the HTML to prevent XSS attacks using enhanced security
    const sanitizedHtml = sanitizeHTML(html);
    
    // Process links to add target="_blank" only for external URLs
    const finalHtml = sanitizedHtml.replace(
      /<a\s+href="([^"]+)"/gi,
      (match, url) => {
        const isExternal = isExternalUrl(url);
        if (isExternal) {
          return `<a target="_blank" rel="noopener noreferrer" href="${url}"`;
        }
        return `<a href="${url}"`;
      }
    );
    
    console.log('🔍 markdownToHTML - After sanitize:', finalHtml);
    
    return finalHtml;
  } catch (error) {
    console.error('Error converting markdown to HTML:', error);
    return '';
  }
}
