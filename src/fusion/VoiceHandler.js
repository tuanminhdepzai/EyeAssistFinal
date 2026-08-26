/**
 * VoiceHandler — Web Speech API wrapper for Vietnamese (Enhanced)
 *
 * Continuous speech recognition with auto-restart, noise filtering,
 * exponential backoff, and expanded STEM vocabulary.
 * Uses VoiceNormalizer for input preprocessing.
 */
import { VoiceNormalizer } from './VoiceNormalizer.js';

export class VoiceHandler {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this._shouldRestart = false;
    this._restartCooldown = 0;
    this._backoffMs = 200;          // Phase 3.1: exponential backoff start
    this._maxBackoffMs = 3000;      // Phase 3.1: max backoff cap
    this._consecutiveUnknown = 0;   // Phase 3.2: noise counter
    this._unknownWindowStart = 0;   // Phase 3.2: window start timestamp
    this._noisePauseUntil = 0;      // Phase 3.2: pause until timestamp
    this.isSupported = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
    this.lastResult = '';
    this.interimResult = '';
    this.normalizer = new VoiceNormalizer();
    this.commandHistory = [];       // Phase 3.3: last 20 commands
    this.maxHistory = 20;
    this.minConfidence = 0.4;       // Phase 3.2: ASR confidence threshold
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

    // Phase 3.2: respect noise pause
    if (Date.now() < this._noisePauseUntil) {
      const remaining = this._noisePauseUntil - Date.now();
      setTimeout(() => this.start(), remaining);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'vi-VN';
    this.recognition.maxAlternatives = 3;

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      let bestConfidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
          bestConfidence = Math.max(bestConfidence, result[0].confidence || 0);
        } else {
          interim += result[0].transcript;
        }
      }

      if (final) {
        // Phase 3.2: filter low-confidence results
        if (bestConfidence > 0 && bestConfidence < this.minConfidence) {
          return; // ignore noisy result
        }

        // Phase 1.2: normalize input before parsing
        const normalized = this.normalizer.normalize(final);
        this.lastResult = normalized;
        const command = this._parseCommand(normalized);

        // Phase 3.2: track unknown commands for noise detection
        if (command.type === 'unknown') {
          this._trackUnknown();
        } else {
          this._resetBackoff();
          this._addToHistory(command, normalized);
        }

        this.callbacks.onResult(command, normalized);
      }

      if (interim) {
        this.interimResult = this.normalizer.normalize(interim);
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
      // Phase 3.1: Auto-restart with exponential backoff
      if (this._shouldRestart) {
        const now = Date.now();
        if (now - this._restartCooldown > this._backoffMs) {
          this._restartCooldown = now;
          setTimeout(() => this.start(), this._backoffMs);
          // Increase backoff for next retry
          this._backoffMs = Math.min(this._backoffMs * 2, this._maxBackoffMs);
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

  /** Get command history for debugging/replay */
  getHistory() {
    return [...this.commandHistory];
  }

  /** Serialize state for profile persistence */
  serialize() {
    return {
      commandHistory: this.commandHistory.slice(-this.maxHistory),
      minConfidence: this.minConfidence
    };
  }

  /** Restore state from profile */
  deserialize(data) {
    if (!data) return;
    if (Array.isArray(data.commandHistory)) {
      this.commandHistory = data.commandHistory.slice(-this.maxHistory);
    }
    if (typeof data.minConfidence === 'number') {
      this.minConfidence = data.minConfidence;
    }
  }

  // ============ PHASE 3 HELPERS ============

  /** Phase 3.1: Reset backoff on successful recognition */
  _resetBackoff() {
    this._backoffMs = 200;
  }

  /** Phase 3.2: Track consecutive unknown commands */
  _trackUnknown() {
    const now = Date.now();
    // Reset window after 10 seconds
    if (now - this._unknownWindowStart > 10000) {
      this._unknownWindowStart = now;
      this._consecutiveUnknown = 0;
    }
    this._consecutiveUnknown++;
    // If >5 unknowns in 10s → pause 3s
    if (this._consecutiveUnknown > 5) {
      this._noisePauseUntil = now + 3000;
      this._consecutiveUnknown = 0;
      console.warn('[VoiceHandler] Too many unknown commands, pausing 3s');
    }
  }

  /** Phase 3.3: Add command to history ring buffer */
  _addToHistory(command, rawText) {
    this.commandHistory.push({
      type: command.type,
      raw: rawText,
      parsed: command,
      timestamp: Date.now()
    });
    if (this.commandHistory.length > this.maxHistory) {
      this.commandHistory.shift();
    }
  }

  // ============ COMMAND PARSING ============

  /**
   * Parse Vietnamese speech text → structured command
   * Text should already be normalized by VoiceNormalizer
   */
  _parseCommand(text) {
    if (!text) return { type: 'unknown', raw: text };

    // 1. Check physics 3D hand commands
    for (const [phrase, action] of Object.entries(this._getPhysicsMap())) {
      if (text.includes(phrase)) {
        return { type: 'physics', action, raw: text };
      }
    }

    // 2. Check control commands (xóa, etc.)
    for (const [phrase, action] of Object.entries(this._getControlMap())) {
      if (text.includes(phrase)) {
        return { type: 'control', action, raw: text };
      }
    }

    // 3. Try to parse as a full number expression (e.g., "một trăm hai mươi ba")
    const fullNum = this._parseNumericExpression(text);
    if (fullNum !== null) {
      return { type: 'number', value: fullNum, raw: text };
    }

    // 4. Check operators (cộng, trừ, nhân, chia, bằng...)
    for (const [phrase, op] of Object.entries(this._getOperatorMap())) {
      if (text.includes(phrase)) {
        return { type: 'operator', op, raw: text };
      }
    }

    // 5. Check simple number words
    for (const [phrase, num] of Object.entries(this._getNumberMap())) {
      if (text === phrase || text.endsWith(phrase)) {
        return { type: 'number', value: num, raw: text };
      }
    }

    return { type: 'unknown', raw: text };
  }

  // ============ MAPS (Phase 1.1: Expanded) ============

  _getPhysicsMap() {
    return {
      'xoay trái': 'rotate_left',
      'xoay sang trái': 'rotate_left',
      'xoay phải': 'rotate_right',
      'xoay sang phải': 'rotate_right',
      'xoay lên': 'rotate_up',
      'xoay xuống': 'rotate_down',
      'lật ngửa': 'flip_hand',
      'lật úp': 'flip_hand',
      'lật tay': 'flip_hand',
      'lật bàn tay': 'flip_hand',
      'úp tay': 'flip_hand',
      'ngửa tay': 'flip_hand',
      'đổi tay phải': 'hand_right',
      'tay phải': 'hand_right',
      'đổi tay trái': 'hand_left',
      'tay trái': 'hand_left',
      'nắm tay': 'pose_fist',
      'nắm tay lại': 'pose_fist',
      'mở tay': 'pose_open',
      'mở bàn tay': 'pose_open',
      'duỗi tay': 'pose_open',
      'khóa đáp án': 'lock_answer',
      'khóa': 'lock_answer',
      'chốt': 'lock_answer',
      'chốt đáp án': 'lock_answer',
      'bài tiếp theo': 'next_problem',
      'bài tiếp': 'next_problem',
      'bài mới': 'next_problem',
      'tạo đề': 'next_problem',
      'đặt lại': 'reset_hand',
      'quay về gốc': 'reset_hand',
    };
  }

  _getNumberMap() {
    return {
      'không': '0', 'một': '1', 'hai': '2', 'ba': '3', 'bốn': '4',
      'năm': '5', 'sáu': '6', 'bảy': '7', 'tám': '8', 'chín': '9',
      'mười': '10', 'mười một': '11', 'mười hai': '12', 'mười ba': '13',
      'mười bốn': '14', 'mười lăm': '15', 'mười sáu': '16', 'mười bảy': '17',
      'mười tám': '18', 'mười chín': '19',
      'hai mươi': '20', 'ba mươi': '30', 'bốn mươi': '40', 'năm mươi': '50',
      'sáu mươi': '60', 'bảy mươi': '70', 'tám mươi': '80', 'chín mươi': '90',
      'một trăm': '100', 'hai trăm': '200', 'ba trăm': '300',
      'bốn trăm': '400', 'năm trăm': '500', 'sáu trăm': '600',
      'bảy trăm': '700', 'tám trăm': '800', 'chín trăm': '900',
      'một nghìn': '1000', 'một ngàn': '1000',
    };
  }

  _getOperatorMap() {
    return {
      // Basic arithmetic
      'cộng': '+', 'trừ': '-', 'nhân': '*', 'chia': '/',
      'bằng': '=', 'kết quả': '=',
      'mở ngoặc': '(', 'đóng ngoặc': ')',
      'phần': '/', 'trên': '/',
      // Powers and roots
      'bình phương': '^2', 'mũ': '^', 'lũy thừa': '^',
      'căn bậc hai': 'sqrt(', 'căn': 'sqrt(', 'sqrt': 'sqrt(',
      'căn bậc ba': 'cbrt(', 'cbrt': 'cbrt(',
      // Trigonometry
      'sin': 'sin(', 'côsin': 'cos(', 'cos': 'cos(', 'tang': 'tan(',
      'arcsin': 'asin(', 'sin ngược': 'asin(', 'asin': 'asin(',
      'arccos': 'acos(', 'cos ngược': 'acos(', 'acos': 'acos(',
      'arctan': 'atan(', 'tan ngược': 'atan(', 'atan': 'atan(',
      // Logarithms
      'log': 'log(', 'lôgarit': 'log(', 'ln': 'ln(',
      'logarit tự nhiên': 'ln(',
      'e mũ': 'exp(', 'exp': 'exp(', 'mười mũ': '10^', 'pow10': '10^',
      // Constants
      'pi': 'π', 'số pi': 'π',
      'e': 'e', 'hằng số e': 'e',
      'vô cực': 'inf',
      // Advanced
      'giai thừa': '!', 'factorial': '!', 'phần trăm': '%', 'percent': '%',
      'modulo': 'mod', 'chia lấy dư': 'mod',
    };
  }

  _getControlMap() {
    return {
      'xóa hết': 'clear', 'xóa tất cả': 'clear', 'xóa': 'clear',
      'tất cả': 'clear',
      'xóa một': 'backspace', 'lui lại': 'backspace',
      'undo': 'undo', 'quay lại': 'undo',
      'tiếp': 'next', 'chuyển': 'next',
      'dừng': 'stop', 'kết thúc': 'stop',
    };
  }

  // ============ VIETNAMESE NUMBER PARSING (Phase 1.3: Fixed) ============

  /** Parse a full Vietnamese numeric expression into a decimal string */
  _parseNumericExpression(text) {
    if (!text) return null;

    // Handle negative numbers: "âm năm", "trừ mười"
    let isNegative = false;
    let s = text;
    if (s.startsWith('âm ') || s.startsWith('trừ ')) {
      isNegative = true;
      s = s.replace(/^(âm|trừ)\s+/, '');
    }

    // Handle fractions: "một phần hai", "ba phần tư"
    const fractionMatch = s.match(/^(.+?)\s+phần\s+(.+)$/);
    if (fractionMatch) {
      const numerator = this._parseInteger(fractionMatch[1]);
      const denominator = this._parseInteger(fractionMatch[2]);
      if (numerator !== null && denominator !== null && denominator !== 0) {
        const val = numerator / denominator;
        return String(isNegative ? -val : val);
      }
    }

    // Handle decimal: "ba phẩy mười bốn" or "3 . 14" (from normalizer)
    const decimalParts = s.split(/\s+(?:phẩy|chấm|\.)\s+/);
    if (decimalParts.length === 2) {
      const intPart = this._parseInteger(decimalParts[0].trim());
      const fracPart = this._parseInteger(decimalParts[1].trim());
      if (intPart !== null && fracPart !== null) {
        const fracStr = this._numberToDigits(fracPart);
        if (fracStr) {
          const result = `${intPart}.${fracStr}`;
          return isNegative ? `-${result}` : result;
        }
      }
    }

    // Try whole number
    const intVal = this._parseInteger(s);
    if (intVal !== null) {
      return String(isNegative ? -intVal : intVal);
    }

    return null;
  }

  /**
   * Parse a Vietnamese integer phrase → numeric value
   * Handles: "hai mươi mốt" (21), "ba mươi lăm" (35),
   *          "một trăm lẻ năm" (105), "một nghìn hai trăm ba mươi tư" (1234)
   */
  _parseInteger(text) {
    if (!text) return null;

    let s = text.toLowerCase().trim().replace(/\s+/g, ' ');

    // Quick direct lookup
    const numMap = this._getNumberMap();
    if (numMap[s]) return parseInt(numMap[s]);

    const words = s.split(' ');
    const len = words.length;

    // State machine for Vietnamese number parsing
    let result = 0;
    let currentSegment = 0;  // accumulator within current magnitude group
    let pendingDigit = null; // digit waiting to be placed

    for (let i = 0; i < len; i++) {
      const w = words[i];

      // Handle nghìn/ngàn (thousand)
      if (w === 'nghìn' || w === 'ngàn') {
        if (currentSegment === 0 && pendingDigit !== null) {
          currentSegment = pendingDigit;
          pendingDigit = null;
        }
        if (currentSegment === 0) currentSegment = 1;
        result += currentSegment * 1000;
        currentSegment = 0;
        continue;
      }

      // Handle trăm (hundred)
      if (w === 'trăm') {
        if (currentSegment === 0 && pendingDigit !== null) {
          currentSegment = pendingDigit;
          pendingDigit = null;
        }
        if (currentSegment === 0) currentSegment = 1;
        result += currentSegment * 100;
        currentSegment = 0;
        continue;
      }

      // Handle 'và' — skip connector
      if (w === 'và') continue;

      // Handle 'linh', 'lẻ' → 0 in tens position
      if (w === 'linh' || w === 'lẻ') {
        // Next word is the unit digit
        if (i + 1 < len) {
          const nextVal = this._wordToDigit(words[i + 1]);
          if (nextVal !== null) {
            currentSegment = currentSegment + nextVal;
            i++; // consume next word
          }
        }
        continue;
      }

      // Handle 'mười', 'mươi' (ten/tens)
      if (w === 'mười' || w === 'mươi') {
        if (pendingDigit !== null) {
          // "hai mươi" → 20
          currentSegment = pendingDigit * 10;
          pendingDigit = null;
        } else if (currentSegment === 0) {
          // standalone "mười" → 10
          currentSegment = 10;
        } else {
          // shouldn't happen normally, but handle gracefully
          currentSegment = currentSegment * 10;
        }
        continue;
      }

      // Handle digit words
      const digit = this._wordToDigit(w);
      if (digit !== null) {
        // Look ahead: is next word 'mươi'/'mười'?
        if (i + 1 < len && (words[i + 1] === 'mươi' || words[i + 1] === 'mười')) {
          pendingDigit = digit;
        } else {
          // Unit digit: add to current segment
          if (pendingDigit !== null) {
            // pending was a tens digit without mươi following? Flush it
            currentSegment = currentSegment + pendingDigit;
            pendingDigit = null;
          }
          currentSegment = currentSegment + digit;
        }
        continue;
      }

      // Unknown word — skip (ASR noise)
    }

    // Flush any pending digit
    if (pendingDigit !== null) {
      currentSegment = currentSegment + pendingDigit;
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
    return String(num);
  }
}
