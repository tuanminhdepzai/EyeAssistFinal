/**
 * PhysicsProblemGen — Random physics problem generator for the Hand Rule
 *
 * Generates problems for Left-Hand Rule (quy tắc bàn tay trái):
 *   - Magnetic field B direction
 *   - Current I direction
 *   - Correct Lorentz Force F direction
 */
export class PhysicsProblemGen {
  constructor() {
    this.directions = ['up', 'down', 'left', 'right', 'in', 'out'];
    this.problems = [];
  }

  /**
   * Generate a new random problem
   * @returns {Object} problem
   */
  generate() {
    const B = this._randomDir();
    const I = this._randomDir();
    const correctF = this._computeForce(B, I);

    const problem = {
      id: Date.now() + Math.random(),
      B,
      I,
      correctF,
      description: this._buildDescription(B, I),
      answer: `F = ${correctF}`,
      hand: 'left', // Always uses left-hand rule for standard physics
    };

    return problem;
  }

  /**
   * Generate a full problem set with B and I vector visual data
   */
  generateForScene() {
    const B = this._randomDir();
    const I = this._randomDir();
    const correctF = this._computeForce(B, I);

    return {
      id: Date.now() + Math.random(),
      B: { direction: B, label: 'B', color: 0x4f8cff },
      I: { direction: I, label: 'I', color: 0xff3d71 },
      F: { direction: correctF, label: 'F', color: 0x00e676, hidden: true },
      hand: 'left',
      question: this._buildQuestion(B, I),
    };
  }

  /**
   * Compute Lorentz Force direction using Left-Hand Rule
   * F = I × B (cross product)
   */
  _computeForce(B, I) {
    // Map directions to 3D unit vectors
    const vec = {
      up:    [0, 1, 0],
      down:  [0, -1, 0],
      left:  [-1, 0, 0],
      right: [1, 0, 0],
      in:    [0, 0, 1],   // into screen
      out:   [0, 0, -1],  // out of screen
    };

    const bv = vec[B];
    const iv = vec[I];

    // Cross product: F = I × B (left hand rule: fingers = I, palm = B, thumb = F)
    // For left hand: F direction is opposite of right-hand rule
    // F = -(I × B)
    const fx = -(iv[1] * bv[2] - iv[2] * bv[1]);
    const fy = -(iv[2] * bv[0] - iv[0] * bv[2]);
    const fz = -(iv[0] * bv[1] - iv[1] * bv[0]);

    // Map back to direction name
    return this._vecToDir([fx, fy, fz]);
  }

  _vecToDir(v) {
    const [x, y, z] = v;
    if (Math.abs(x) > Math.abs(y) && Math.abs(x) > Math.abs(z)) {
      return x > 0 ? 'right' : 'left';
    } else if (Math.abs(y) > Math.abs(z)) {
      return y > 0 ? 'up' : 'down';
    } else if (z !== 0) {
      return z > 0 ? 'in' : 'out';
    }
    // Zero vector — ambiguous, regenerate
    return 'up';
  }

  _randomDir() {
    return this.directions[Math.floor(Math.random() * this.directions.length)];
  }

  _buildDescription(B, I) {
    const dirLabel = (d) => {
      const labels = {
        up: 'hướng lên trên ↑',
        down: 'hướng xuống dưới ↓',
        left: 'hướng sang trái ←',
        right: 'hướng sang phải →',
        in: 'hướng vào trong ⊗',
        out: 'hướng ra ngoài ⊙',
      };
      return labels[d] || d;
    };

    return `Từ trường B ${dirLabel(B)} — Dòng điện I ${dirLabel(I)}`;
  }

  _buildQuestion(B, I) {
    const dirSymbol = (d) => {
      const symbols = {
        up: '↑', down: '↓', left: '←', right: '→', in: '⊗', out: '⊙',
      };
      return symbols[d] || d;
    };

    return `Xác định chiều của lực điện từ F\n\n` +
           `Từ trường B: ${dirSymbol(B)}\n` +
           `Dòng điện I: ${dirSymbol(I)}\n\n` +
           `Xoay bàn tay sao cho:\n` +
           `• Lòng bàn tay hứng đường sức từ B\n` +
           `• 4 ngón tay chỉ chiều dòng điện I\n` +
           `• Ngón cái choe ra chỉ chiều lực F`;
  }

  /**
   * Check if user's rotation matches the correct answer
   */
  checkAnswer(handRotation, problem) {
    // handRotation is a quaternion or euler angles from 3D scene
    // This is a simplified check — in reality we compute from the Three.js hand
    const angleDiff = this._angleToDirection(handRotation, problem.F.direction);
    return angleDiff < 0.5; // Within 30 degrees
  }

  _angleToDirection(rotation, targetDir) {
    // Simplified: just check if the hand's thumb points in the right direction
    // Full implementation would compare 3D vectors
    return Math.abs(rotation - this._dirToAngle(targetDir));
  }

  _dirToAngle(dir) {
    const map = {
      up: 0, right: Math.PI/2, down: Math.PI, left: 3*Math.PI/2,
      in: Math.PI/4, out: 3*Math.PI/4,
    };
    return map[dir] || 0;
  }
}
