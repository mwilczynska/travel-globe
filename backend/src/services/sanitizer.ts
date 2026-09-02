import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

// Create a JSDOM window for DOMPurify
const window = new JSDOM('').window;
const purify = createDOMPurify(window);

/**
 * Sanitize HTML content, removing potentially dangerous elements
 * Allows basic formatting tags but strips scripts, event handlers, etc.
 */
export function sanitizeHtml(dirty: string): string {
  return purify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Escape HTML entities for plain text fields
 * Use this for fields that should not contain any HTML
 */
export function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char]);
}

/**
 * Sanitize text by removing HTML tags entirely
 * Returns plain text with no formatting
 */
export function sanitizeText(dirty: string): string {
  // First strip all HTML tags
  const stripped = purify.sanitize(dirty, { ALLOWED_TAGS: [] });
  // Then unescape HTML entities that DOMPurify might have left
  return stripped;
}

/**
 * Sanitize a comment's author name and content
 */
export function sanitizeComment(authorName: string, content: string): { authorName: string; content: string } {
  return {
    // Author name should be plain text only
    authorName: sanitizeText(authorName).trim(),
    // Comment content can have basic formatting
    content: sanitizeHtml(content).trim(),
  };
}
