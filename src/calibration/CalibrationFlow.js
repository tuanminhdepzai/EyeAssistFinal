/**
 * CalibrationFlow — Orchestrates the calibration process
 *
 * Steps:
 *   1. PursuitGame (15s gaze tracking)
 *   2. Polynomial fitting
 *   3. Wink capability test
 *   4. Mode auto-selection (A/B/C)
 *   5. Profile save
 */
import { PursuitGame } from './PursuitGame.js';
import { GazeToScreen } from '../engine/GazeToScreen.js';
import { AdaptiveLearner } from '../engine/AdaptiveLearner.js';

export class CalibrationFlow {
  constructor() {
    this.gazeMapper = new GazeToScreen();
    this.adaptiveLearner = new AdaptiveLearner();
    this.pursuitGame = new PursuitGame();
    this.isActive = false;
    this.mode = 'A';
    this.accuracy = 0;
    this.winkCapable = false;
    this.calibrationPoints = [];
    this.onComplete = () => {};
    this.onProgress = () => {};
  }

  /**
   * Start calibration
   * @param {HTMLCanvasElement} canvas
   * @param {Function} getGazePosition
   * @param {Object} options
   */
  start(canvas, getGazePosition, options = {}) {
    this.isActive = true;
    this.gazeMapper = options.gazeMapper || this.gazeMapper;
    this.adaptiveLearner = options.adaptiveLearner || this.adaptiveLearner;

    // Wire pursuit game callbacks
    this.pursuitGame.callbacks.onSample = (count) => {
      this.onProgress({ phase: 'tracking', samples: count });
    };

    this.pursuitGame.callbacks.onComplete = (result) => {
      this._onPursuitComplete(result);
    };

    // Start the game
    this.pursuitGame.start(canvas, getGazePosition);
  }

  /**
   * Handle external wink detection during wink test phase
   */
  handleWink(side) {
    if (this.pursuitGame.isRunning && this.pursuitGame.winkTestPhase) {
      this.pursuitGame.registerWink(side);
    }
  }

  _onPursuitComplete(result) {
    this.calibrationPoints = result.samples;
    this.winkCapable = result.winkCapable;

    // Fit polynomial mapping
    this.gazeMapper.setCalibration(
      this.calibrationPoints,
      this.gazeMapper.resolution.w,
      this.gazeMapper.resolution.h
    );

    this.accuracy = this.gazeMapper.getAccuracy();
    this.mode = this._selectMode();

    this.isActive = false;

    // Notify completion
    this.onComplete({
      mode: this.mode,
      accuracy: this.accuracy,
      winkCapable: this.winkCapable,
      gazeMapper: this.gazeMapper,
      adaptiveLearner: this.adaptiveLearner,
      calibrationPoints: this.calibrationPoints
    });
  }

  _selectMode() {
    // Mode A (default): both-eyes blink - short/long for left/right click
    // Mode B (wink): separate left/right wink for click
    // Mode C (dwell): for users with very unstable blink, use dwell time

    if (this.winkCapable && this.accuracy > 0.6) {
      return 'B'; // Wink capable + decent accuracy → wink mode
    } else if (this.accuracy < 0.4) {
      return 'C'; // Low accuracy → dwell mode (forgiveness)
    }

    // Analyze calibration quality
    const jitter = this._measureCalibrationJitter();
    if (jitter > 0.1) {
      return 'A'; // High jitter → use duration-based blink (safer)
    }

    return 'A'; // Default
  }

  _measureCalibrationJitter() {
    if (this.calibrationPoints.length < 10) return 0.5;

    let totalJitter = 0;
    let count = 0;

    for (let i = 5; i < this.calibrationPoints.length; i++) {
      const dx = this.calibrationPoints[i].gazeX - this.calibrationPoints[i - 5].gazeX;
      const dy = this.calibrationPoints[i].gazeY - this.calibrationPoints[i - 5].gazeY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // If gaze moved a lot when target barely moved → jitter
      const targetDx = this.calibrationPoints[i].screenX - this.calibrationPoints[i - 5].screenX;
      const targetDy = this.calibrationPoints[i].screenY - this.calibrationPoints[i - 5].screenY;
      const targetDist = Math.sqrt(targetDx * targetDx + targetDy * targetDy);

      if (targetDist < 0.05 && dist > 0.02) {
        totalJitter += dist;
        count++;
      }
    }

    return count > 0 ? totalJitter / count : 0;
  }

  cancel() {
    this.pursuitGame.stop();
    this.isActive = false;
  }
}
