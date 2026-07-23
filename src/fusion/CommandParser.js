/**
 * CommandParser — Resolve ambiguous voice commands using gaze context
 */
export class CommandParser {
  constructor() {
    this.lastCommand = null;
    this.lastGazeTarget = null;
  }

  /**
   * Resolve a voice command with gaze disambiguation
   * @param {Object} voiceCommand - from VoiceHandler
   * @param {string|null} gazeTarget - element ID user is looking at
   * @returns {Object} resolved command
   */
  resolve(voiceCommand, gazeTarget) {
    this.lastCommand = voiceCommand;
    this.lastGazeTarget = gazeTarget;

    if (!voiceCommand || voiceCommand.type === 'unknown') {
      return null;
    }

    // If command is ambiguous and gaze target exists, use gaze to disambiguate
    if (voiceCommand.type === 'operator' && gazeTarget) {
      // Map gaze target to operator
      const targetOp = this._targetToOperator(gazeTarget);
      if (targetOp) {
        return { ...voiceCommand, op: targetOp, disambiguated: true };
      }
    }

    // If gaze is on a function button, associate the voice command with it
    if (gazeTarget && gazeTarget.startsWith('btn-')) {
      const funcName = gazeTarget.replace('btn-', '');
      if (this._isMathFunction(funcName)) {
        return {
          type: 'function',
          func: funcName,
          argument: voiceCommand.value || voiceCommand.raw,
          raw: voiceCommand.raw
        };
      }
    }

    return voiceCommand;
  }

  /**
   * Check if a voice + gaze combination represents a "look and say" action
   * E.g., look at "sin" button and say "45" → sin(45)
   */
  isLookAndSay(gazeTarget, voiceCommand) {
    if (!gazeTarget || !voiceCommand) return false;
    const funcName = gazeTarget.replace('btn-', '');
    return this._isMathFunction(funcName) && voiceCommand.type === 'number';
  }

  /** Build a composite command from look-and-say */
  buildLookAndSay(gazeTarget, voiceCommand) {
    const funcName = gazeTarget.replace('btn-', '');
    const arg = voiceCommand.value || voiceCommand.raw;
    return {
      type: 'function',
      func: funcName,
      argument: arg,
      raw: `${funcName}(${arg})`,
      display: `${funcName}(${arg})`
    };
  }

  _targetToOperator(target) {
    const map = {
      'btn-plus': '+', 'btn-minus': '-', 'btn-multiply': '*', 'btn-divide': '/',
      'btn-equal': '=', 'btn-left-paren': '(', 'btn-right-paren': ')',
      'btn-power': '^', 'btn-sqrt': 'sqrt(', 'btn-percent': '%'
    };
    return map[target] || null;
  }

  _isMathFunction(name) {
    const funcs = ['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'fact'];
    return funcs.includes(name);
  }
}
