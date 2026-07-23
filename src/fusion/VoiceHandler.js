/**
 * VoiceHandler — Web Speech API wrapper for Vietnamese
 *
 * Continuous speech recognition with auto-restart.
 * Parses Vietnamese math speech into structured commands.
 */
export class VoiceHandler {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this._shouldRestart = false;
    this._restartCooldown = 0;
    this.isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    this.lastResult = '';
    this.interimResult = '';
    this.callbacks = {
      onResult: () => {},
      onInterim: () => {},
      onError: () => {},
      onStart: () => {},
      onEnd: () => {}
    };
  }

  start() {
    if (!this.isSupported) {
      console.warn('Speech recognition not supported');
      return;
    }
    if (this.isListening) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'vi-VN';
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        this.lastResult = final.toLowerCase().trim();
        const command = this._parseCommand(this.lastResult);
        this.callbacks.onResult(command, this.lastResult);
      }

      if (interim) {
        this.interimResult = interim.toLowerCase().trim();
        this.callbacks.onInterim(this.interimResult);
      }
    };

    this.recognition.onerror = (event) => {
      console.warn('Speech error:', event.error);
      this.callbacks.onError(event.error);
      if (event.error === 'not-allowed') {
        this.isListening = false;
        this._shouldRestart = false;
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.callbacks.onEnd();
      // Auto-restart with cooldown to prevent infinite loops on persistent errors
      if (this._shouldRestart) {
        const now = Date.now();
        if (now - this._restartCooldown > 1500) {
          this._restartCooldown = now;
          setTimeout(() => this.start(), 200);
        }
      }
    };

    try {
      this.recognition.start();
      this.isListening = true;
      this._shouldRestart = true;
      this.callbacks.onStart();
    } catch (e) {
      console.warn('Speech start error:', e);
    }
  }

  stop() {
    this._shouldRestart = false;
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) { /* ignore */ }
      this.isListening = false;
    }
  }

  toggle() {
    if (this.isListening) {
      this.stop();
    } else {
      this.start();
    }
  }

  restart() {
    this.stop();
    setTimeout(() => this.start(), 100);
  }

  on(event, fn) {
    if (this.callbacks[event]) this.callbacks[event] = fn;
  }

  /**
   * Parse Vietnamese speech text → structured command
   */
  _parseCommand(text) {
    if (!text) return { type: 'unknown', raw: text };

    // 1. Check control commands (xóa, etc.)
    for (const [phrase, action] of Object.entries(this._getControlMap())) {
      if (text.includes(phrase)) {
        return { type: 'control', action, raw: text };
      }
    }

    // 2. Try to parse as a full number expression (e.g., "một trăm hai mươi ba")
    //    This must come before operator matching to catch "và" etc.
    const fullNum = this._parseNumericExpression(text);
    if (fullNum !== null) {
      return { type: 'number', value: fullNum, raw: text };
    }

    // 3. Check operators (cộng, trừ, nhân, chia, bằng...)
    for (const [phrase, op] of Object.entries(this._getOperatorMap())) {
      if (text.includes(phrase)) {
        return { type: 'operator', op, raw: text };
      }
    }

    // 4. Check simple number words
    for (const [phrase, num] of Object.entries(this._getNumberMap())) {
      if (text === phrase || text.endsWith(phrase)) {
        return { type: 'number', value: num, raw: text };
      }
    }

    return { type: 'unknown', raw: text };
  }

  // ============ MAPS ============

  _getNumberMap() {
    return {
      'không': '0', 'một': '1', 'hai': '2', 'ba': '3', 'bốn': '4',
      'năm': '5', 'sáu': '6', 'bảy': '7', 'tám': '8', 'chín': '9',
      'mười': '10', 'mười một': '11', 'mười hai': '12', 'mười ba': '13',
      'mười bốn': '14', 'mười lăm': '15', 'mười sáu': '16', 'mười bảy': '17',
      'mười tám': '18', 'mười chín': '19',
      'hai mươi': '20', 'ba mươi': '30', 'bốn mươi': '40', 'năm mươi': '50',
      'một trăm': '100',
    };
  }

  _getOperatorMap() {
    return {
      'cộng': '+', 'trừ': '-', 'nhân': '*', 'chia': '/',
      'bằng': '=', 'kết quả': '=',
      'mở ngoặc': '(', 'đóng ngoặc': ')',
      'phần': '/', 'trên': '/',
      'bình phương': '^2', 'mũ': '^', 'lũy thừa': '^',
      'căn bậc hai': 'sqrt(', 'căn': 'sqrt(',
      'sin': 'sin(', 'côsin': 'cos(', 'cos': 'cos(', 'tang': 'tan(',
      'log': 'log(', 'lôgarit': 'log(', 'ln': 'ln(',
      'pi': 'π', 'số pi': 'π',
    };
  }

  _getControlMap() {
    return {
      'xóa hết': 'clear', 'xóa tất cả': 'clear', 'xóa': 'clear',
      'tất cả': 'clear',
      'xóa một': 'backspace',
      'tiếp': 'next', 'chuyển': 'next',
      'dừng': 'stop', 'kết thúc': 'stop',
    };
  }

  // ============ VIETNAMESE NUMBER PARSING ============

  /** Parse a full Vietnamese numeric expression into a decimal string */
  _parseNumericExpression(text) {
    if (!text) return null;

    // Handle decimal: "ba phẩy mười bốn" → "3.14"
    const decimalParts = text.split(/\s+phẩy\s+/);
    if (decimalParts.length === 2) {
      const intPart = this._parseInteger(decimalParts[0].trim());
      const fracPart = this._parseInteger(decimalParts[1].trim());
      if (intPart !== null && fracPart !== null) {
        // "mười bốn" → 14, but we want digits "14" as fraction
        const fracStr = this._numberToDigits(fracPart);
        if (fracStr) {
          return `${intPart}.${fracStr}`;
        }
      }
    }

    // Try whole number
    const intVal = this._parseInteger(text);
    if (intVal !== null) return String(intVal);

    return null;
  }

  /** Parse a Vietnamese integer phrase → numeric value (e.g., "một trăm hai mươi ba" → 123) */
  _parseInteger(text) {
    if (!text) return null;

    // Normalize spaces and common variants
    let s = text.toLowerCase().trim().replace(/\s+/g, ' ');

    // Quick direct lookup
    const numMap = this._getNumberMap();
    if (numMap[s]) return parseInt(numMap[s]);

    const words = s.split(' ');

    // Build number from components
    // Strategy: scan for nghìn, trăm, và, mươi/mười, units
    let result = 0;
    let currentSegment = 0;
    const len = words.length;

    // Normalize 'mươi' → 'mươi' (keep as is, handled below)
    // Handle special cases
    // "linh" / "lẻ" = 0 in the units position (e.g., "một trăm linh năm" = 105)
    // "mốt" = 1 units, "tư" = 4 units, "lăm" = 5 units

    for (let i = 0; i < len; i++) {
      const w = words[i];

      // Handle nghìn/ngàn (thousand)
      if (w === 'nghìn' || w === 'ngàn') {
        if (currentSegment === 0) currentSegment = 1;
        result += currentSegment * 1000;
        currentSegment = 0;
        continue;
      }

      // Handle trăm (hundred)
      if (w === 'trăm') {
        if (currentSegment === 0) currentSegment = 1;
        result += currentSegment * 100;
        currentSegment = 0;
        continue;
      }

      // Handle 'và' (and) — just skip
      if (w === 'và') continue;

      // Handle 'linh', 'lẻ' → 0 in unit position
      if (w === 'linh' || w === 'lẻ') {
        // current segment gets a 0 in tens
        if (currentSegment === 0) currentSegment = 1;
        // The next word (if any) is the unit
        if (i + 1 < len) {
          const nextVal = this._wordToDigit(words[i + 1]);
          if (nextVal !== null) {
            currentSegment = currentSegment * 10 + nextVal;
            i++; // skip next word
          }
        }
        continue;
      }

      // Handle 'mười', 'mươi' (ten)
      if (w === 'mười' || w === 'mươi') {
        // Check if there was a multiplier before (e.g., "hai mươi" = 20)
        if (currentSegment === 0) {
          currentSegment = 10;
        } else {
          // This is "hai mươi" → currentSegment was 2, now 20
          currentSegment = currentSegment * 10;
        }
        continue;
      }

      // Handle 'một', 'hai', ... as digits
      const digit = this._wordToDigit(w);
      if (digit !== null) {
        if (currentSegment === 0) {
          // Check if this is the tens place (followed by mươi/mười)
          // or just a standalone digit
          if (i + 1 < len && (words[i + 1] === 'mươi' || words[i + 1] === 'mười')) {
            currentSegment = digit;
            // Don't consume the next word, let the loop handle it
          } else {
            currentSegment = digit;
          }
        } else {
          // This is a unit digit after tens
          currentSegment = currentSegment + digit;
        }
        continue;
      }

      // Unknown word encountered — might be noise from speech recognition
      // Try to skip it
    }

    // Accumulate remaining segment
    result += currentSegment;

    return result > 0 ? result : null;
  }

  /** Convert a Vietnamese number word to its digit value (0-9) */
  _wordToDigit(word) {
    const map = {
      'không': 0, 'một': 1, 'mốt': 1, 'hai': 2, 'ba': 3,
      'bốn': 4, 'tư': 4, 'năm': 5, 'lăm': 5, 'sáu': 6,
      'bảy': 7, 'tám': 8, 'chín': 9,
    };
    return map[word] !== undefined ? map[word] : null;
  }

  /** Convert a number like 14 → "14" (digits) for decimal fraction parts */
  _numberToDigits(num) {
    if (num === null || num === undefined) return null;
    // For fractions, "mười bốn" = 14 → we need "14"
    return String(num);
  }

  // Legacy composite number parser (kept for backward compatibility)
  _parseCompositeNumber(text) {
    const val = this._parseInteger(text);
    return val !== null ? val : null;
  }
}
