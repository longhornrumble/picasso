// This is a temporary patch file to fix the dynamic import issue
// We'll replace getMarkdownParser with a simple object return

// Export the fix function
export function getMarkdownParserFixed(marked, DOMPurify) {
  // Initialize marked options
  marked.setOptions({
    breaks: true,
    gfm: true,
    sanitize: false,
    smartLists: true,
    smartypants: false,
    xhtml: false,
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
        // Check if URL is external
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
        
        const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${token.href}"${targetAttr}>${token.text}</a>`;
      }
    }]
  });

  return { marked, DOMPurify };
}