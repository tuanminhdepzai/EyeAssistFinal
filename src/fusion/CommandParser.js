/**
 * CommandParser — Resolve ambiguous voice commands using gaze context (Enhanced)
 *
 * Phase 2: Context-aware voice fusion with gaze disambiguation.
 * - Disambiguates control commands based on gaze target (LCD vs button)
 * - Improved look-and-say with timeout and expanded function set
 * - Confidence scoring for resolved commands
 */
export class CommandParser {
  constructor() {
    this.lastCommand = null;
    this.lastGazeTarget = null;
    this._lookAndSayTimeout = 2000; // ms — cancel if gaze leaves target
    this._lastLookAndSayTime = 0;
    this._lastLookAndSayTarget = null;
  }

  /**
   * Resolve a voice command with gaze disambiguation
   * @param {Object} voiceCommand - from VoiceHandler
   * @param {string|null} gazeTarget - element ID user is looking at (data-key value)
   * @param {Object} [context] - additional context { gazeOnLCD, gazeOnScreen, fixationStable }
   * @returns {Object|null} resolved command with confidence score
   */
  resolve(voiceCommand, gazeTarget, context = {}) {
    this.lastCommand = voiceCommand;
    this.lastGazeTarget = gazeTarget;

    if (!voiceCommand || voiceCommand.type === 'unknown') {
      return null;
    }

    // Phase 2.1: Control command disambiguation by gaze target
    if (voiceCommand.type === 'control') {
      const resolved = this._resolveControlCommand(voiceCommand, gazeTarget, context);
      if (resolved) return resolved;
    }

    // Phase 2.2: Look-and-Say — gaze on function button + say number
    if (gazeTarget && voiceCommand.type === 'number') {
      const funcName = this._extractFuncName(gazeTarget);
      if (funcName && this._isMathFunction(funcName)) {
        return {
          type: 'function',
          func: funcName,
          argument: voiceCommand.value || voiceCommand.raw,
          raw: voiceCommand.raw,
          display: `${funcName}(${voiceCommand.value || voiceCommand.raw})`,
          confidence: 0.95,
          disambiguated: true,
          method: 'look_and_say'
        };
      }
    }

    // Operator disambiguation: gaze on operator button overrides spoken operator
    if (voiceCommand.type === 'operator' && gazeTarget) {
      const targetOp = this._targetToOperator(gazeTarget);
      if (targetOp) {
        return {
          ...voiceCommand,
          op: targetOp,
          confidence: 0.9,
          disambiguated: true,
          method: 'gaze_override'
        };
      }
    }

    // Number on numeric button → direct input with high confidence
    if (voiceCommand.type === 'number' && gazeTarget) {
      const keyVal = this._extractKeyValue(gazeTarget);
      if (keyVal !== null) {
        return {
          ...voiceCommand,
          confidence: 0.95,
          disambiguated: true,
          method: 'gaze_confirm',
          gazeKey: keyVal
        };
      }
    }

    // Default: pass through with base confidence
    return {
      ...voiceCommand,
      confidence: voiceCommand.confidence || 0.7,
      method: 'direct'
    };
  }

  /**
   * Check if a voice + gaze combination represents a "look and say" action
   * E.g., look at "sin" button and say "45" → sin(45)
   */
  isLookAndSay(gazeTarget, voiceCommand) {
    if (!gazeTarget || !voiceCommand) return false;
    const funcName = this._extractFuncName(gazeTarget);
    return funcName !== null && this._isMathFunction(funcName) && voiceCommand.type === 'number';
  }

  /** Build a composite command from look-and-say */
  buildLookAndSay(gazeTarget, voiceCommand) {
    const funcName = this._extractFuncName(gazeTarget);
    if (!funcName) return null;
    const arg = voiceCommand.value || voiceCommand.raw;
    return {
      type: 'function',
      func: funcName,
      argument: arg,
      raw: `${funcName}(${arg})`,
      display: `${funcName}(${arg})`,
      confidence: 0.95,
      method: 'look_and_say'
    };
  }

  /**
   * Check if look-and-say is still valid (gaze hasn't left target within timeout)
   * @param {string} currentTarget - current gaze target
   * @param {number} now - current timestamp
   * @returns {boolean}
   */
  isLookAndSayValid(currentTarget, now) {
    if (!this._lastLookAndSayTarget) return false;
    if (currentTarget !== this._lastLookAndSayTarget) return false;
    if (now - this._lastLookAndSayTime > this._lookAndSayTimeout) return false;
    return true;
  }

  /** Record a look-and-say initiation for timeout tracking */
  recordLookAndSayStart(target, now) {
    this._lastLookAndSayTarget = target;
    this._lastLookAndSayTime = now;
  }

  // ============ PRIVATE HELPERS ============

  /**
   * Phase 2.1: Resolve control commands based on gaze context
   * "xóa" while looking at LCD → backspace (edit expression)
   * "xóa" while looking at AC button → clear all
   * "xóa" with no specific target → default clear
   */
  _resolveControlCommand(cmd, gazeTarget, context) {
    const action = cmd.action;

    // "xóa" / "clear" disambiguation
    if (action === 'clear' || action === 'backspace') {
      // Gaze on AC button → full clear
      if (gazeTarget === 'AC') {
        return { type: 'control', action: 'clear', confidence: 0.95, method: 'gaze_ac' };
      }
      // Gaze on DEL button → backspace
      if (gazeTarget === 'DEL') {
        return { type: 'control', action: 'backspace', confidence: 0.95, method: 'gaze_del' };
      }
      // Gaze on LCD screen area → backspace (editing expression)
      if (context.gazeOnLCD || context.gazeOnScreen) {
        return { type: 'control', action: 'backspace', confidence: 0.8, method: 'gaze_lcd' };
      }
      // No specific target → default to clear
      return { type: 'control', action: 'clear', confidence: 0.6, method: 'default' };
    }

    // Other control commands pass through
    return { ...cmd, confidence: 0.7, method: 'direct' };
  }

  /** Extract function name from gaze target (handles both btn- prefix and raw data-key) */
  _extractFuncName(target) {
    if (!target) return null;
    // Handle btn- prefix format
    if (target.startsWith('btn-')) {
      return target.replace('btn-', '').toLowerCase();
    }
    // Handle raw data-key values (e.g., "SIN", "COS", "sqrt")
    const normalized = target.toLowerCase();
    if (this._isMathFunction(normalized)) return normalized;
    return null;
  }

  /** Extract numeric key value from gaze target */
  _extractKeyValue(target) {
    if (!target) return null;
    // Numeric buttons have data-key="0" through "9", "DOT"
    if (/^[0-9]$/.test(target)) return target;
    if (target === 'DOT') return '.';
    return null;
  }

  _targetToOperator(target) {
    const map = {
      'PLUS': '+', 'MINUS': '-', 'MULTIPLY': '*', 'DIVIDE': '/',
      'EQUALS': '=', 'LPAREN': '(', 'RPAREN': ')',
      'POWER': '^', 'SQRT': 'sqrt(', 'PERCENT': '%',
      // Also handle btn- prefixed versions
      'btn-plus': '+', 'btn-minus': '-', 'btn-multiply': '*', 'btn-divide': '/',
      'btn-equal': '=', 'btn-left-paren': '(', 'btn-right-paren': ')',
      'btn-power': '^', 'btn-sqrt': 'sqrt(', 'btn-percent': '%'
    };
    return map[target] || null;
  }

  _isMathFunction(name) {
    const funcs = [
      'sin', 'cos', 'tan',
      'asin', 'acos', 'atan',
      'log', 'ln', 'sqrt', 'cbrt',
      'fact', 'exp', 'abs'
    ];
    return funcs.includes(name);
  }
}
