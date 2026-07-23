/**
 * PhysicsController — Bridges blink/gaze events to the 3D physics scene
 *
 * Translates:
 *   - Blink left → rotate hand CCW
 *   - Blink right → rotate hand CW
 *   - Long blink → lock answer
 *   - Gaze position → camera orbit / highlight
 */
import { PhysicsScene } from './PhysicsScene.js';
import { PhysicsProblemGen } from './PhysicsProblemGen.js';

export class PhysicsController {
  constructor() {
    this.scene = new PhysicsScene();
    this.problemGen = new PhysicsProblemGen();
    this.currentProblem = null;
    this.isLocked = false;
    this.score = 0;
    this.totalProblems = 0;
    this.onScoreUpdate = () => {};

    // Rotation step per blink (radians)
    this.rotationStep = 0.2618; // ~15 degrees
  }

  /**
   * Initialize with canvas element
   * @param {HTMLCanvasElement} canvas
   */
  init(canvas) {
    this.scene.init(canvas);
  }

  /**
   * Generate a new problem and display in scene
   */
  newProblem() {
    this.currentProblem = this.problemGen.generateForScene();
    this.scene.updateVectors(this.currentProblem);
    this.scene.resetHand();
    this.isLocked = false;
    this.totalProblems++;

    return this.currentProblem;
  }

  /**
   * Handle blink event from FusionEngine
   * @param {Object} blinkData
   */
  handleBlink(blinkData) {
    if (this.isLocked) return;

    const { action } = blinkData;

    switch (action) {
      case 'wink_left':
      case 'left_click':
        this.scene.rotateHand('y', -this.rotationStep);
        break;
      case 'wink_right':
      case 'right_click':
        this.scene.rotateHand('y', this.rotationStep);
        break;
      case 'long':
        this._lockAnswer();
        break;
    }
  }

  /**
   * Lock the current answer and check
   */
  _lockAnswer() {
    if (this.isLocked || !this.currentProblem) return;
    this.isLocked = true;

    // Show the correct F vector
    this.scene.showForce();

    // Calculate score based on hand rotation
    const handRotation = this.scene.rotation.y;
    const isCorrect = this.problemGen.checkAnswer(handRotation, this.currentProblem);

    if (isCorrect) {
      this.score++;
    }

    this.onScoreUpdate({
      score: this.score,
      total: this.totalProblems,
      correct: isCorrect,
    });
  }

  /**
   * Handle resize of container
   */
  handleResize(width, height) {
    this.scene.resize(width, height);
  }

  /**
   * Clean up
   */
  dispose() {
    this.scene.dispose();
  }
}
