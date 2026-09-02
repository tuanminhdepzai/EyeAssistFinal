/**
 * HandModule3D — Three.js 3D Hand Physics module
 *
 * Trích xuất từ handmodule.html, tái cấu trúc thành ES Module để
 * tích hợp vào hệ thống eyeassist chạy chung localhost.
 *
 * Eye Tracking được cung cấp bởi main.js (dùng BlinkDetector,
 * GazeFilter, FusionEngine đầy đủ) — không có inline eye tracking cũ.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { enhanceSelects } from './GazeSelect.js';

// ═══════════════════════════════════════════
// BONE CONFIG
// ═══════════════════════════════════════════
const FINGER_CONFIG = {
  thumb: {
    label: 'Ngón Cái 👍',
    bones: { root: 'Bone.001', lower: 'Bone.002', tip: 'Bone.003' },
    limits: {
      root:  { curl: [-0.5, 1.5] },
      lower: { curl: [-0.5, 1.5] },
      tip:   { curl: [-0.5, 1.5] }
    }
  },
  index: {
    label: 'Ngón Trỏ ☝️',
    bones: { root: 'IndexRoot', lower: 'IndexF_lower', middle: 'IndexF_middle', tip: 'IndexF_tip' },
    curlAxis: 'z', spreadAxis: 'x',
    limits: { lower: { curl: [-0.1, 1.6] }, middle: { curl: [-0.1, 1.5] }, tip: { curl: [-0.1, 1.2] } }
  },
  middle: {
    label: 'Ngón Giữa 🖕',
    bones: { root: 'MiddleRoot', lower: 'MiddleF_lower', middle: 'MiddleF_middle', tip: 'MiddleF_tip' },
    curlAxis: 'z', spreadAxis: 'x',
    limits: { lower: { curl: [-0.1, 1.6] }, middle: { curl: [-0.1, 1.5] }, tip: { curl: [-0.1, 1.2] } }
  },
  ring: {
    label: 'Ngón Áp Út 💍',
    bones: { root: 'RingRoot', lower: 'RingF_lower', middle: 'RingF_middle', tip: 'RingF_tip' },
    curlAxis: 'z', spreadAxis: 'x',
    limits: { lower: { curl: [-0.1, 1.6] }, middle: { curl: [-0.1, 1.5] }, tip: { curl: [-0.1, 1.2] } }
  },
  pinky: {
    label: 'Ngón Út 🤙',
    bones: { root: 'PinkyRoot', lower: 'PinkyF_lower', middle: 'PinkyF_middle', tip: 'PinkyF_tip' },
    curlAxis: 'z', spreadAxis: 'x',
    limits: { lower: { curl: [-0.1, 1.6] }, middle: { curl: [-0.1, 1.5] }, tip: { curl: [-0.1, 1.2] } }
  }
};

const PRESETS = {
  'Thư giãn': { thumb: { curl: 0.15, spread: 0 }, index: { curl: 0.12, spread: 0 }, middle: { curl: 0.12, spread: 0 }, ring: { curl: 0.15, spread: 0 }, pinky: { curl: 0.18, spread: 0 } },
  'Nắm tay':  { thumb: { curl: 0.75, spread: 0.2 }, index: { curl: 1.3, spread: 0 }, middle: { curl: 1.3, spread: 0 }, ring: { curl: 1.3, spread: 0 }, pinky: { curl: 1.3, spread: 0 } },
  'Mở rộng': { thumb: { curl: -0.1, spread: -0.3 }, index: { curl: -0.05, spread: -0.2 }, middle: { curl: -0.05, spread: 0 }, ring: { curl: -0.05, spread: 0.2 }, pinky: { curl: -0.05, spread: 0.3 } },
  'Peace ✌️': { thumb: { curl: 0.7, spread: 0.2 }, index: { curl: 0, spread: -0.15 }, middle: { curl: 0, spread: 0.1 }, ring: { curl: 1.3, spread: 0 }, pinky: { curl: 1.3, spread: 0 } },
  'OK 👌':    { thumb: { curl: 0.8, spread: 0.3 }, index: { curl: 1.2, spread: 0.1 }, middle: { curl: 0, spread: 0 }, ring: { curl: 0, spread: 0 }, pinky: { curl: 0, spread: -0.1 } },
  'Chỉ tay': { thumb: { curl: 0.7, spread: 0.2 }, index: { curl: 0, spread: 0 }, middle: { curl: 1.3, spread: 0 }, ring: { curl: 1.3, spread: 0 }, pinky: { curl: 1.3, spread: 0 } }
};

const DIRECTIONS = {
  LEFT:        { label: 'Sang trái (←)',             vector: [-1,  0,  0] },
  RIGHT:       { label: 'Sang phải (→)',              vector: [ 1,  0,  0] },
  UP:          { label: 'Hướng lên (↑)',              vector: [ 0,  1,  0] },
  DOWN:        { label: 'Hướng xuống (↓)',            vector: [ 0, -1,  0] },
  INTO_PAGE:   { label: 'Vào trong màn hình (⊗)',     vector: [ 0,  0, -1] },
  OUT_OF_PAGE: { label: 'Ra ngoài màn hình (⊙)',      vector: [ 0,  0,  1] }
};

// ═══════════════════════════════════════════
// MAIN CLASS
// ═══════════════════════════════════════════
export class HandModule3D {
  constructor() {
    // Three.js
    this._scene = null;
    this._camera = null;
    this._renderer = null;
    this._orbit = null;
    this._animId = null;
    this._vpEl = null;

    // Hands
    this._hands = {
      left: { name: 'Tay Trái', side: 'left', model: null, skinnedMesh: null, skelHelper: null, boneRefs: {}, baseQuats: {}, currentPose: {} }
    };
    this._activeHand = 'left';

    // 3D arrows
    this._arrowsGroup = null;
    this._arrowB = null;
    this._arrowI = null;
    this._arrowF = null;
    this._targetPulseArrow = null;
    this._arrowsVisible = true;

    // Flags
    this._skelVisible = false;
    this._wireOn = false;

    // Dwell hit-test state (for eye tracking integration)
    this._lastHoverEl = null;
    this._dwellStart = 0;
    this.DWELL_TIME_MS = 1400;

    // Magnetic snapping state for gaze tracking (same as Casio)
    this._snapEl = null;
    this._snapCx = 0;
    this._snapCy = 0;
    this._snapHysteresis = 12; // px

    // Expose for gaze engine
    this.onLog = null; // optional callback: (msg, type) => {}

    // Init pose
    Object.keys(FINGER_CONFIG).forEach(k => {
      this._hands.left.currentPose[k] = { curl: 0, spread: 0 };
    });
  }

  // ─────────────────────────────────────────
  // PUBLIC: Init with container element
  // ─────────────────────────────────────────
  init(viewportEl, containerEl) {
    this._vpEl = viewportEl;
    this._containerEl = containerEl;
    this._setupScene(viewportEl);
    this._init3DArrows();
    this._loadModel();
    this._bindWindowResize(viewportEl);

    // Nâng cấp <select> native → GazeSelect (mở & chọn bằng mắt, style đồng bộ)
    this._gazeSelects = enhanceSelects(containerEl);

    // Expose globals needed by HTML onclick handlers
    window._handModule = this;
    this._exposeGlobals();
  }

  dispose() {
    if (this._animId) cancelAnimationFrame(this._animId);
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer.domElement.remove();
    }
    this._scene = null;
    this._renderer = null;
  }

  /**
   * Snap viewport coords to nearest interactive element center within radius (magnetic effect)
   * @param {number} x - viewport X
   * @param {number} y - viewport Y
   * @param {number} [radius=70] - snap radius in pixels
   * @returns {{ element: HTMLElement, cx: number, cy: number }|null}
   */
  snapToNearest(x, y, radius = 70) {
    if (!this._containerEl) return null;

    const selector = '.th-card, .btn-next, .btn-prev, .quiz-opt, .stem-select, .hand-tab, .tb, #btn-restart, .gaze-select-trigger, .gaze-option, button, [role="button"]';
    const elements = this._containerEl.querySelectorAll(selector);

    let best = null;
    let bestDist = Infinity;

    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestDist && d < radius) {
        bestDist = d;
        best = { element: el, cx, cy };
      }
    }

    // Hysteresis: don't switch snap target if still within threshold of current snap center
    if (best && this._snapEl) {
      if (best.element !== this._snapEl) {
        const distFromCurrent = Math.hypot(x - this._snapCx, y - this._snapCy);
        if (distFromCurrent < this._snapHysteresis) {
          return { element: this._snapEl, cx: this._snapCx, cy: this._snapCy };
        }
      }
    }

    if (best) {
      this._snapEl = best.element;
      this._snapCx = best.cx;
      this._snapCy = best.cy;
    } else {
      this._snapEl = null;
    }

    return best;
  }

  // ─────────────────────────────────────────
  // GAZE HIT-TEST (called by main.js)
  // ─────────────────────────────────────────
  /**
   * Hit-test current gaze position against interactive elements in hand tab.
   * Returns the DOM element being gazed at (if any).
   */
  hitTestHand(vpX, vpY) {
    if (!this._containerEl) return null;
    const el = document.elementFromPoint(vpX, vpY);
    if (!el) return null;

    // Only interactive elements within hand tab
    const target = el.closest(
      '.th-card, .btn-next, .btn-prev, .quiz-opt, .stem-select, .hand-tab, .tb, #btn-restart'
    );

    // Check target is inside our hand tab
    if (target && this._containerEl.contains(target)) {
      return target;
    }
    return null;
  }

  /**
   * Update hover highlight. Called every frame from main.js when tab=hand.
   */
  updateGazeHover(vpX, vpY, now) {
    const target = this.hitTestHand(vpX, vpY);

    if (target !== this._lastHoverEl) {
      if (this._lastHoverEl) this._lastHoverEl.classList.remove('eye-hover');
      if (target) target.classList.add('eye-hover');
      this._lastHoverEl = target;
      this._dwellStart = now;
    }

    return target;
  }

  /**
   * Trigger click on currently hovered element (called by FusionEngine onClick).
   */
  triggerEyeClick() {
    if (this._lastHoverEl) {
      this._lastHoverEl.click();
    }
  }

  clearHover() {
    if (this._lastHoverEl) {
      this._lastHoverEl.classList.remove('eye-hover');
      this._lastHoverEl = null;
    }
  }

  // ─────────────────────────────────────────
  // SCENE SETUP
  // ─────────────────────────────────────────
  _setupScene(vp) {
    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0x0b0f19);

    this._camera = new THREE.PerspectiveCamera(38, vp.clientWidth / vp.clientHeight, 0.01, 100);
    this._camera.position.set(0, 0.38, 0.75);

    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setSize(vp.clientWidth, vp.clientHeight);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.4;
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    vp.appendChild(this._renderer.domElement);

    this._orbit = new OrbitControls(this._camera, this._renderer.domElement);
    this._orbit.enableDamping = true;
    this._orbit.dampingFactor = 0.08;
    this._orbit.rotateSpeed = 2.0;
    this._orbit.autoRotateSpeed = 4.0;
    this._orbit.minDistance = 0.12;
    this._orbit.maxDistance = 3;
    this._orbit.target.set(0, 0.05, 0);

    // Lighting
    const key = new THREE.DirectionalLight(0xfff4e6, 3.0);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.1; key.shadow.camera.far = 15;
    key.shadow.camera.left = -1.5; key.shadow.camera.right = 1.5;
    key.shadow.camera.top = 1.5; key.shadow.camera.bottom = -1.5;
    key.shadow.bias = -0.0003;
    this._scene.add(key);

    const fill = new THREE.DirectionalLight(0x88b8ff, 1.2);
    fill.position.set(-3, 2, -1);
    this._scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffaa66, 1.5);
    rim.position.set(-1.5, 3, -4);
    this._scene.add(rim);

    const bounce = new THREE.DirectionalLight(0xffd4aa, 0.4);
    bounce.position.set(0, -2, 1);
    this._scene.add(bounce);

    this._scene.add(new THREE.HemisphereLight(0xd0e0ff, 0x332211, 0.5));
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.15));

    const gnd = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    gnd.rotation.x = -Math.PI / 2;
    gnd.position.y = -0.2;
    gnd.receiveShadow = true;
    this._scene.add(gnd);

    const grid = new THREE.GridHelper(3, 30, 0x1a2540, 0x111828);
    grid.position.y = -0.199;
    this._scene.add(grid);
  }

  _bindWindowResize(vp) {
    this._resizeHandler = () => {
      if (!this._camera || !this._renderer) return;
      this._camera.aspect = vp.clientWidth / vp.clientHeight;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(vp.clientWidth, vp.clientHeight);
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  // ─────────────────────────────────────────
  // MODEL LOADING
  // ─────────────────────────────────────────
  _setupHandInstance(model, handObj, isRight) {
    model.traverse(child => {
      if (child.name) {
        handObj.boneRefs[child.name] = child;
        handObj.baseQuats[child.name] = child.quaternion.clone();
      }
      if (child.isSkinnedMesh && child.skeleton) {
        child.skeleton.bones.forEach(b => {
          if (b.name) {
            handObj.boneRefs[b.name] = b;
            handObj.baseQuats[b.name] = b.quaternion.clone();
          }
        });
      }
    });

    const meshBox = new THREE.Box3();
    model.traverse(child => {
      if (child.isMesh || child.isSkinnedMesh) {
        const geo = child.geometry;
        geo.computeBoundingBox();
        const cb = geo.boundingBox.clone();
        child.updateWorldMatrix(true, false);
        cb.applyMatrix4(child.matrixWorld);
        meshBox.union(cb);
      }
    });
    if (meshBox.isEmpty()) meshBox.setFromObject(model);

    const center = meshBox.getCenter(new THREE.Vector3());
    const size = meshBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = maxDim > 0 ? 0.35 / maxDim : 1;

    model.scale.set(s, s, s);
    model.position.set(-center.x * s, -center.y * s, -center.z * s);

    model.traverse(child => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        handObj.skinnedMesh = child;
        if (child.material) {
          child.material = child.material.clone();
          child.material.side = THREE.DoubleSide;
          child.material.needsUpdate = true;
          if (child.material.roughness !== undefined) child.material.roughness = Math.max(0.3, Math.min(child.material.roughness, 0.7));
          if (child.material.metalness !== undefined) child.material.metalness = Math.min(child.material.metalness, 0.15);
        }
      }
    });

    handObj.model = model;
    this._scene.add(model);

    handObj.skelHelper = new THREE.SkeletonHelper(model);
    handObj.skelHelper.visible = this._skelVisible;
    this._scene.add(handObj.skelHelper);
  }

  _loadModel() {
    const loader = new GLTFLoader();
    const badge = document.getElementById('hand-badge');
    const loadMsg = document.getElementById('hand-load-msg');
    if (loadMsg) loadMsg.textContent = 'Đang tải mô hình bàn tay 3D...';
    this._log('Khởi tạo GLTFLoader tải 3D model...', 'info');

    loader.load('./Realistic Hand.glb', (gltfLeft) => {
      this._setupHandInstance(gltfLeft.scene, this._hands.left, false);
      this._log('Tải thành công mô hình Tay Trái 3D!', 'success');

      this._camera.position.set(0, 0.38, 0.75);
      this._orbit.target.set(0, 0.05, 0);
      this._applyPreset('Thư giãn');

      if (badge) badge.innerHTML = '<span class="hand-dot"></span>Realistic 3D Hand — Tay Trái';

      const loadingEl = document.getElementById('hand-loading');
      if (loadingEl) loadingEl.classList.add('done');

      this._startAnimate();
    }, (xhr) => {
      if (xhr.total && loadMsg) loadMsg.textContent = `Đang tải: ${Math.round(xhr.loaded / xhr.total * 100)}%`;
    }, (err) => {
      console.error(err);
      if (loadMsg) loadMsg.innerHTML = '<span style="color:#f87171">Lỗi tải model</span>';
    });
  }

  // ─────────────────────────────────────────
  // BONE / POSE
  // ─────────────────────────────────────────
  _getBone(handObj, name) {
    if (!name || !handObj) return null;
    if (handObj.boneRefs[name]) return handObj.boneRefs[name];
    const clean = name.replace(/[\._\s]/g, '').toLowerCase();
    const key = Object.keys(handObj.boneRefs).find(k => k.replace(/[\._\s]/g, '').toLowerCase() === clean);
    return key ? handObj.boneRefs[key] : null;
  }

  _getBaseQuat(handObj, name) {
    const bone = this._getBone(handObj, name);
    if (!bone) return null;
    return handObj.baseQuats[bone.name] || handObj.baseQuats[name] || bone.quaternion.clone();
  }

  _setBoneRotation(handObj, boneName, axis, angleRad) {
    const bone = this._getBone(handObj, boneName);
    const base = this._getBaseQuat(handObj, boneName);
    if (!bone || !base) return;
    const delta = new THREE.Quaternion();
    const euler = new THREE.Euler();
    euler[axis] = angleRad;
    delta.setFromEuler(euler);
    bone.quaternion.copy(base).multiply(delta);
  }

  _applyFingerPoseToHand(handObj, fingerKey, curl, spread) {
    const cfg = FINGER_CONFIG[fingerKey];
    if (!cfg || !handObj) return;
    const curlAxis = cfg.curlAxis;
    const spreadAxis = cfg.spreadAxis;

    if (fingerKey === 'thumb') {
      const thumbJoints = [
        { joint: 'root',  curlAxis: 'x', spreadAxis: 'z', weight: 0.5 },
        { joint: 'lower', curlAxis: 'x', weight: 0.6 },
        { joint: 'tip',   curlAxis: 'z', weight: 0.5 }
      ];
      thumbJoints.forEach(item => {
        const boneName = cfg.bones[item.joint];
        if (!boneName) return;
        const bone = this._getBone(handObj, boneName);
        const base = this._getBaseQuat(handObj, boneName);
        if (!bone || !base) return;
        const lim = cfg.limits[item.joint];
        let clampedCurl = 0;
        if (lim) clampedCurl = Math.max(lim.curl[0], Math.min(lim.curl[1], curl * item.weight * 2.0));
        const euler = new THREE.Euler();
        euler[item.curlAxis] = clampedCurl;
        if (item.spreadAxis && spread !== undefined) euler[item.spreadAxis] = spread;
        const delta = new THREE.Quaternion().setFromEuler(euler);
        bone.quaternion.copy(base).multiply(delta);
      });
    } else {
      const joints = ['lower', 'middle', 'tip'];
      const weights = [0.4, 0.35, 0.25];
      joints.forEach((j, i) => {
        const boneName = cfg.bones[j];
        if (!boneName) return;
        const lim = cfg.limits[j];
        if (lim) {
          const clampedCurl = Math.max(lim.curl[0], Math.min(lim.curl[1], curl * weights[i] * 2.5));
          this._setBoneRotation(handObj, boneName, curlAxis, clampedCurl);
        }
      });
      const rootBone = cfg.bones.root;
      if (rootBone && spread !== undefined) {
        const bone = this._getBone(handObj, rootBone);
        const base = this._getBaseQuat(handObj, rootBone);
        if (bone && base) {
          const delta = new THREE.Quaternion();
          const euler = new THREE.Euler();
          euler[spreadAxis] = spread;
          delta.setFromEuler(euler);
          bone.quaternion.copy(base).multiply(delta);
        }
      }
    }
    handObj.currentPose[fingerKey] = { curl, spread };
  }

  _applyFingerPose(fingerKey, curl, spread) {
    let finalCurl = curl;
    if (fingerKey === 'thumb') finalCurl = THREE.MathUtils.degToRad(-10);
    if (this._activeHand === 'left'  || this._activeHand === 'both') {
      this._hands.left.currentPose[fingerKey] = { curl: finalCurl, spread };
      this._applyFingerPoseToHand(this._hands.left, fingerKey, finalCurl, spread);
    }
    if (this._activeHand === 'right' || this._activeHand === 'both') {
      this._hands.right.currentPose[fingerKey] = { curl: finalCurl, spread };
      this._applyFingerPoseToHand(this._hands.right, fingerKey, finalCurl, spread);
    }
  }

  _applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    Object.keys(p).forEach(fk => {
      const { curl, spread } = p[fk];
      this._applyFingerPose(fk, curl, spread);
    });
  }

  // ─────────────────────────────────────────
  // HAND TAB SELECTOR
  // ─────────────────────────────────────────
  setHandTab(tabKey) {
    this._activeHand = tabKey;
    document.querySelectorAll('.hand-tab').forEach(btn => {
      btn.classList.toggle('on', btn.id === `tab-${tabKey}`);
    });
    const label = tabKey === 'both' ? 'Cả Hai Tay' : tabKey === 'left' ? 'Tay Trái' : 'Tay Phải';
    this._log(`🖐️ Chế độ điều khiển: ${label}`, 'success');
  }

  // ─────────────────────────────────────────
  // WIZARD FLOW
  // ─────────────────────────────────────────
  selectTH(thKey) {
    this._currentTH = thKey;
    document.querySelectorAll('.th-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById(thKey === 'TH1' ? 'th-1' : thKey === 'TH2' ? 'th-2' : 'th-3');
    if (card) card.classList.add('selected');
    this._updateStep2Inputs();
    this._log(`📌 Đã chọn trường hợp: ${thKey}`, 'info');
  }

  _updateStep2Inputs() {
    const ruleType = document.getElementById('stem-rule-type').value;
    const l1 = document.getElementById('label-given-1');
    const l2 = document.getElementById('label-given-2');
    const nameB = '🔵 Cảm ứng từ B';
    const nameI = ruleType === 'RIGHT_FARADAY' ? '🔴 Dòng cảm ứng I_cu' : ruleType === 'LEFT_LORENTZ' ? '🔴 Vận tốc hạt v' : '🔴 Dòng điện I';
    const nameF = ruleType === 'LEFT_LORENTZ' ? '🟡 Lực Lorentz F' : '🟡 Lực từ F';
    const th = this._currentTH || 'TH1';
    if (l1) l1.textContent = th === 'TH3' ? nameF : nameB;
    if (l2) l2.textContent = th === 'TH2' ? nameF : nameI;
  }

  goToStep(stepNum) {
    this._currentStep = stepNum;
    for (let i = 1; i <= 3; i++) {
      const el = document.getElementById(`step-${i}`);
      if (el) el.style.display = i === stepNum ? 'flex' : 'none';
      const node = document.getElementById(`node-${i}`);
      if (node) {
        node.classList.toggle('active', i === stepNum);
        node.classList.toggle('done', i < stepNum);
      }
    }
    if (stepNum === 2) this._updateStep2Inputs();
  }

  updateStemLabels() {
    const ruleType = document.getElementById('stem-rule-type').value;
    const rows = { i: ['label-given-1', 'label-given-2'], f: [] };
    // Update label-given fields
    this._updateStep2Inputs();
  }

  confirmDataAndGoStep3() {
    const ruleType = document.getElementById('stem-rule-type').value;
    const val1 = document.getElementById('select-given-1').value;
    const val2 = document.getElementById('select-given-2').value;
    const th = this._currentTH || 'TH1';
    let data = { ruleType, B: null, I: null, F: null };
    if (th === 'TH1') { data.B = val1; data.I = val2; }
    else if (th === 'TH2') { data.B = val1; data.F = val2; }
    else if (th === 'TH3') { data.F = val1; data.I = val2; }

    const res = this._solveHandRuleV2(data);
    if (res.error) { alert(res.message); this._log(res.message, 'err'); return; }

    this._quizSolution = res;
    this.goToStep(3);

    const activeHandObj = this._hands.left;
    if (activeHandObj.model) {
      this._alignHandWithVectors(activeHandObj.model, res.arrowOverlay.arrowB.vector, res.arrowOverlay.arrowI.vector, ruleType, false);
    }
    this._positionArrowsOnHand(activeHandObj, false, res.arrowOverlay.arrowB.vector);
    this._setArrowOrientation(this._arrowB, res.arrowOverlay.arrowB.vector);
    this._setArrowOrientation(this._arrowI, res.arrowOverlay.arrowI.vector);
    this._setArrowOrientation(this._arrowF, res.arrowOverlay.arrowF.vector);

    if (res.missingElement === 'B') this._arrowB.visible = false;
    if (res.missingElement === 'I') this._arrowI.visible = false;
    if (res.missingElement === 'F') this._arrowF.visible = false;

    this.setHandTab('left');
    this._applyPreset('Mở rộng');
    this._buildQuizQuestion(res);
  }

  _buildQuizQuestion(res) {
    const qText = document.getElementById('quiz-question-text');
    const optsDiv = document.getElementById('quiz-options');
    const resDiv = document.getElementById('stem-res');
    const btnRestart = document.getElementById('btn-restart');
    if (!qText || !optsDiv) return;

    resDiv.style.display = 'none';
    btnRestart.style.display = 'none';
    optsDiv.innerHTML = '';

    const ruleType = document.getElementById('stem-rule-type').value;
    const missing = res.missingElement;
    const missingLabel = missing === 'F'
      ? (ruleType === 'RIGHT_FARADAY' ? 'Vận tốc v' : ruleType === 'LEFT_LORENTZ' ? 'Lực Lorentz F' : 'Lực từ F')
      : missing === 'I'
        ? (ruleType === 'RIGHT_FARADAY' ? 'Dòng cảm ứng I_cu' : ruleType === 'LEFT_LORENTZ' ? 'Vận tốc hạt v' : 'Dòng điện I')
        : 'Cảm ứng từ B';

    qText.innerHTML = `<strong>Hỏi:</strong> Dựa vào mô hình 3D bàn tay và 2 vectơ dữ kiện vừa hiện trên màn hình, hướng của <strong>${missingLabel} (${missing})</strong> sẽ là hướng nào?`;

    const correctDir = res.calculatedResult;
    const correctText = DIRECTIONS[correctDir] ? DIRECTIONS[correctDir].label : correctDir;
    const allKeys = Object.keys(DIRECTIONS).filter(k => k !== correctDir);
    const wrongKeys = allKeys.sort(() => 0.5 - Math.random()).slice(0, 2);
    const optionsList = [
      { key: correctDir, label: correctText, isCorrect: true },
      { key: wrongKeys[0], label: DIRECTIONS[wrongKeys[0]].label, isCorrect: false },
      { key: wrongKeys[1], label: DIRECTIONS[wrongKeys[1]].label, isCorrect: false }
    ].sort(() => 0.5 - Math.random());

    optionsList.forEach((opt, idx) => {
      const btn = document.createElement('div');
      btn.className = 'quiz-opt';
      btn.innerHTML = `<strong>${String.fromCharCode(65 + idx)}.</strong> ${opt.label}`;
      btn.onclick = () => this._checkQuizAnswer(btn, opt.isCorrect, res);
      optsDiv.appendChild(btn);
    });
  }

  _checkQuizAnswer(selectedBtn, isCorrect, res) {
    const optsDiv = document.getElementById('quiz-options');
    const resDiv = document.getElementById('stem-res');
    const btnRestart = document.getElementById('btn-restart');

    Array.from(optsDiv.children).forEach(child => child.style.pointerEvents = 'none');

    if (isCorrect) {
      selectedBtn.classList.add('correct');
      this._log('🎉 Học sinh đã trả lời ĐÚNG!', 'success');
    } else {
      selectedBtn.classList.add('wrong');
      this._log('❌ Học sinh trả lời CHƯA ĐÚNG.', 'warn');
    }

    if (res.missingElement === 'B') this._arrowB.visible = true;
    if (res.missingElement === 'I') this._arrowI.visible = true;
    if (res.missingElement === 'F') this._arrowF.visible = true;

    if (res.missingElement === 'B') this._targetPulseArrow = this._arrowB;
    else if (res.missingElement === 'I') this._targetPulseArrow = this._arrowI;
    else if (res.missingElement === 'F') this._targetPulseArrow = this._arrowF;

    const palmHint = this._getPalmOrientationHint(res.arrowOverlay.arrowB.direction, res.arrowOverlay.arrowI.direction);
    resDiv.style.display = 'block';
    resDiv.className = isCorrect ? 'stem-res' : 'stem-res err';
    resDiv.innerHTML = `
      <strong>${isCorrect ? '🎉 CHÍNH XÁC!' : '❌ CHƯA CHÍNH XÁC!'}</strong><br>
      <span style="font-size:.77rem">
      🎯 Đáp án đúng: <strong>${res.resultLabel}</strong><br>
      ✋ Quy tắc: <em>${res.handType === 'RIGHT_HAND' ? 'Bàn tay phải' : 'Bàn tay trái'}</em><br>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,.07);margin:5px 0">
      🖐️ <strong>Cách đặt bàn tay:</strong><br>
      ${palmHint}
      </span>
    `;
    btnRestart.style.display = 'flex';
  }

  // ─────────────────────────────────────────
  // 3D ARROWS
  // ─────────────────────────────────────────
  _create3DArrow(colorHex, labelText) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: colorHex, emissive: colorHex, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.1
    });
    const shaftGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.22, 16);
    shaftGeo.translate(0, 0.11, 0);
    const shaft = new THREE.Mesh(shaftGeo, mat);
    shaft.castShadow = true;
    group.add(shaft);

    const coneGeo = new THREE.ConeGeometry(0.02, 0.05, 16);
    coneGeo.translate(0, 0.245, 0);
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.castShadow = true;
    group.add(cone);

    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + colorHex.toString(16).padStart(6, '0');
    ctx.font = 'Bold 44px sans-serif';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
    ctx.fillText(labelText, 16, 46);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.position.set(0, 0.29, 0);
    sprite.scale.set(0.12, 0.06, 1);
    group.add(sprite);

    group.userData = { mat, initialEmissive: 0.35 };
    return group;
  }

  _init3DArrows() {
    this._arrowsGroup = new THREE.Group();
    this._arrowB = this._create3DArrow(0x1a73e8, 'B');
    this._arrowI = this._create3DArrow(0xd93025, 'I');
    this._arrowF = this._create3DArrow(0xf9ab00, 'F');
    this._arrowsGroup.add(this._arrowB);
    this._arrowsGroup.add(this._arrowI);
    this._arrowsGroup.add(this._arrowF);
    this._arrowsGroup.visible = this._arrowsVisible;
    this._scene.add(this._arrowsGroup);
  }

  _setArrowOrientation(arrowObj, vecArr) {
    if (!vecArr || vecArr.length < 3) { arrowObj.visible = false; return; }
    arrowObj.visible = true;
    const dir = new THREE.Vector3(vecArr[0], vecArr[1], vecArr[2]).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    arrowObj.quaternion.copy(quat);
  }

  // ─────────────────────────────────────────
  // PHYSICS SOLVER
  // ─────────────────────────────────────────
  _crossProduct(vA, vB) {
    return [vA[1]*vB[2]-vA[2]*vB[1], vA[2]*vB[0]-vA[0]*vB[2], vA[0]*vB[1]-vA[1]*vB[0]];
  }

  _vectorToDirectionName(vec) {
    for (const key in DIRECTIONS) {
      const v = DIRECTIONS[key].vector;
      if (v[0]===vec[0] && v[1]===vec[1] && v[2]===vec[2]) return key;
    }
    return 'UNKNOWN';
  }

  _solveHandRuleV2(problemData) {
    let bVec = problemData.B ? DIRECTIONS[problemData.B].vector : null;
    let iVec = problemData.I ? DIRECTIONS[problemData.I].vector : null;
    let fVec = problemData.F ? DIRECTIONS[problemData.F].vector : null;

    if (bVec && iVec) {
      const dot = Math.abs(bVec[0]*iVec[0]+bVec[1]*iVec[1]+bVec[2]*iVec[2]);
      if (dot === 1) return { error: true, message: '⚠️ Dòng điện I (hoặc v) song song với Cảm ứng từ B nên Lực từ F = 0.' };
    }

    let missingElement = '', calculatedResultDir = '';
    if (bVec && iVec && !fVec) {
      missingElement = 'F';
      const r = this._crossProduct(iVec, bVec);
      calculatedResultDir = this._vectorToDirectionName(r);
      fVec = r;
    } else if (bVec && fVec && !iVec) {
      missingElement = 'I';
      const r = this._crossProduct(bVec, fVec);
      calculatedResultDir = this._vectorToDirectionName(r);
      iVec = r;
    } else if (iVec && fVec && !bVec) {
      missingElement = 'B';
      const r = this._crossProduct(fVec, iVec);
      calculatedResultDir = this._vectorToDirectionName(r);
      bVec = r;
    } else {
      return { error: true, message: '⚠️ Vui lòng chọn đúng 2 đại lượng đã biết.' };
    }

    const bDirName = problemData.B || (missingElement === 'B' ? calculatedResultDir : null);
    const iDirName = problemData.I || (missingElement === 'I' ? calculatedResultDir : null);
    const fDirName = problemData.F || (missingElement === 'F' ? calculatedResultDir : null);

    return {
      error: false,
      missingElement,
      calculatedResult: calculatedResultDir,
      resultLabel: DIRECTIONS[calculatedResultDir] ? DIRECTIONS[calculatedResultDir].label : '',
      handType: problemData.ruleType.includes('RIGHT') ? 'RIGHT_HAND' : 'LEFT_HAND',
      arrowOverlay: {
        arrowB: { color: '#1a73e8', direction: bDirName, vector: bVec,  label: 'B (Từ trường)', isTargetResult: missingElement === 'B' },
        arrowI: { color: '#d93025', direction: iDirName, vector: iVec,  label: 'I/v', isTargetResult: missingElement === 'I' },
        arrowF: { color: '#f9ab00', direction: fDirName, vector: fVec,  label: 'F', isTargetResult: missingElement === 'F' }
      }
    };
  }

  // ─────────────────────────────────────────
  // HAND ALIGNMENT WITH PHYSICS VECTORS
  // ─────────────────────────────────────────
  _alignHandWithVectors(handModel, vB, vI, ruleType, isRight) {
    if (!handModel || !vB || !vI) return;
    const vecB = new THREE.Vector3(...vB).normalize();
    const vecI = new THREE.Vector3(...vI).normalize();
    const targetFinger = vecI.clone();
    let targetPalm = vecB.clone();
    let targetThumb = new THREE.Vector3().crossVectors(targetFinger, targetPalm).normalize();
    targetPalm.crossVectors(targetThumb, targetFinger).normalize();
    const m = new THREE.Matrix4();
    m.makeBasis(targetThumb, targetFinger, targetPalm);

    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);
    const offsetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, -Math.PI / 2, Math.PI / 2));
    targetQuat.multiply(offsetQuat);
    if (isRight) {
      const rQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
      targetQuat.multiply(rQuat);
    }
    handModel.userData.targetQuat = targetQuat;
  }

  _positionArrowsOnHand(handObj, isRight, bVec) {
    if (!handObj || !handObj.model) return;
    const palmBoneNames = ['MiddleRoot', 'IndexRoot', 'RingRoot'];
    let palmPos = null;
    for (const bname of palmBoneNames) {
      const bone = this._getBone(handObj, bname);
      if (bone) { const wpos = new THREE.Vector3(); bone.getWorldPosition(wpos); palmPos = wpos; break; }
    }
    if (palmPos) {
      this._arrowB.position.copy(palmPos);
      if (bVec) {
        const bDir = new THREE.Vector3(bVec[0], bVec[1], bVec[2]).normalize();
        this._arrowB.position.sub(bDir.multiplyScalar(0.035));
      }
    } else {
      const off = isRight ? new THREE.Vector3(0.24, 0.02, 0) : new THREE.Vector3(-0.24, 0.02, 0);
      this._arrowB.position.copy(off);
    }

    const wristBoneNames = ['Bone', 'Wrist', 'Hand'];
    let wristPos = null;
    for (const bname of wristBoneNames) {
      const bone = this._getBone(handObj, bname);
      if (bone) { const wpos = new THREE.Vector3(); bone.getWorldPosition(wpos); wristPos = wpos; break; }
    }
    if (wristPos) this._arrowI.position.copy(wristPos);
    else this._arrowI.position.copy(isRight ? new THREE.Vector3(0.24, -0.13, 0) : new THREE.Vector3(-0.24, -0.13, 0));

    const thumbBoneNames = ['Bone.001', 'ThumbRoot'];
    let thumbPos = null;
    for (const bname of thumbBoneNames) {
      const bone = this._getBone(handObj, bname);
      if (bone) { const wpos = new THREE.Vector3(); bone.getWorldPosition(wpos); thumbPos = wpos; break; }
    }
    if (thumbPos) this._arrowF.position.copy(thumbPos);
    else this._arrowF.position.copy(isRight ? new THREE.Vector3(0.28, 0.03, 0.03) : new THREE.Vector3(-0.28, 0.03, 0.03));
  }

  _getPalmOrientationHint(bDir, iDir) {
    const hints = {
      INTO_PAGE:   `• 🔵 B đâm vào trong (⊗): <strong>Lòng bàn tay hướng vào trong màn hình</strong><br>• 🔴 4 ngón thẳng theo chiều ${DIRECTIONS[iDir]?.label || iDir}`,
      OUT_OF_PAGE: `• 🔵 B bắn ra ngoài (⊙): <strong>Lòng bàn tay hướng ra ngoài</strong><br>• 🔴 4 ngón thẳng theo chiều ${DIRECTIONS[iDir]?.label || iDir}`,
      UP:          `• 🔵 B hướng lên (↑): <strong>Lòng bàn tay ngửa sang phải để hứng từ trường</strong><br>• 🔴 4 ngón thẳng theo chiều ${DIRECTIONS[iDir]?.label || iDir}`,
      DOWN:        `• 🔵 B hướng xuống (↓): <strong>Lòng bàn tay ngửa sang trái</strong><br>• 🔴 4 ngón thẳng theo chiều ${DIRECTIONS[iDir]?.label || iDir}`,
      LEFT:        `• 🔵 B hướng sang trái (←): <strong>Lòng bàn tay ngửa lên trên</strong><br>• 🔴 4 ngón thẳng theo chiều ${DIRECTIONS[iDir]?.label || iDir}`,
      RIGHT:       `• 🔵 B hướng sang phải (→): <strong>Lòng bàn tay hướng sang phải</strong><br>• 🔴 4 ngón thẳng theo chiều ${DIRECTIONS[iDir]?.label || iDir}`,
    };
    return hints[bDir] || `• Đặt lòng bàn tay theo hướng B = ${bDir}`;
  }

  // ─────────────────────────────────────────
  // TOOLBAR ACTIONS
  // ─────────────────────────────────────────
  toggleSkel() {
    this._skelVisible = !this._skelVisible;
    if (this._hands.left.skelHelper) this._hands.left.skelHelper.visible = this._skelVisible;
    if (this._hands.right.skelHelper) this._hands.right.skelHelper.visible = this._skelVisible;
    document.getElementById('hand-tb-skel')?.classList.toggle('on', this._skelVisible);
    this._log(`🦴 Skeleton helper: ${this._skelVisible ? 'HIỆN' : 'ẨN'}`, 'info');
  }

  toggleWire() {
    this._wireOn = !this._wireOn;
    if (this._hands.left.skinnedMesh?.material) this._hands.left.skinnedMesh.material.wireframe = this._wireOn;
    if (this._hands.right.skinnedMesh?.material) this._hands.right.skinnedMesh.material.wireframe = this._wireOn;
    document.getElementById('hand-tb-wire')?.classList.toggle('on', this._wireOn);
    this._log(`🔲 Wireframe mode: ${this._wireOn ? 'BẬT' : 'TẮT'}`, 'info');
  }

  toggleRot() {
    this._orbit.autoRotate = !this._orbit.autoRotate;
    this._orbit.autoRotateSpeed = 4.0;
    document.getElementById('hand-tb-rot').classList.toggle('on', this._orbit.autoRotate);
    this._log(`🔄 Tự động xoay: ${this._orbit.autoRotate ? 'BẬT' : 'TẮT'}`, 'info');
  }

  toggleArrows() {
    this._arrowsVisible = !this._arrowsVisible;
    if (this._arrowsGroup) this._arrowsGroup.visible = this._arrowsVisible;
    document.getElementById('hand-tb-arrows').classList.toggle('on', this._arrowsVisible);
    this._log(`🎯 Mũi tên Vectơ 3D: ${this._arrowsVisible ? 'HIỆN' : 'ẨN'}`, 'info');
  }

  resetCam() {
    this._camera.position.set(0, 0.38, 0.75);
    this._orbit.target.set(0, 0.05, 0);
    this._orbit.update();
    this._log('🎯 Reset Camera & Orbit', 'info');
  }

  // ─────────────────────────────────────────
  // ANIMATE LOOP
  // ─────────────────────────────────────────
  _startAnimate() {
    const loop = () => {
      this._animId = requestAnimationFrame(loop);

      // Smooth SLERP motion for hand model rotations
      const h = this._hands.left;
      if (h && h.model && h.model.userData.targetQuat) {
        h.model.quaternion.slerp(h.model.userData.targetQuat, 0.08);
      }

      if (this._targetPulseArrow?.userData) {
        const pulse = 0.35 + Math.sin(Date.now() * 0.01) * 0.45;
        this._targetPulseArrow.userData.mat.emissiveIntensity = pulse;
      }
      this._orbit.update();
      this._renderer.render(this._scene, this._camera);
    };
    loop();
  }

  // ─────────────────────────────────────────
  // LOGGER
  // ─────────────────────────────────────────
  _log(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString();
    const text = `[${ts}] ${msg}`;
    console.log(`%c${text}`, type==='err'?'color:#f87171':type==='success'?'color:#34d399':type==='warn'?'color:#fbbf24':'color:#4f8ef7');
    const panel = document.getElementById('hand-debug-logs');
    if (panel) {
      const div = document.createElement('div');
      div.className = `log-${type}`;
      div.textContent = text;
      panel.appendChild(div);
      panel.scrollTop = panel.scrollHeight;
    }
    if (this.onLog) this.onLog(msg, type);
  }

  // ─────────────────────────────────────────
  // EXPOSE GLOBALS for HTML onclick handlers
  // ─────────────────────────────────────────
  _exposeGlobals() {
    const m = this;
    window.handGoToStep        = (n) => m.goToStep(n);
    window.handSelectTH        = (k) => m.selectTH(k);
    window.handSetHandTab      = (k) => m.setHandTab(k);
    window.handUpdateStemLabels= ()  => m.updateStemLabels();
    window.handConfirmData     = ()  => m.confirmDataAndGoStep3();
    window.handToggleSkel      = ()  => m.toggleSkel();
    window.handToggleWire      = ()  => m.toggleWire();
    window.handToggleRot       = ()  => m.toggleRot();
    window.handToggleArrows    = ()  => m.toggleArrows();
    window.handResetCam        = ()  => m.resetCam();
  }

  // ─────────────────────────────────────────
  // Resize handler (called when tab becomes visible)
  // ─────────────────────────────────────────
  handleResize() {
    if (!this._vpEl || !this._camera || !this._renderer) return;
    this._camera.aspect = this._vpEl.clientWidth / this._vpEl.clientHeight;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(this._vpEl.clientWidth, this._vpEl.clientHeight);
  }
}
