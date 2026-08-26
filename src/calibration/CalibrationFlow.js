/**
 * CalibrationFlow — Master Orchestrator for Eye Calibration & Profiling
 *
 * Steps:
 *   1. Pre-calibration setup & posture check
 *   2. Method Selection: 9-Point Grid (Default) or Smooth Pursuit Tracking
 *   3. Polynomial Regression fitting on (gaze -> screen) coordinate pairs
 *   4. Gaze stability & wink capability analysis
 *   5. Mode auto-recommendation (Mode A: Blink, Mode B: Wink, Mode C: Dwell)
 *   6. Live interactive test before profile commit
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
    this.method = 'grid9'; // 'grid9' | 'pursuit'
    this.mode = 'A';       // 'A' | 'B' | 'C'
    this.accuracy = 0;
    this.stability = 0;
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
    this.method = options.method || 'grid9';
    this.gazeMapper = options.gazeMapper || this.gazeMapper;
    this.adaptiveLearner = options.adaptiveLearner || this.adaptiveLearner;

    this.pursuitGame.callbacks.onSample = (count) => {
      this.onProgress({ phase: 'tracking', samples: count, method: this.method });
    };

    this.pursuitGame.callbacks.onPointComplete = ({ index, total }) => {
      this.onProgress({ phase: 'point_done', index, total, method: this.method });
    };

    this.pursuitGame.callbacks.onComplete = (result) => {
      this._onDataComplete(result);
    };

    this.pursuitGame.start(canvas, getGazePosition, this.method);
  }

  /**
   * Start live verification test target zone
   */
  startLiveTest(canvas, getGazePosition) {
    this.pursuitGame.startTestMode(canvas, getGazePosition);
  }

  handleWink(side) {
    if (this.pursuitGame.isRunning && this.pursuitGame.winkTestPhase) {
      this.pursuitGame.registerWink(side);
    }
  }

  _onDataComplete(result) {
    this.calibrationPoints = result.samples;
    this.winkCapable = result.winkCapable;

    // Set calibration on GazeMapper
    const w = this.pursuitGame.canvas ? this.pursuitGame.canvas.width : 800;
    const h = this.pursuitGame.canvas ? this.pursuitGame.canvas.height : 500;
    this.gazeMapper.setCalibration(this.calibrationPoints, w, h);

    this.accuracy = this.gazeMapper.getAccuracy();
    this.stability = this._calculateStability();
    this.mode = this._selectMode();

    this.isActive = false;

    // Return detailed analysis report
    this.onComplete({
      mode: this.mode,
      accuracy: this.accuracy,
      stability: this.stability,
      winkCapable: this.winkCapable,
      method: this.method,
      gazeMapper: this.gazeMapper,
      adaptiveLearner: this.adaptiveLearner,
      calibrationPoints: this.calibrationPoints,
      modeDescription: this._getModeDescription(this.mode),
    });
  }

  _selectMode() {
    if (this.winkCapable && this.accuracy > 0.65) {
      return 'B'; // Wink capable + high accuracy -> Wink mode
    } else if (this.accuracy < 0.45 || this.stability < 0.4) {
      return 'C'; // Low accuracy or high jitter -> Dwell mode (forgiveness)
    }
    return 'A'; // Standard Blink mode
  }

  _calculateStability() {
    if (this.calibrationPoints.length < 10) return 0.7;

    let totalJitter = 0;
    let count = 0;

    for (let i = 2; i < this.calibrationPoints.length; i++) {
      const p1 = this.calibrationPoints[i - 1];
      const p2 = this.calibrationPoints[i];
      const targetDist = Math.hypot(p2.screenX - p1.screenX, p2.screenY - p1.screenY);
      const gazeDist = Math.hypot(p2.gazeX - p1.gazeX, p2.gazeY - p1.gazeY);

      if (targetDist < 0.02) {
        totalJitter += gazeDist;
        count++;
      }
    }

    const avgJitter = count > 0 ? totalJitter / count : 0.05;
    return Math.max(0, Math.min(1, 1 - avgJitter / 0.1));
  }

  _getModeDescription(mode) {
    const map = {
      'A': 'Chế độ Chớp mắt (Mode A) — Chớp 2 mắt bình thường: nháy nhanh = click trái, giữ 0.5s = click phải.',
      'B': 'Chế độ Nháy mắt riêng biệt (Mode B) — Nháy mắt trái = click trái, nháy mắt phải = click phải.',
      'C': 'Chế độ Nhìn dừng (Mode C / Dwell) — Giữ ánh mắt vào nút 1.2s để tự động click (rất dễ dùng).',
    };
    return map[mode] || map['A'];
  }

  cancel() {
    this.pursuitGame.stop();
    this.isActive = false;
  }
}
