/**
 * PhysicsScene — Three.js 3D scene for the Hand Rule physics simulation
 *
 * Renders:
 *   - Magnetic field lines (B vectors)
 *   - Current direction (I arrow)
 *   - A simplified hand model (palm + 4 fingers + thumb)
 *   - Force vector (F, revealed after "lock")
 */
export class PhysicsScene {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.hand = null;
    this.vectors = {};
    this.isInitialized = false;
    this.rotation = { x: 0, y: 0, z: 0 };
    this.onRender = () => {};
  }

  /**
   * Initialize the Three.js scene
   * @param {HTMLCanvasElement} canvas
   */
  async init(canvas) {
    // Three.js loaded via importmap CDN
    const THREE = await import('three');
    this.THREE = THREE;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1a);

    // Camera
    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.set(5, 4, 6);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    // Lights
    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    backLight.position.set(-5, 0, -5);
    this.scene.add(backLight);

    // Grid
    const grid = new THREE.GridHelper(10, 10, 0x2a3550, 0x1a2236);
    this.scene.add(grid);

    // Create the hand model
    this._createHand();

    this.isInitialized = true;
    this._animate();
  }

  /**
   * Create a simplified hand model from primitives (Disabled)
   */
  _createHand() {
    // Hand 3D model removed per user request
    const T = this.THREE;
    this.hand = new T.Group();
    // this.scene.add(this.hand);
  }

  /**
   * Update vector arrows for B, I, and F
   * @param {Object} problem - from PhysicsProblemGen
   */
  updateVectors(problem) {
    // Remove old arrows
    Object.values(this.vectors).forEach(v => {
      if (v) this.scene.remove(v);
    });
    this.vectors = {};

    const T = this.THREE;
    const origin = new T.Vector3(0, 0, 0);

    // B field (blue)
    if (problem.B) {
      const bDir = this._dirToVec(problem.B.direction);
      this.vectors.B = new T.ArrowHelper(
        new T.Vector3(bDir[0], bDir[1], bDir[2]),
        origin,
        2,
        0x4f8cff,
        0.3,
        0.15
      );
      this.scene.add(this.vectors.B);
    }

    // I current (red)
    if (problem.I) {
      const iDir = this._dirToVec(problem.I.direction);
      this.vectors.I = new T.ArrowHelper(
        new T.Vector3(iDir[0], iDir[1], iDir[2]),
        origin,
        2,
        0xff3d71,
        0.3,
        0.15
      );
      this.scene.add(this.vectors.I);
    }

    // F force (green, may be hidden initially)
    if (problem.F) {
      const fDir = this._dirToVec(problem.F.direction);
      this.vectors.F = new T.ArrowHelper(
        new T.Vector3(fDir[0], fDir[1], fDir[2]),
        origin,
        2,
        0x00e676,
        0.3,
        0.15
      );
      this.vectors.F.visible = !problem.F.hidden;
      this.scene.add(this.vectors.F);
    }
  }

  /**
   * Show the force vector (called when user locks answer)
   */
  showForce() {
    if (this.vectors.F) {
      this.vectors.F.visible = true;
    }
  }

  /**
   * Rotate the hand model
   * @param {number} axis - 'x', 'y', or 'z'
   * @param {number} angle - radians
   */
  rotateHand(axis, angle) {
    if (!this.hand) return;
    this.rotation[axis] += angle;
    this.hand.rotation[axis] = this.rotation[axis];
  }

  /**
   * Reset hand to initial position
   */
  resetHand() {
    if (!this.hand) return;
    this.rotation = { x: 0, y: 0, z: 0 };
    this.hand.rotation.set(0, 0, 0);
  }

  /**
   * Resize handler
   */
  resize(width, height) {
    if (!this.renderer) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Map direction name to 3D unit vector
   */
  _dirToVec(dir) {
    const map = {
      up:    [0, 1, 0],
      down:  [0, -1, 0],
      left:  [-1, 0, 0],
      right: [1, 0, 0],
      in:    [0, 0, 1],
      out:   [0, 0, -1],
    };
    return map[dir] || [0, 0, 0];
  }

  /**
   * Animation loop
   */
  _animate() {
    if (!this.renderer || !this.scene || !this.camera) return;
    this.renderer.render(this.scene, this.camera);
    this.onRender();
    requestAnimationFrame(() => this._animate());
  }

  /**
   * Clean up
   */
  dispose() {
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}
