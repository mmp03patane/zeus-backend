// ============================================
// SMS Character Utilities
// Handles GSM-7 vs Unicode detection for Cellcast
// ============================================

// GSM-7 Basic Character Set (doesn't require escape)
const GSM_7BIT_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

// GSM-7 Extended Character Set (requires escape, counts as 2 chars)
const GSM_7BIT_EXTENDED = "^{}\\[~]|€";

// Common Unicode characters that trigger UCS-2 encoding
const COMMON_UNICODE_CHARS = {
  // Smart quotes
  '\u2018': "'",  // ' → '
  '\u2019': "'",  // ' → '
  '\u201C': '"',  // " → "
  '\u201D': '"',  // " → "
  
  // Dashes
  '\u2013': '-',  // – (en dash) → -
  '\u2014': '-',  // — (em dash) → -
  
  // Other common
  '\u2026': '...',  // … → ...
  '\u00A9': '(c)',  // © → (c)
  '\u00AE': '(R)',  // ® → (R)
  '\u2122': '(TM)', // ™ → (TM)
};

/**
 * Detects if a message contains Unicode characters (non GSM-7)
 * @param {string} message - The SMS message to check
 * @returns {Object} { hasUnicode: boolean, unicodeChars: array, suggestions: object }
 */
const detectUnicode = (message) => {
  const unicodeChars = [];
  const suggestions = {};
  
  for (let i = 0; i < message.length; i++) {
    const char = message[i];
    const isBasicGSM = GSM_7BIT_BASIC.includes(char);
    const isExtendedGSM = GSM_7BIT_EXTENDED.includes(char);
    
    if (!isBasicGSM && !isExtendedGSM) {
      unicodeChars.push({
        char: char,
        position: i,
        code: char.charCodeAt(0).toString(16).toUpperCase()
      });
      
      // Provide replacement suggestion if available
      if (COMMON_UNICODE_CHARS[char]) {
        suggestions[char] = COMMON_UNICODE_CHARS[char];
      }
    }
  }
  
  return {
    hasUnicode: unicodeChars.length > 0,
    unicodeChars: unicodeChars,
    suggestions: suggestions
  };
};

/**
 * Replace common Unicode characters with GSM-7 equivalents
 * @param {string} message - The message to clean
 * @returns {string} Cleaned message
 */
const replaceUnicodeWithGSM = (message) => {
  let cleaned = message;
  
  for (const [unicode, replacement] of Object.entries(COMMON_UNICODE_CHARS)) {
    cleaned = cleaned.split(unicode).join(replacement);
  }
  
  return cleaned;
};

/**
 * Calculate SMS parts and character limits based on encoding
 * @param {string} message - The SMS message
 * @returns {Object} { encoding, charCount, charLimit, smsCount, isValid }
 */
const calculateSMSStats = (message) => {
  const unicodeDetection = detectUnicode(message);
  
  let encoding, maxLength;
  
  if (unicodeDetection.hasUnicode) {
    // Unicode (UCS-2) encoding detected
    encoding = 'Unicode';
    maxLength = 300; // Business limit (Cellcast allows 402, but we cap at 300)
  } else {
    // GSM-7 encoding
    encoding = 'GSM-7';
    maxLength = 300; // Business limit (Cellcast allows 918, but we cap at 300)
  }
  
  const charCount = message.length;
  
  // SIMPLIFIED PRICING: Every 155 characters = 1 SMS = $0.25
  const smsCount = Math.ceil(charCount / 155);
  
  const isValid = charCount <= maxLength;
  
  return {
    encoding,
    charCount,
    charLimit: 155, // Fixed at 155 for pricing purposes
    smsCount,
    isValid,
    maxLength,
    unicodeDetection
  };
};

/**
 * Calculate SMS cost based on message
 * SIMPLIFIED: Every 155 characters = $0.25 (regardless of actual SMS segmentation)
 * @param {string} message - The SMS message
 * @returns {Object} { smsCount, cost, stats }
 */
const calculateSMSCost = (message) => {
  const stats = calculateSMSStats(message);
  
  // Simple calculation: ceil(charCount / 155) * $0.25
  const smsCount = Math.ceil(stats.charCount / 155);
  const cost = smsCount * 0.25;
  
  return {
    smsCount: smsCount,
    cost: cost,
    stats: stats
  };
};

// Export for use in Node.js (backend)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectUnicode,
    replaceUnicodeWithGSM,
    calculateSMSStats,
    calculateSMSCost,
    GSM_7BIT_BASIC,
    GSM_7BIT_EXTENDED,
    COMMON_UNICODE_CHARS
  };
}

// Export for use in React (frontend)
if (typeof window !== 'undefined') {
  window.smsUtils = {
    detectUnicode,
    replaceUnicodeWithGSM,
    calculateSMSStats,
    calculateSMSCost
  };
}