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
  
  let encoding, charLimit, maxLength;
  
  if (unicodeDetection.hasUnicode) {
    // Unicode (UCS-2) encoding
    encoding = 'Unicode';
    charLimit = 70;  // First SMS
    maxLength = 402; // Cellcast max for Unicode
  } else {
    // GSM-7 encoding
    encoding = 'GSM-7';
    
    // Count escape characters (they take 2 chars)
    let escapeCount = 0;
    for (const char of message) {
      if (GSM_7BIT_EXTENDED.includes(char)) {
        escapeCount++;
      }
    }
    
    const effectiveLength = message.length + escapeCount;
    charLimit = 160;  // First SMS
    maxLength = 918;  // Cellcast max for GSM-7
    
    // For multi-part, each part is 153 chars
    if (effectiveLength > 160) {
      charLimit = 153;
    }
  }
  
  const charCount = message.length;
  const smsCount = Math.ceil(charCount / charLimit);
  const isValid = charCount <= maxLength;
  
  return {
    encoding,
    charCount,
    charLimit,
    smsCount,
    isValid,
    maxLength,
    unicodeDetection
  };
};

/**
 * Calculate SMS cost based on message
 * @param {string} message - The SMS message
 * @returns {Object} { smsCount, cost, stats }
 */
const calculateSMSCost = (message) => {
  const stats = calculateSMSStats(message);
  const cost = stats.smsCount * 0.25;
  
  return {
    smsCount: stats.smsCount,
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