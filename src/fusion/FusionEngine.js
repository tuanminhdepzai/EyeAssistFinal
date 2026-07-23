/**
 * FusionEngine — Multi-modal input fusion and priority dispatch
 *
 * Priority:
 *   P0: Calibration mode (overrides everything)
 *   P1: Blink click (atomic, immediate)
 *   P2: Voice command (buffered, parsed async)
 *   P3: Gaze hover (continuous, visual feedback)
 *   P4: Gaze gesture (needs accumulation)
 *
 * Conflict resolution: highest priority wins, lower gets queued.
 */
export class FusionEngine {
  constructor() {
    this.priority = {
      CALIBRATION: 0,
      BLINK: 1,
      VOICE: 2,
      GAZE_HOVER: 3,
      GAZE_GESTURE: 4
    };

    this.currentMode = 'normal'; // 'normal' | 'calibration'
    this.lastGazePosition = { x: 0, y: 0 };
    this.lastGazeTarget = null;
    this.lastBlinkEvent = null;
    this.lastVoiceCommand = null;
    this.lastGestureEvent = null;
    this.voiceQueue = [];
    this.isProcessingVoice = false;

    // Callbacks for different event types
    this.callbacks = {
      onClick: () => {},
      onGazeHover: () => {},
      onVoice: () => {},
      onGesture: () => {},
      onCalibrate: () => {}
    };

    this.sessionStats = {
      totalClicks: 0,
      totalVoice: 0,
      totalGestures: 0,
      errors: 0,
      startTime: Date.now()
    };
  }

  /** Handle gaze update from worker */
  handleGaze(gazeData) {
    this.lastGazePosition = { x: gazeData.screenX, y: gazeData.screenY };

    if (this.currentMode !== 'calibration') {
      this.callbacks.onGazeHover({
        x: gazeData.screenX,
        y: gazeData.screenY,
        earLeft: gazeData.earLeft,
        earRight: gazeData.earRight,
        confidence: gazeData.confidence
      });
    }
  }

  /** Handle blink event from worker */
  handleBlink(blinkData) {
    if (this.currentMode === 'calibration') return;

    this.lastBlinkEvent = blinkData;
    this.sessionStats.totalClicks++;

    let action = null;
    switch (blinkData.subtype) {
      case 'short':
        action = 'left_click';
        break;
      case 'long':
        action = 'right_click';
        break;
      case 'double':
        action = 'double_click';
        break;
    }

    if (blinkData.subtype === 'wink') {
      action = blinkData.side === 'left' ? 'wink_left' : 'wink_right';
    }

    if (action) {
      this.callbacks.onClick({
        action,
        x: this.lastGazePosition.x,
        y: this.lastGazePosition.y,
        target: this.lastGazeTarget,
        timestamp: blinkData.timestamp || Date.now(),
        duration: blinkData.duration
      });
    }
  }

  /** Handle voice command */
  handleVoice(voiceCommand) {
    if (this.currentMode === 'calibration') return;

    this.sessionStats.totalVoice++;
    this.lastVoiceCommand = voiceCommand;

    // Queue voice processing
    this.voiceQueue.push(voiceCommand);
    if (!this.isProcessingVoice) {
      this._processVoiceQueue();
    }
  }

  async _processVoiceQueue() {
    this.isProcessingVoice = true;

    while (this.voiceQueue.length > 0) {
      const cmd = this.voiceQueue.shift();
      // Process with gaze disambiguation
      this.callbacks.onVoice({
        command: cmd,
        gazeTarget: this.lastGazeTarget,
        gazePosition: this.lastGazePosition
      });
      // Small delay to prevent flooding
      await new Promise(r => setTimeout(r, 50));
    }

    this.isProcessingVoice = false;
  }

  /** Handle gesture match */
  handleGesture(gestureData) {
    if (this.currentMode === 'calibration') return;

    this.lastGestureEvent = gestureData;
    this.sessionStats.totalGestures++;
    this.callbacks.onGesture(gestureData);
  }

  /** Set calibration mode */
  setCalibrationMode(active) {
    this.currentMode = active ? 'calibration' : 'normal';
    if (active) {
      this.callbacks.onCalibrate({ active: true });
    }
  }

  /** Register event handler */
  on(event, fn) {
    if (this.callbacks[event]) this.callbacks[event] = fn;
  }
}
