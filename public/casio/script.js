/**
 * Casio fx-580VN X ClassWiz Simulator
 * Hoàn chỉnh - Mode COMP
 */

'use strict';

// ============================================================
// 1. GLOBAL STATE & COMPLEX MATH ENGINE
// ============================================================
class Complex {
  constructor(re, im = 0) {
    this.re = Math.abs(re) < 1e-14 ? 0 : re;
    this.im = Math.abs(im) < 1e-14 ? 0 : im;
  }

  add(other) {
    const o = toComplex(other);
    return new Complex(this.re + o.re, this.im + o.im);
  }

  sub(other) {
    const o = toComplex(other);
    return new Complex(this.re - o.re, this.im - o.im);
  }

  mul(other) {
    const o = toComplex(other);
    return new Complex(
      this.re * o.re - this.im * o.im,
      this.re * o.im + this.im * o.re
    );
  }

  div(other) {
    const o = toComplex(other);
    const denom = o.re * o.re + o.im * o.im;
    if (denom === 0) throw { type: 'Math', msg: 'Division by zero' };
    return new Complex(
      (this.re * o.re + this.im * o.im) / denom,
      (this.im * o.re - this.re * o.im) / denom
    );
  }

  neg() {
    return new Complex(-this.re, -this.im);
  }

  abs() {
    return Math.sqrt(this.re * this.re + this.im * this.im);
  }

  arg() {
    return Math.atan2(this.im, this.re);
  }

  conjg() {
    return new Complex(this.re, -this.im);
  }

  pow(other) {
    const o = toComplex(other);
    if (o.im === 0) {
      const p = o.re;
      if (this.im === 0) {
        if (this.re < 0 && !Number.isInteger(p)) {
          const r = -this.re;
          const mag = Math.pow(r, p);
          const angle = p * Math.PI;
          return new Complex(mag * Math.cos(angle), mag * Math.sin(angle));
        }
        return new Complex(Math.pow(this.re, p), 0);
      }
      const r = this.abs();
      const theta = this.arg();
      const r_p = Math.pow(r, p);
      const theta_p = theta * p;
      return new Complex(r_p * Math.cos(theta_p), r_p * Math.sin(theta_p));
    }
    
    const r = this.abs();
    if (r === 0) {
      if (o.re === 0 && o.im === 0) return new Complex(1, 0);
      return new Complex(0, 0);
    }
    const theta = this.arg();
    const ln_re = Math.log(r);
    const ln_im = theta;
    const w_re = o.re * ln_re - o.im * ln_im;
    const w_im = o.re * ln_im + o.im * ln_re;
    const mag = Math.exp(w_re);
    return new Complex(mag * Math.cos(w_im), mag * Math.sin(w_im));
  }

  sqrt() {
    const r = this.abs();
    const theta = this.arg();
    const sqrt_r = Math.sqrt(r);
    return new Complex(sqrt_r * Math.cos(theta / 2), sqrt_r * Math.sin(theta / 2));
  }
}

function toComplex(val) {
  if (val instanceof Complex) return val;
  if (val && typeof val === 'object' && 're' in val && 'im' in val) {
    return new Complex(val.re, val.im);
  }
  if (typeof val === 'number') return new Complex(val, 0);
  return new Complex(0, 0);
}

function checkReal(val) {
  const z = toComplex(val);
  if (z.im !== 0) throw { type: 'Math', msg: 'Domain ERROR' };
  return z.re;
}

function checkRealInt(val) {
  const z = toComplex(val);
  if (z.im !== 0 || !Number.isInteger(z.re)) throw { type: 'Math', msg: 'Domain ERROR' };
  return z.re;
}

const State = {
  mode: 1,
  isShift: false,
  isAlpha: false,
  isInsert: false,
  activeTemplatePath: [],

  tokens: [],
  cursorIdx: 0,

  Ans: 0,
  PreAns: 0,
  baseValue: 0,
  baseSystem: 'DEC',
  hasResult: false,
  errorState: null,
  errorPos: -1,

  multiStmts: [],
  multiStmtIdx: 0,

  vars: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, M: 0, X: 0, Y: 0 },

  settings: {
    angle: 'D',
    format: 'Norm',
    formatN: 2,
    io: 'Math',
    complexFormat: 'algebraic'
  },

  isPowerOff: false,
  inMenu: false,
  inOptnMenu: false,
  menuCursor: 0,

  waitingSTO: false,
  waitingRCL: false,

  history: [],
  historyIdx: -1,

  sdMode: 'dec',
  sdDisplayOverride: null,

  // CALC & SOLVE states
  inCalcPrompt: false,
  calcInputStr: '',
  calcTokens: [],
  calcCursorIdx: 0,
  inSolvePrompt: false,
  solveInputStr: '',
  solveTokens: [],
  solveCursorIdx: 0,
  inSolveResult: false,
  solveEqStr: '',
  solveValStr: '',
  solveDiffStr: ''
};

// ============================================================
// 2. TOKEN DEFINITIONS
// ============================================================
const KEY_TOKENS = {
  '0': { display: '0', raw: '0', type: 'num', byteLen: 1 },
  '1': { display: '1', raw: '1', type: 'num', byteLen: 1 },
  '2': { display: '2', raw: '2', type: 'num', byteLen: 1 },
  '3': { display: '3', raw: '3', type: 'num', byteLen: 1 },
  '4': { display: '4', raw: '4', type: 'num', byteLen: 1 },
  '5': { display: '5', raw: '5', type: 'num', byteLen: 1 },
  '6': { display: '6', raw: '6', type: 'num', byteLen: 1 },
  '7': { display: '7', raw: '7', type: 'num', byteLen: 1 },
  '8': { display: '8', raw: '8', type: 'num', byteLen: 1 },
  '9': { display: '9', raw: '9', type: 'num', byteLen: 1 },
  'DOT': { display: '.', raw: '.', type: 'num', byteLen: 1 },
  'PLUS': { display: '+', raw: '+', type: 'op', byteLen: 1 },
  'MINUS': { display: '−', raw: '-', type: 'op', byteLen: 1 },
  'MULTIPLY': { display: '×', raw: '*', type: 'op', byteLen: 1 },
  'DIVIDE': { display: '÷', raw: '/', type: 'op', byteLen: 1 },
  'LPAREN': { display: '(', raw: '(', type: 'lp', byteLen: 1 },
  'RPAREN': { display: ')', raw: ')', type: 'rp', byteLen: 1 },
  'ANS': { display: 'Ans', raw: '__ANS__', type: 'const', byteLen: 3 },
  'EXP': { display: '×10^(', raw: '*10^(', type: 'op', byteLen: 4 },
  'NEGATION': { display: '(-)', raw: '(-1)*', type: 'op', byteLen: 3 },
  'SIN': { display: 'sin(', raw: 'sin(', type: 'func', byteLen: 4 },
  'COS': { display: 'cos(', raw: 'cos(', type: 'func', byteLen: 4 },
  'TAN': { display: 'tan(', raw: 'tan(', type: 'func', byteLen: 4 },
  'SQUARE': { display: '²', raw: '^2', type: 'op', byteLen: 2 },
  'SQRT': { display: '√(', raw: 'sqrt(', type: 'func', byteLen: 5 },
  'LN': { display: 'ln(', raw: 'ln(', type: 'func', byteLen: 3 },
  'POWER': { display: '^', raw: '^', type: 'op', byteLen: 1 },
  'INVERSE': { display: '⁻¹', raw: '^(-1)', type: 'op', byteLen: 3 },
  'LOG_BASE': { display: 'log(', raw: 'log(', type: 'func', byteLen: 4 },
  'FRAC': { display: '/(', raw: '/(', type: 'op', byteLen: 2 },
  'DEGREE': { display: '°', raw: '*(π/180)', type: 'op', byteLen: 1 },
  'SD': { display: 'S⇔D', raw: '__SD__', type: 'special', byteLen: 3 },
  'ENG': { display: '×10^', raw: '*10^', type: 'op', byteLen: 3 },
  'MPLUS': { display: 'M+', raw: '__MPLUS__', type: 'special', byteLen: 2 },
  'INTEGRAL': { display: '∫(', raw: 'integral(', type: 'func', byteLen: 8 },
  'X_VAR': { display: 'X', raw: '__VAR_X__', type: 'var', byteLen: 1 },

  // SHIFT mappings
  'SHIFT_SIN': { display: 'sin⁻¹(', raw: 'asin(', type: 'func', byteLen: 6 },
  'SHIFT_COS': { display: 'cos⁻¹(', raw: 'acos(', type: 'func', byteLen: 6 },
  'SHIFT_TAN': { display: 'tan⁻¹(', raw: 'atan(', type: 'func', byteLen: 6 },
  'SHIFT_SQRT': { display: '∛(', raw: 'cbrt(', type: 'func', byteLen: 5 },
  'SHIFT_SQUARE': { display: '³', raw: '^3', type: 'op', byteLen: 2 },
  'SHIFT_LN': { display: 'e^(', raw: 'exp(', type: 'func', byteLen: 4 },
  'SHIFT_LOG_BASE': { display: '10^(', raw: 'pow10(', type: 'func', byteLen: 5 },
  'SHIFT_POWER': { display: 'ˣ√', raw: '__XROOT__', type: 'op', byteLen: 2 },
  'SHIFT_DEGREE': { display: '⇔', raw: '__DDMS__', type: 'special', byteLen: 2 },
  'SHIFT_NEGATION': { display: 'Abs(', raw: 'abs(', type: 'func', byteLen: 4 },
  'SHIFT_INVERSE': { display: 'x!', raw: 'fact(', type: 'func', byteLen: 3 },
  'SHIFT_FRAC': { display: 'd/c', raw: '/', type: 'op', byteLen: 2 },
  'SHIFT_MPLUS': { display: 'M−', raw: '__MMINUS__', type: 'special', byteLen: 2 },
  'SHIFT_7': { display: 'CONST', raw: '__CONST__', type: 'special', byteLen: 5 },
  'SHIFT_8': { display: 'CONV', raw: '__CONV__', type: 'special', byteLen: 4 },
  'SHIFT_9': { display: 'RESET', raw: '__RESET__', type: 'special', byteLen: 5 },
  'SHIFT_DEL': { display: 'INS', raw: '__INS__', type: 'special', byteLen: 1 },
  'SHIFT_AC': { display: 'OFF', raw: '__OFF__', type: 'special', byteLen: 1 },
  'SHIFT_DOT': { display: 'Ran#', raw: '__RANHASH__', type: 'const', byteLen: 4 },
  'SHIFT_0': { display: 'Rnd(', raw: '__RND__(', type: 'func', byteLen: 4 },
  'SHIFT_EXP': { display: 'π', raw: 'π', type: 'const', byteLen: 1 },
  'SHIFT_ANS': { display: '%', raw: '__PERCENT__', type: 'op', byteLen: 1 },
  'SHIFT_EQUALS': { display: '≈', raw: '__APPROX__', type: 'special', byteLen: 1 },
  'SHIFT_STO': { display: 'RCL', raw: '__RCL__', type: 'special', byteLen: 3 },
  'SHIFT_PLUS': { display: 'Pol(', raw: 'pol(', type: 'func', byteLen: 4 },
  'SHIFT_LPAREN': { display: 'Abs(', raw: 'abs(', type: 'func', byteLen: 4 },
  'SHIFT_MINUS': { display: 'Rec(', raw: 'rec(', type: 'func', byteLen: 4 },
  'SHIFT_MULTIPLY': { display: 'P', raw: 'P', type: 'op', byteLen: 1 },
  'SHIFT_DIVIDE': { display: 'C', raw: 'C', type: 'op', byteLen: 1 },
  'SHIFT_4': { display: 'i', raw: '__IMAG_I__', type: 'const', byteLen: 1 },
  'SHIFT_5': { display: '∠', raw: '__ANGLE__', type: 'op', byteLen: 1 },
  'SHIFT_6': { display: '►', raw: '__CONVERT__', type: 'special', byteLen: 1 },
  'SHIFT_1': { display: '<', raw: '__LESS__', type: 'special', byteLen: 1 },
  'SHIFT_2': { display: '=', raw: '__EQ__', type: 'special', byteLen: 1 },
  'SHIFT_3': { display: '≥', raw: '__GE__', type: 'special', byteLen: 1 },

  // ALPHA mappings
  'ALPHA_NEGATION': { display: 'A', raw: '__VAR_A__', type: 'var', byteLen: 1 },
  'ALPHA_DEGREE': { display: 'B', raw: '__VAR_B__', type: 'var', byteLen: 1 },
  'ALPHA_INVERSE': { display: 'C', raw: '__VAR_C__', type: 'var', byteLen: 1 },
  'ALPHA_SIN': { display: 'D', raw: '__VAR_D__', type: 'var', byteLen: 1 },
  'ALPHA_COS': { display: 'E', raw: '__VAR_E__', type: 'var', byteLen: 1 },
  'ALPHA_TAN': { display: 'F', raw: '__VAR_F__', type: 'var', byteLen: 1 },
  'ALPHA_STO': { display: 'M', raw: '__VAR_M__', type: 'var', byteLen: 1 },
  'ALPHA_4': { display: 'Y', raw: '__VAR_Y__', type: 'var', byteLen: 1 },
  'ALPHA_5': { display: 'Z', raw: '__VAR_Z__', type: 'var', byteLen: 1 },
  'ALPHA_ENG': { display: 'i', raw: '__IMAG_I__', type: 'const', byteLen: 1 },
  'ALPHA_LPAREN': { display: 'M', raw: '__VAR_M__', type: 'var', byteLen: 1 },
  'ALPHA_RPAREN': { display: 'N', raw: '__VAR_N__', type: 'var', byteLen: 1 },
  'ALPHA_MPLUS': { display: 'M', raw: '__VAR_M__', type: 'var', byteLen: 1 },
  'ALPHA_DOT': { display: 'RanInt(', raw: '__RANINT__(', type: 'func', byteLen: 7 },
  'ALPHA_EXP': { display: 'e', raw: 'e', type: 'const', byteLen: 1 },
  'ALPHA_ANS': { display: 'PreAns', raw: '__PRANS__', type: 'const', byteLen: 6 },
  'ALPHA_INTEGRAL': { display: ':', raw: '__COLON__', type: 'special', byteLen: 1 },
  'ALPHA_POWER': { display: 'F', raw: '__VAR_F__', type: 'var', byteLen: 1 },
  'ALPHA_SQUARE': { display: 'D', raw: '__VAR_D__', type: 'var', byteLen: 1 },
  'ALPHA_SQRT': { display: 'E', raw: '__VAR_E__', type: 'var', byteLen: 1 },
  'ALPHA_LN': { display: 'F', raw: '__VAR_F__', type: 'var', byteLen: 1 },
  'ALPHA_LOG_BASE': { display: 'B', raw: '__VAR_B__', type: 'var', byteLen: 1 },
  'ALPHA_FRAC': { display: 'C', raw: '__VAR_C__', type: 'var', byteLen: 1 },
  'ALPHA_X_VAR': { display: 'X', raw: '__VAR_X__', type: 'var', byteLen: 1 },
  'ALPHA_7': { display: 'S', raw: '__VAR_S__', type: 'var', byteLen: 1 },
  'ALPHA_8': { display: 'T', raw: '__VAR_T__', type: 'var', byteLen: 1 },
  'ALPHA_9': { display: 'U', raw: '__VAR_U__', type: 'var', byteLen: 1 },
  'ALPHA_DEL': { display: 'W', raw: '__VAR_W__', type: 'var', byteLen: 1 },
  'ALPHA_AC': { display: 'W', raw: '__VAR_W__', type: 'var', byteLen: 1 },
  'ALPHA_0': { display: 'π', raw: 'π', type: 'const', byteLen: 1 },
  'ALPHA_1': { display: '!', raw: 'fact(', type: 'func', byteLen: 3 },
  'ALPHA_2': { display: '#', raw: '__HASH__', type: 'special', byteLen: 1 },
  'ALPHA_3': { display: '$', raw: '__DOLLAR__', type: 'special', byteLen: 1 },
  'ALPHA_PLUS': { display: 'Int(', raw: 'int(', type: 'func', byteLen: 4 },
  'ALPHA_MINUS': { display: 'Intg(', raw: 'intg(', type: 'func', byteLen: 5 },
  'ALPHA_MULTIPLY': { display: 'GCD(', raw: 'gcd(', type: 'func', byteLen: 4 },
  'ALPHA_DIVIDE': { display: 'LCM(', raw: 'lcm(', type: 'func', byteLen: 4 },
};

// ============================================================
// 3. DOM REFERENCES
// ============================================================
const dom = {
  get calc() { return document.getElementById('calculator'); },
  get exprBefore() { return document.getElementById('expr-before-cursor'); },
  get exprAfter() { return document.getElementById('expr-after-cursor'); },
  get cursorEl() { return document.getElementById('cursor-el'); },
  get screenOutput() { return document.getElementById('screen-output'); },
  get errorScreen() { return document.getElementById('error-screen'); },
  get errorTitle() { return document.getElementById('error-title'); },
  get menuScreen() { return document.getElementById('menu-screen'); },
  get menuGrid() { return document.getElementById('menu-grid'); },
  get menuStatusBar() { return document.getElementById('menu-status-bar'); },
  get indShift() { return document.getElementById('ind-shift'); },
  get indAlpha() { return document.getElementById('ind-alpha'); },
  get indM() { return document.getElementById('ind-m'); },
  get indComplex() { return document.getElementById('ind-complex'); },
  get indAngle() { return document.getElementById('ind-angle'); },
  get indFix() { return document.getElementById('ind-fix'); },
  get indDisp() { return document.getElementById('ind-disp'); },
  get indArrowUp() { return document.getElementById('ind-arrow-up'); },
  get indArrowDn() { return document.getElementById('ind-arrow-dn'); },
  get screenInput() { return document.getElementById('screen-input'); },
  get lcd() { return document.getElementById('lcd'); },
  get optnScreen() { return document.getElementById('optn-screen'); },
  get solveScreen() { return document.getElementById('solve-screen'); },
  get mode9Screen() { return document.getElementById('mode9-screen'); },
  get modeAScreen() { return document.getElementById('modeA-screen'); },
};

// ============================================================
// 4. MENU DEFINITIONS
// ============================================================
const MODES = [
  {
    id: 1,
    key: '1',
    isLetter: false,
    name: 'Calculate',
    short: 'COMP',
    iconHTML: `<svg viewBox="0 0 24 16" width="22" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"><path d="M4 8h6M7 5v6M14 6h6M14 10h6"/></svg>`
  },
  {
    id: 2,
    key: '2',
    isLetter: false,
    name: 'Complex',
    short: 'CMPLX',
    iconHTML: `<div class="casio-mode-math-icon"><div class="math-top">a+bi</div><div class="math-bot">i</div></div>`
  },
  {
    id: 3,
    key: '3',
    isLetter: false,
    name: 'Base-N',
    short: 'BASE-N',
    iconHTML: `<div class="casio-mode-math-icon"><div class="math-top">01</div><div class="math-bot">HEX</div></div>`
  },
  {
    id: 4,
    key: '4',
    isLetter: false,
    name: 'Matrix',
    short: 'MAT',
    iconHTML: `<svg viewBox="0 0 24 16" width="22" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2H2v12h2M20 2h2v12h-2"/><rect x="6" y="4" width="3" height="3" fill="currentColor"/><rect x="15" y="4" width="3" height="3" fill="currentColor"/><rect x="6" y="9" width="3" height="3" fill="currentColor"/><rect x="15" y="9" width="3" height="3" fill="currentColor"/></svg>`
  },
  {
    id: 5,
    key: '5',
    isLetter: false,
    name: 'Vector',
    short: 'VCT',
    iconHTML: `<svg viewBox="0 0 24 16" width="24" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14L6 4M6 4L3 7M6 4L9 7"/><path d="M6 14L18 3M18 3L13 4M18 3L17 9"/></svg>`
  },
  {
    id: 6,
    key: '6',
    isLetter: false,
    name: 'Statistics',
    short: 'STAT',
    iconHTML: `<svg viewBox="0 0 24 16" width="24" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 14h20"/><rect x="4" y="6" width="3.5" height="8" fill="currentColor"/><rect x="10.5" y="2" width="3.5" height="12" fill="currentColor"/><rect x="17" y="9" width="3.5" height="5" fill="currentColor"/></svg>`
  },
  {
    id: 7,
    key: '7',
    isLetter: false,
    name: 'Distribution',
    short: 'DIST',
    iconHTML: `<svg viewBox="0 0 24 16" width="24" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 14h20"/><path d="M3 14c3 0 5-1 7-7 1-3 2-4 2-4s1 1 2 4c2 6 4 7 7 7" stroke-width="1.8"/></svg>`
  },
  {
    id: 8,
    key: '8',
    isLetter: false,
    name: 'Spreadsheet',
    short: 'SHEET',
    iconHTML: `<svg viewBox="0 0 24 16" width="24" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="1" width="18" height="14" rx="1"/><path d="M3 6h18M12 1v14"/></svg>`
  },
  {
    id: 9,
    key: '9',
    isLetter: false,
    name: 'Equation/Func',
    short: 'EQN',
    iconHTML: `<div class="casio-mode-math-icon"><div class="math-top">xy</div><div class="math-bot">= 0</div></div>`
  },
  {
    id: 10,
    key: 'A',
    isLetter: true,
    name: 'Inequality',
    short: 'INEQ',
    iconHTML: `<div class="casio-mode-math-icon"><div class="math-top">xy</div><div class="math-bot">&gt; 0</div></div>`
  },
  {
    id: 11,
    key: 'B',
    isLetter: true,
    name: 'Ratio',
    short: 'RATIO',
    iconHTML: `<svg viewBox="0 0 24 16" width="24" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M12 2v12M8 14h8"/><path d="M4 5l8-1 8 1"/><path d="M4 5l-2 5h4zM20 5l-2 5h4z" fill="currentColor"/></svg>`
  },
  {
    id: 12,
    key: 'C',
    isLetter: true,
    name: 'Table',
    short: 'TABLE',
    iconHTML: `<svg viewBox="0 0 24 16" width="24" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="7" height="8"/><circle cx="12" cy="6.5" r="1" fill="currentColor"/><circle cx="12" cy="9.5" r="1" fill="currentColor"/><rect x="14" y="4" width="7" height="8"/></svg>`
  }
];

// ============================================================
// 5. RENDERING ENGINE
// ============================================================
function renderAll() {
  if (State.isPowerOff) {
    if (dom.lcd) dom.lcd.style.opacity = '0';
    return;
  }
  if (dom.lcd) dom.lcd.style.opacity = '1';

  renderStatusBar();

  // Mode 9 overlay handling
  if (dom.mode9Screen) {
    const isMode9Active = (State.mode === 9 && !State.inMenu);
    dom.mode9Screen.classList.toggle('active', isMode9Active);
    if (isMode9Active) {
      renderMode9Screen();
      return;
    }
  }

  // Mode A (Inequality) overlay handling
  if (dom.modeAScreen) {
    const isModeAActive = (State.mode === 10 && !State.inMenu);
    dom.modeAScreen.classList.toggle('active', isModeAActive);
    if (isModeAActive) {
      renderModeAScreen();
      return;
    }
  }

  if (dom.optnScreen) {
    dom.optnScreen.classList.toggle('active', !!State.inOptnMenu);
    if (State.inOptnMenu) {
      renderOptnScreen();
    }
  }

  const solveEl = dom.solveScreen;
  if (solveEl) {
    solveEl.classList.toggle('active', !!State.inSolveResult);
    if (State.inSolveResult) {
      document.getElementById('solve-eq').textContent = State.solveEqStr;
      document.getElementById('solve-val').textContent = State.solveValStr;
      document.getElementById('solve-diff').textContent = State.solveDiffStr;
      return;
    }
  }

  if (State.inMenu) {
    renderMenuScreen();
  } else {
    renderExpression();
    renderOutput();
    renderError();
  }
}

function renderStatusBar() {
  dom.indShift.classList.toggle('active', State.isShift);
  dom.indAlpha.classList.toggle('active', State.isAlpha);
  dom.indM.classList.toggle('active', State.vars.M !== 0);
  if (dom.indComplex) {
    dom.indComplex.classList.toggle('active', State.mode === 2);
  }
  
  const indBase = document.getElementById('ind-base');
  if (indBase) {
    if (State.mode === 3) {
      indBase.classList.add('active');
      const baseCharMap = { 'DEC': 'd', 'HEX': 'h', 'BIN': 'b', 'OCT': 'o' };
      indBase.textContent = baseCharMap[State.baseSystem || 'DEC'];
      dom.indAngle.classList.remove('active');
    } else {
      indBase.classList.remove('active');
      dom.indAngle.textContent = State.settings.angle;
      dom.indAngle.classList.add('active');
    }
  } else {
    dom.indAngle.textContent = State.settings.angle;
    dom.indAngle.classList.add('active');
  }

  dom.calc.classList.toggle('shift-active', State.isShift);
  dom.calc.classList.toggle('alpha-active', State.isAlpha);

  if (State.settings.format !== 'Norm' && State.mode !== 3) {
    dom.indFix.textContent = State.settings.format + ' ' + State.settings.formatN;
    dom.indFix.classList.add('active');
  } else {
    dom.indFix.classList.remove('active');
  }

  dom.indArrowUp.classList.toggle('active', State.historyIdx > -1 && State.historyIdx < State.history.length - 1);
  dom.indArrowDn.classList.toggle('active', State.historyIdx > 0);
}

function renderExpression() {
  dom.errorScreen.classList.remove('active');
  dom.menuScreen.classList.remove('active');

  const hasActiveTemplate = State.activeTemplatePath && State.activeTemplatePath.length > 0;
  
  if (State.inSolvePrompt) {
    dom.cursorEl.style.display = 'none';
    dom.exprBefore.innerHTML = 'Solve for X';
    dom.exprAfter.innerHTML = '';
    return;
  }

  if (State.inCalcPrompt) {
    dom.cursorEl.style.display = 'none';
    dom.exprBefore.innerHTML = tokensToHTML(State.tokens);
    dom.exprAfter.innerHTML = '';
    return;
  }

  // When inside a template (editing), hide normal cursor and render full token HTML
  if (hasActiveTemplate && !State.hasResult) {
    dom.cursorEl.style.display = 'none';
    dom.exprBefore.innerHTML = tokensToHTML(State.tokens);
    dom.exprAfter.innerHTML = '';
  } else {
    dom.cursorEl.style.display = 'inline-block';
    const beforeTokens = State.tokens.slice(0, State.cursorIdx);
    const afterTokens = State.tokens.slice(State.cursorIdx);
    dom.exprBefore.innerHTML = tokensToHTML(beforeTokens);
    dom.exprAfter.innerHTML = tokensToHTML(afterTokens);

    if (State.isInsert) {
      dom.cursorEl.className = 'cursor-blink overwrite';
    } else if (totalBytes(State.tokens) >= 90) {
      dom.cursorEl.className = 'cursor-blink warning';
    } else {
      dom.cursorEl.className = 'cursor-blink';
    }
  }
}

function tokensToHTML(tokens, parentPath = []) {
  return tokens.map((t, idx) => {
    if (t.type === 'template') {
      const currentPath = [...parentPath, t];
      
      const isActiveTemplate = State.activeTemplatePath && State.activeTemplatePath.includes(t);
      const isLeafActive = isActiveTemplate && State.activeTemplatePath[State.activeTemplatePath.length - 1] === t;
      
      const renderSubExpr = (key) => {
        const subTokens = t.subExprs[key] || [];
        const isSubActive = isLeafActive && t.activeSubExpr === key;
        
        let html = '';
        if (isSubActive) {
          const before = subTokens.slice(0, t.cursorIdx);
          const after = subTokens.slice(t.cursorIdx);
          const cursorClass = State.isInsert ? 'cursor-blink overwrite' : 'cursor-blink';
          html = tokensToHTML(before, currentPath) + `<span id="cursor-el" class="${cursorClass}"></span>` + tokensToHTML(after, currentPath);
        } else {
          html = tokensToHTML(subTokens, currentPath);
        }
        
        if (html === '') {
          return `<span class="template-box-placeholder">■</span>`;
        }
        return html;
      };

      const formulaHTML = renderSubExpr('formula');
      
      if (t.templateType === 'integral') {
        const lowerHTML = renderSubExpr('lower');
        const upperHTML = renderSubExpr('upper');
        return `
          <span class="math-template template-integral">
            <span class="integral-limits">
              <span class="limit-upper">${upperHTML}</span>
              <span class="limit-lower">${lowerHTML}</span>
            </span>
            <span class="integral-symbol">∫</span>
            <span class="integral-body">(${formulaHTML})dx</span>
          </span>
        `;
      } else if (t.templateType === 'derivative') {
        const targetXHTML = renderSubExpr('targetX');
        return `
          <span class="math-template template-derivative">
            <span class="derivative-fraction">
              <span class="derivative-top">d</span>
              <span class="derivative-bottom">dX</span>
            </span>
            <span class="integral-body">(${formulaHTML})</span>
            <span class="derivative-eval">
              <span class="derivative-eval-bar">|</span>
              <span class="derivative-eval-point">X=${targetXHTML}</span>
            </span>
          </span>
        `;
      } else if (t.templateType === 'summation') {
        const lowerHTML = renderSubExpr('lower');
        const upperHTML = renderSubExpr('upper');
        return `
          <span class="math-template template-summation">
            <span class="summation-left">
              <span class="summation-upper">${upperHTML}</span>
              <span class="summation-symbol">Σ</span>
              <span class="summation-lower">X=${lowerHTML}</span>
            </span>
            <span class="integral-body">(${formulaHTML})</span>
          </span>
        `;
      } else if (t.templateType === 'fraction') {
        const numHTML = renderSubExpr('num');
        const denHTML = renderSubExpr('den');
        return `
          <span class="math-template template-fraction">
            <span class="fraction-col">
              <span class="fraction-top">${numHTML}</span>
              <span class="fraction-bottom">${denHTML}</span>
            </span>
          </span>
        `;
      } else if (t.templateType === 'mixedFraction') {
        const wholeHTML = renderSubExpr('whole');
        const numHTML = renderSubExpr('num');
        const denHTML = renderSubExpr('den');
        return `
          <span class="math-template template-mixed-fraction">
            <span class="mixed-whole">${wholeHTML}</span>
            <span class="fraction-col">
              <span class="fraction-top">${numHTML}</span>
              <span class="fraction-bottom">${denHTML}</span>
            </span>
          </span>
        `;
      }
    }
    return t.display;
  }).join('');
}

function renderOutput() {
  if (State.inCalcPrompt) {
    if (State.calcTokens.length === 0) {
      dom.screenOutput.innerHTML = `X?<span class="cursor-blink"></span><span style="float: right;">${formatResult(State.vars.X)}</span>`;
    } else {
      const hasActiveTemplate = State.activeTemplatePath && State.activeTemplatePath.length > 0;
      if (hasActiveTemplate) {
        dom.screenOutput.innerHTML = `X?${tokensToHTML(State.calcTokens)}`;
      } else {
        const beforeTokens = State.calcTokens.slice(0, State.calcCursorIdx);
        const afterTokens = State.calcTokens.slice(State.calcCursorIdx);
        dom.screenOutput.innerHTML = `X?${tokensToHTML(beforeTokens)}<span class="cursor-blink"></span>${tokensToHTML(afterTokens)}`;
      }
    }
    dom.screenOutput.style.display = 'block';
    return;
  }

  if (State.inSolvePrompt) {
    if (State.solveTokens.length === 0) {
      dom.screenOutput.innerHTML = `<span class="cursor-blink"></span><span style="float: right;">${formatResult(State.vars.X)}</span>`;
    } else {
      const hasActiveTemplate = State.activeTemplatePath && State.activeTemplatePath.length > 0;
      if (hasActiveTemplate) {
        dom.screenOutput.innerHTML = tokensToHTML(State.solveTokens);
      } else {
        const beforeTokens = State.solveTokens.slice(0, State.solveCursorIdx);
        const afterTokens = State.solveTokens.slice(State.solveCursorIdx);
        dom.screenOutput.innerHTML = `${tokensToHTML(beforeTokens)}<span class="cursor-blink"></span>${tokensToHTML(afterTokens)}`;
      }
    }
    dom.screenOutput.style.display = 'block';
    return;
  }

  if (State.sdDisplayOverride) {
    dom.screenOutput.textContent = State.sdDisplayOverride;
    dom.screenOutput.style.display = 'block';
    return;
  }

  if (State.hasResult && State.Ans !== null && State.Ans !== undefined) {
    dom.screenOutput.textContent = formatResult(State.Ans);
    dom.screenOutput.style.display = 'block';
  } else {
    dom.screenOutput.textContent = '';
  }
}

function renderError() {
  if (State.errorState) {
    dom.errorTitle.textContent = State.errorState.type + ' ERROR';
    dom.errorScreen.classList.add('active');
  }
}

function renderMenuScreen() {
  dom.menuScreen.classList.add('active');
  dom.errorScreen.classList.remove('active');
  dom.menuGrid.innerHTML = '';

  // 2-row paginated view (4 items per row, 8 items visible)
  // Row 0: Modes 1..4 (0..3)
  // Row 1: Modes 5..8 (4..7)
  // Row 2: Modes 9..C (8..11)
  const isScrolledDown = State.menuCursor >= 8;
  const startIdx = isScrolledDown ? 4 : 0;
  const endIdx = startIdx + 8;

  const scrollInd = document.getElementById('menu-scroll-ind');
  if (scrollInd) {
    scrollInd.textContent = isScrolledDown ? '▲' : '▼';
  }

  for (let i = startIdx; i < endIdx; i++) {
    const m = MODES[i];
    if (!m) continue;
    const isSelected = (i === State.menuCursor);
    const cell = document.createElement('div');
    cell.className = 'menu-cell' + (isSelected ? ' selected' : '');
    cell.innerHTML = `
      <div class="menu-cell-icon">${m.iconHTML}</div>
      <div class="menu-cell-key ${m.isLetter ? 'letter-badge' : ''}">${m.key}</div>
    `;
    cell.addEventListener('click', () => { selectMode(i); });
    dom.menuGrid.appendChild(cell);
  }

  const selectedMode = MODES[State.menuCursor];
  if (selectedMode) {
    dom.menuStatusBar.textContent = `${selectedMode.key}:${selectedMode.name}`;
  }
}

// ============================================================
// 6. MATH EVALUATOR (RECURSIVE TEMPLATES ENGINE)
// ============================================================
function evaluateExpression(tokens) {
  let cloned = JSON.parse(JSON.stringify(tokens));
  for (let i = 0; i < cloned.length; i++) {
    if (cloned[i].type === 'template') {
      const result = evaluateTemplate(cloned[i]);
      let resRaw;
      if (result instanceof Complex || (result && typeof result === 'object' && 're' in result)) {
        const z = toComplex(result);
        // Serialize complex as (re+im*__IMAG_I__) for re-tokenization
        resRaw = `(${z.re}${z.im >= 0 ? '+' : ''}${z.im}*__IMAG_I__)`;
      } else {
        resRaw = (typeof result === 'number' && result < 0) ? `(0-${Math.abs(result)})` : String(result);
      }
      cloned[i] = {
        display: String(result),
        raw: resRaw,
        type: 'num',
        byteLen: 1
      };
    }
  }
  return evaluate(cloned);
}

function evaluateTemplate(temp) {
  if (temp.templateType === 'integral') {
    if (!temp.subExprs.formula || temp.subExprs.formula.length === 0) throw { type: 'Syntax', msg: 'Missing formula' };
    if (!temp.subExprs.lower  || temp.subExprs.lower.length  === 0) throw { type: 'Syntax', msg: 'Missing lower' };
    if (!temp.subExprs.upper  || temp.subExprs.upper.length  === 0) throw { type: 'Syntax', msg: 'Missing upper' };
    const a = evaluateExpression(temp.subExprs.lower);
    const b = evaluateExpression(temp.subExprs.upper);
    return runIntegration(temp.subExprs.formula, a, b);
  } else if (temp.templateType === 'derivative') {
    if (!temp.subExprs.formula || temp.subExprs.formula.length === 0) throw { type: 'Syntax', msg: 'Missing formula' };
    if (!temp.subExprs.targetX || temp.subExprs.targetX.length === 0) throw { type: 'Syntax', msg: 'Missing X' };
    const a = evaluateExpression(temp.subExprs.targetX);
    return runDerivative(temp.subExprs.formula, a);
  } else if (temp.templateType === 'summation') {
    if (!temp.subExprs.formula || temp.subExprs.formula.length === 0) throw { type: 'Syntax', msg: 'Missing formula' };
    if (!temp.subExprs.lower  || temp.subExprs.lower.length  === 0) throw { type: 'Syntax', msg: 'Missing lower' };
    if (!temp.subExprs.upper  || temp.subExprs.upper.length  === 0) throw { type: 'Syntax', msg: 'Missing upper' };
    const a = evaluateExpression(temp.subExprs.lower);
    const b = evaluateExpression(temp.subExprs.upper);
    return runSummation(temp.subExprs.formula, a, b);
  } else if (temp.templateType === 'fraction') {
    if (!temp.subExprs.num || temp.subExprs.num.length === 0) throw { type: 'Syntax', msg: 'Missing numerator' };
    if (!temp.subExprs.den || temp.subExprs.den.length === 0) throw { type: 'Syntax', msg: 'Missing denominator' };
    const n = evaluateExpression(temp.subExprs.num);
    const d = evaluateExpression(temp.subExprs.den);
    if (d === 0) throw { type: 'Math', msg: 'Math ERROR' };
    return n / d;
  } else if (temp.templateType === 'mixedFraction') {
    if (!temp.subExprs.whole || temp.subExprs.whole.length === 0) throw { type: 'Syntax', msg: 'Missing whole' };
    if (!temp.subExprs.num || temp.subExprs.num.length === 0) throw { type: 'Syntax', msg: 'Missing numerator' };
    if (!temp.subExprs.den || temp.subExprs.den.length === 0) throw { type: 'Syntax', msg: 'Missing denominator' };
    const w = evaluateExpression(temp.subExprs.whole);
    const n = evaluateExpression(temp.subExprs.num);
    const d = evaluateExpression(temp.subExprs.den);
    if (d === 0) throw { type: 'Math', msg: 'Math ERROR' };
    const wSign = (w < 0 || (w === 0 && 1/w < 0)) ? -1 : 1;
    return wSign * (Math.abs(w) + n / d);
  }
  throw { type: 'Math', msg: 'Unknown template' };
}

function evalFormulaAtX(formula, xVal) {
  const prevX = State.vars.X;
  State.vars.X = xVal;
  try {
    const res = evaluateExpression(formula);
    State.vars.X = prevX;
    return res;
  } catch (e) {
    State.vars.X = prevX;
    throw e;
  }
}

function runIntegration(formula, a, b) {
  const f = (x) => evalFormulaAtX(formula, x);
  
  function adaptiveSimpson(f, a, b, tol, whole, fa, fb, fm, depth) {
    if (depth > 20) return whole;
    const m = (a + b) / 2;
    const h = (b - a) / 2;
    const lm = (a + m) / 2;
    const rm = (m + b) / 2;
    const flm = f(lm);
    const frm = f(rm);
    
    const left = (h / 6) * (fa + 4 * flm + fm);
    const right = (h / 6) * (fm + 4 * frm + fb);
    const delta = left + right - whole;
    
    if (Math.abs(delta) <= 15 * tol) {
      return left + right + delta / 15;
    }
    return adaptiveSimpson(f, a, m, tol / 2, left, fa, fm, flm, depth + 1) +
           adaptiveSimpson(f, m, b, tol / 2, right, fm, fb, frm, depth + 1);
  }
  
  const fa = f(a);
  const fb = f(b);
  const m = (a + b) / 2;
  const fm = f(m);
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb);
  
  return adaptiveSimpson(f, a, b, 1e-7, whole, fa, fb, fm, 0);
}

function runDerivative(formula, a) {
  const f = (x) => evalFormulaAtX(formula, x);
  const h = 1e-5;
  const f_2h = f(a + 2 * h);
  const f_h  = f(a + h);
  const f_mh = f(a - h);
  const f_2mh = f(a - 2 * h);
  
  return (-f_2h + 8 * f_h - 8 * f_mh + f_2mh) / (12 * h);
}

function runSummation(formula, a, b) {
  const start = Math.round(a);
  const end = Math.round(b);
  if (isNaN(start) || isNaN(end)) throw { type: 'Math', msg: 'Domain' };
  if (end < start) return 0;
  
  if (end - start > 1000) {
    throw { type: 'Math', msg: 'Time Out' };
  }
  
  let sum = 0;
  for (let x = start; x <= end; x++) {
    sum += evalFormulaAtX(formula, x);
  }
  return sum;
}

function buildRawString(tokens) {
  let str = '';
  for (const t of tokens) {
    if (t.type === 'template') {
      if (t.templateType === 'fraction') {
        const numStr = buildRawString(t.subExprs.num);
        const denStr = buildRawString(t.subExprs.den);
        str += `(${numStr})/(${denStr})`;
      } else if (t.templateType === 'mixedFraction') {
        const wholeStr = buildRawString(t.subExprs.whole);
        const numStr = buildRawString(t.subExprs.num);
        const denStr = buildRawString(t.subExprs.den);
        str += `(${wholeStr}+(${numStr})/(${denStr}))`;
      } else if (t.templateType === 'integral') {
        // Need specific handling if integrals are converted to raw text.
        // For now, integrals are evaluated differently. 
        // We'll leave it or format as integral(formula, lower, upper)
        const fStr = buildRawString(t.subExprs.formula);
        const lStr = buildRawString(t.subExprs.lower);
        const uStr = buildRawString(t.subExprs.upper);
        str += `integral(${fStr},${lStr},${uStr})`;
      } else if (t.templateType === 'derivative') {
        const fStr = buildRawString(t.subExprs.formula);
        const xStr = buildRawString(t.subExprs.targetX);
        str += `derivative(${fStr},${xStr})`;
      } else if (t.templateType === 'summation') {
        const fStr = buildRawString(t.subExprs.formula);
        const lStr = buildRawString(t.subExprs.lower);
        const uStr = buildRawString(t.subExprs.upper);
        str += `summation(${fStr},${lStr},${uStr})`;
      }
    } else {
      str += t.raw || '';
    }
  }
  return str;
}

function tokenize(raw) {
  const tokens = [];
  let i = 0;

  if (State.mode === 3) {
    while (i < raw.length) {
      if (raw[i] === ' ') { i++; continue; }

      let numRegex;
      if (State.baseSystem === 'HEX') numRegex = /^[0-9a-fA-F]+/;
      else if (State.baseSystem === 'DEC') numRegex = /^[0-9]+/;
      else if (State.baseSystem === 'OCT') numRegex = /^[0-7]+/;
      else if (State.baseSystem === 'BIN') numRegex = /^[0-1]+/;

      const rest = raw.slice(i);
      const numMatch = rest.match(numRegex);
      if (numMatch) {
        const numStr = numMatch[0];
        const base = State.baseSystem === 'HEX' ? 16 : State.baseSystem === 'DEC' ? 10 : State.baseSystem === 'OCT' ? 8 : 2;
        const val = parseInt(numStr, base);
        tokens.push({ type: 'NUM', val: val });
        i += numStr.length;
        continue;
      }

      let matched = false;
      const baseFuncMap = [
        ['__NOT__(', null, 'FUNC', 'not'],
        ['__NEG__(', null, 'FUNC', 'neg'],
        ['__ANS__', () => State.Ans],
      ];

      for (const entry of baseFuncMap) {
        const [pattern, getter, tokenType, fname] = entry;
        if (rest.startsWith(pattern)) {
          if (getter) {
            tokens.push({ type: 'NUM', val: getter() });
          } else if (tokenType === 'FUNC') {
            tokens.push({ type: 'FUNC', name: fname });
            tokens.push({ type: 'LPAREN' });
          }
          i += pattern.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      // Operators
      if (raw[i] === '+' || raw[i] === '-') {
        const isUnary = tokens.length === 0 || 
                        ['OP', 'UNARY_OP', 'LPAREN', 'COMMA', 'FUNC'].includes(tokens[tokens.length - 1].type);
        if (isUnary) {
          tokens.push({ type: 'UNARY_OP', op: 'u' + raw[i], prec: 4, rightAssoc: true });
        } else {
          tokens.push({ type: 'OP', op: raw[i], prec: 1 });
        }
        i++;
        continue;
      }

      const opMap = {
        '*': { type: 'OP', op: '*', prec: 2 },
        '/': { type: 'OP', op: '/', prec: 2 },
      };
      if (opMap[raw[i]]) {
        tokens.push(opMap[raw[i]]);
        i++;
        continue;
      }

      if (rest.startsWith('__AND__')) {
        tokens.push({ type: 'OP', op: 'And', prec: 0.7 });
        i += 7;
        continue;
      }
      if (rest.startsWith('__OR__')) {
        tokens.push({ type: 'OP', op: 'Or', prec: 0.5 });
        i += 6;
        continue;
      }
      if (rest.startsWith('__XOR__')) {
        tokens.push({ type: 'OP', op: 'Xor', prec: 0.6 });
        i += 7;
        continue;
      }
      if (rest.startsWith('__XNOR__')) {
        tokens.push({ type: 'OP', op: 'Xnor', prec: 0.6 });
        i += 8;
        continue;
      }

      if (raw[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
      if (raw[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }

      i++;
    }
    return tokens;
  }

  while (i < raw.length) {
    if (raw[i] === ' ') { i++; continue; }

    if (/[0-9.]/.test(raw[i])) {
      let num = '';
      while (i < raw.length && /[0-9.eE+\-]/.test(raw[i])) {
        if ((raw[i] === '+' || raw[i] === '-') && !/[eE]/.test(raw[i - 1])) break;
        num += raw[i++];
      }
      tokens.push({ type: 'NUM', val: parseFloat(num) });
      continue;
    }

    const rest = raw.slice(i);
    let matched = false;

    const funcMap = [
      ['__PRANS__', () => State.PreAns],
      ['__ANS__', () => State.Ans],
      ['__VAR_A__', () => State.vars.A],
      ['__VAR_B__', () => State.vars.B],
      ['__VAR_C__', () => State.vars.C],
      ['__VAR_D__', () => State.vars.D],
      ['__VAR_E__', () => State.vars.E],
      ['__VAR_F__', () => State.vars.F],
      ['__VAR_M__', () => State.vars.M],
      ['__VAR_X__', () => State.vars.X],
      ['__VAR_Y__', () => State.vars.Y],
      ['__VAR_Z__', () => State.vars.Z],
      ['__VAR_S__', () => State.vars.S || 0],
      ['__VAR_T__', () => State.vars.T || 0],
      ['__VAR_U__', () => State.vars.U || 0],
      ['__VAR_W__', () => State.vars.W || 0],
      ['__VAR_N__', () => State.vars.N || 0],
      ['__RANINT__(', null, 'FUNC', 'RanInt'],
      ['__RND__(', null, 'FUNC', 'Rnd'],
      ['__RANHASH__', () => Math.floor(Math.random() * 1001) / 1000],
      ['__PERCENT__', null, 'PERCENT'],
      ['__IMAG_I__', () => { if (State.mode === 2) return new Complex(0, 1); throw { type: 'Math', msg: 'Complex not supported in COMP' }; }],
      ['Arg(', null, 'FUNC', 'Arg'],
      ['Conjg(', null, 'FUNC', 'Conjg'],
      ['ReP(', null, 'FUNC', 'ReP'],
      ['ImP(', null, 'FUNC', 'ImP'],
      ['asin(', null, 'FUNC', 'asin'],
      ['acos(', null, 'FUNC', 'acos'],
      ['atan(', null, 'FUNC', 'atan'],
      ['sinh(', null, 'FUNC', 'sinh'],
      ['cosh(', null, 'FUNC', 'cosh'],
      ['tanh(', null, 'FUNC', 'tanh'],
      ['asinh(', null, 'FUNC', 'asinh'],
      ['acosh(', null, 'FUNC', 'acosh'],
      ['atanh(', null, 'FUNC', 'atanh'],
      ['sin(', null, 'FUNC', 'sin'],
      ['cos(', null, 'FUNC', 'cos'],
      ['tan(', null, 'FUNC', 'tan'],
      ['sqrt(', null, 'FUNC', 'sqrt'],
      ['cbrt(', null, 'FUNC', 'cbrt'],
      ['abs(', null, 'FUNC', 'abs'],
      ['ln(', null, 'FUNC', 'ln'],
      ['log(', null, 'FUNC', 'log'],
      ['exp(', null, 'FUNC', 'exp'],
      ['fact(', null, 'FUNC', 'fact'],
      ['pow10(', null, 'FUNC', 'pow10'],
      ['integral(', null, 'FUNC', 'integral'],
      ['gcd(', null, 'FUNC', 'gcd'],
      ['lcm(', null, 'FUNC', 'lcm'],
      ['pol(', null, 'FUNC', 'pol'],
      ['rec(', null, 'FUNC', 'rec'],
      ['intg(', null, 'FUNC', 'intg'],
      ['int(', null, 'FUNC', 'int'],
      ['π', null, 'PI'],
      ['e', null, 'EULER'],
      ['__XROOT__', null, 'XROOT'],
    ];

    for (const entry of funcMap) {
      const [pattern, getter, tokenType, fname] = entry;
      if (rest.startsWith(pattern)) {
        if (getter) {
          tokens.push({ type: 'NUM', val: getter() });
        } else if (tokenType === 'FUNC') {
          tokens.push({ type: 'FUNC', name: fname });
          tokens.push({ type: 'LPAREN' });
        } else if (tokenType === 'PI') {
          tokens.push({ type: 'NUM', val: Math.PI });
        } else if (tokenType === 'EULER') {
          tokens.push({ type: 'NUM', val: Math.E });
        } else if (tokenType === 'XROOT') {
          tokens.push({ type: 'OP', op: '__xroot__', prec: 7, rightAssoc: true });
        } else if (tokenType === 'PERCENT') {
          tokens.push({ type: 'OP', op: '__percent__', prec: 8, rightAssoc: false });
        }
        i += pattern.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    if (raw[i] === '+' || raw[i] === '-') {
      const isUnary = tokens.length === 0 || 
                      ['OP', 'UNARY_OP', 'LPAREN', 'COMMA', 'FUNC'].includes(tokens[tokens.length - 1].type);
      if (isUnary) {
        tokens.push({ type: 'UNARY_OP', op: 'u' + raw[i], prec: 4, rightAssoc: true });
      } else {
        tokens.push({ type: 'OP', op: raw[i], prec: 1 });
      }
      i++;
      continue;
    }

    const opMap = {
      '*': { type: 'OP', op: '*', prec: 2 },
      '/': { type: 'OP', op: '/', prec: 2 },
      '^': { type: 'OP', op: '^', prec: 3, rightAssoc: true },
      'P': { type: 'OP', op: 'nPr', prec: 2 },
      'C': { type: 'OP', op: 'nCr', prec: 2 },
    };
    if (opMap[raw[i]]) {
      tokens.push(opMap[raw[i]]);
      i++;
      continue;
    }
    if (raw[i] === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
    if (raw[i] === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }
    if (raw[i] === ',') { tokens.push({ type: 'COMMA' }); i++; continue; }

    i++;
  }
  return tokens;
}

function toRPN(tokens) {
  const out = [];
  const ops = [];

  const popOp = () => {
    const op = ops.pop();
    out.push(op);
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'NUM') {
      out.push(tok);
    } else if (tok.type === 'FUNC') {
      ops.push(tok);
    } else if (tok.type === 'COMMA') {
      while (ops.length && ops[ops.length - 1].type !== 'LPAREN') popOp();
    } else if (tok.type === 'OP' || tok.type === 'UNARY_OP') {
      while (
        ops.length &&
        (ops[ops.length - 1].type === 'OP' || ops[ops.length - 1].type === 'UNARY_OP') &&
        (
          (!tok.rightAssoc && ops[ops.length - 1].prec >= tok.prec) ||
          (tok.rightAssoc && ops[ops.length - 1].prec > tok.prec)
        )
      ) popOp();
      ops.push(tok);
    } else if (tok.type === 'LPAREN') {
      ops.push(tok);
    } else if (tok.type === 'RPAREN') {
      while (ops.length && ops[ops.length - 1].type !== 'LPAREN') popOp();
      if (!ops.length) throw { type: 'Syntax', msg: 'Mismatched parentheses' };
      ops.pop();
      if (ops.length && ops[ops.length - 1].type === 'FUNC') popOp();
    }
  }
  while (ops.length) {
    if (ops[ops.length - 1].type === 'LPAREN') throw { type: 'Syntax', msg: 'Mismatched parentheses' };
    popOp();
  }
  return out;
}

function evalRPN(rpn, angleUnit) {
  if (State.mode === 3) {
    const stack = [];
    const checkOverflow = (val) => {
      if (val < -2147483648 || val > 2147483647) {
        throw { type: 'Overflow', msg: 'Overflow Error' };
      }
    };
    
    for (const tok of rpn) {
      if (tok.type === 'NUM') {
        if (tok.val < -2147483648 || tok.val > 2147483648) {
          throw { type: 'Overflow', msg: 'Overflow Error' };
        }
        stack.push(tok.val);
      } else if (tok.type === 'UNARY_OP') {
        const a = stack.pop();
        if (a === undefined) throw { type: 'Syntax', msg: 'Invalid expression' };
        if (tok.op === 'u-') {
          const res = -a;
          checkOverflow(res);
          stack.push(res);
        } else {
          stack.push(a);
        }
      } else if (tok.type === 'OP') {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) throw { type: 'Syntax', msg: 'Invalid expression' };
        let res;
        switch (tok.op) {
          case '+':
            res = a + b;
            break;
          case '-':
            res = a - b;
            break;
          case '*':
            res = a * b;
            break;
          case '/':
            if (b === 0) throw { type: 'Math', msg: 'Division by zero' };
            res = Math.trunc(a / b);
            break;
          case 'And':
            res = a & b;
            break;
          case 'Or':
            res = a | b;
            break;
          case 'Xor':
            res = a ^ b;
            break;
          case 'Xnor':
            res = ~(a ^ b);
            break;
          default:
            throw { type: 'Syntax', msg: 'Unknown operator' };
        }
        checkOverflow(res);
        stack.push(res);
      } else if (tok.type === 'FUNC') {
        const x = stack.pop();
        if (x === undefined) throw { type: 'Syntax', msg: 'Missing argument' };
        let res;
        switch (tok.name) {
          case 'not':
            res = ~x;
            break;
          case 'neg':
            res = -x;
            break;
          default:
            throw { type: 'Syntax', msg: 'Unknown function' };
        }
        checkOverflow(res);
        stack.push(res);
      }
    }
    
    if (stack.length !== 1) throw { type: 'Syntax', msg: 'Invalid expression' };
    const finalVal = stack[0];
    if (finalVal < -2147483648 || finalVal > 2147483647) {
      throw { type: 'Overflow', msg: 'Overflow Error' };
    }
    return finalVal;
  }

  const stack = [];

  const toRad = (v) => {
    if (State.mode === 2) {
      const z = toComplex(v);
      if (z.im !== 0) throw { type: 'Math', msg: 'Domain ERROR' };
      let r = z.re;
      if (angleUnit === 'D') r = r * Math.PI / 180;
      if (angleUnit === 'G') r = r * Math.PI / 200;
      return r;
    }
    if (angleUnit === 'D') return v * Math.PI / 180;
    if (angleUnit === 'G') return v * Math.PI / 200;
    return v;
  };
  const fromRad = (v) => {
    let r = v;
    if (angleUnit === 'D') r = r * 180 / Math.PI;
    if (angleUnit === 'G') r = r * 200 / Math.PI;
    return r;
  };

  const factorial = (n) => {
    if (n < 0) throw { type: 'Math', msg: 'Negative factorial' };
    if (!Number.isInteger(n)) throw { type: 'Math', msg: 'Non-integer factorial' };
    if (n > 69) throw { type: 'Math', msg: 'Overflow' };
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  };

  const gcd = (a, b) => { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) { [a, b] = [b, a % b]; } return a; };
  const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);
  const nPr = (n, r) => factorial(n) / factorial(n - r);
  const nCr = (n, r) => factorial(n) / (factorial(r) * factorial(n - r));

  for (const tok of rpn) {
    if (tok.type === 'NUM') {
      stack.push(State.mode === 2 ? toComplex(tok.val) : tok.val);
    } else if (tok.type === 'UNARY_OP') {
      const a = stack.pop();
      if (a === undefined) throw { type: 'Syntax', msg: 'Invalid expression' };
      if (tok.op === 'u-') {
        stack.push(State.mode === 2 ? toComplex(a).neg() : -a);
      } else {
        stack.push(a);
      }
    } else if (tok.type === 'OP') {
      if (tok.op === '__percent__') {
        const a = stack.pop();
        if (a === undefined) throw { type: 'Syntax', msg: '' };
        if (State.mode === 2) {
          stack.push(toComplex(a).div(100));
        } else {
          stack.push(a / 100);
        }
      } else if (tok.op === '__xroot__') {
        const exp = stack.pop();
        const base = stack.pop();
        if (State.mode === 2) {
          stack.push(toComplex(base).pow(toComplex(1).div(toComplex(exp))));
        } else {
          if (base < 0 && !Number.isInteger(1 / exp)) throw { type: 'Math', msg: 'Domain' };
          stack.push(Math.pow(base, 1 / exp));
        }
      } else {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) throw { type: 'Syntax', msg: '' };
        if (State.mode === 2) {
          const ca = toComplex(a);
          const cb = toComplex(b);
          switch (tok.op) {
            case '+': stack.push(ca.add(cb)); break;
            case '-': stack.push(ca.sub(cb)); break;
            case '*': stack.push(ca.mul(cb)); break;
            case '/': stack.push(ca.div(cb)); break;
            case '^': stack.push(ca.pow(cb)); break;
            case 'nPr': stack.push(new Complex(nPr(checkRealInt(ca), checkRealInt(cb)), 0)); break;
            case 'nCr': stack.push(new Complex(nCr(checkRealInt(ca), checkRealInt(cb)), 0)); break;
            default: throw { type: 'Syntax', msg: 'Unknown op: ' + tok.op };
          }
        } else {
          switch (tok.op) {
            case '+': stack.push(a + b); break;
            case '-': stack.push(a - b); break;
            case '*': stack.push(a * b); break;
            case '/':
              if (b === 0) throw { type: 'Math', msg: 'Division by zero' };
              stack.push(a / b);
              break;
            case '^':
              if (a < 0 && !Number.isInteger(b)) throw { type: 'Math', msg: 'Domain' };
              stack.push(Math.pow(a, b));
              break;
            case 'nPr':
              stack.push(nPr(a, b));
              break;
            case 'nCr':
              stack.push(nCr(a, b));
              break;
          }
        }
      }
    } else if (tok.type === 'FUNC') {
      switch (tok.name) {
        case 'pol': {
          if (State.mode === 2) throw { type: 'Math', msg: 'Not supported' };
          const y = stack.pop();
          const x = stack.pop();
          if (x === undefined || y === undefined) throw { type: 'Syntax', msg: 'Missing arguments' };
          const r = Math.sqrt(x * x + y * y);
          let theta = Math.atan2(y, x);
          if (angleUnit === 'D') theta = theta * 180 / Math.PI;
          else if (angleUnit === 'G') theta = theta * 200 / Math.PI;
          State.vars.X = r;
          State.vars.Y = theta;
          stack.push(`r=${formatResult(r)}, θ=${formatResult(theta)}`);
          break;
        }
        case 'rec': {
          if (State.mode === 2) throw { type: 'Math', msg: 'Not supported' };
          const thetaVal = stack.pop();
          const r = stack.pop();
          if (r === undefined || thetaVal === undefined) throw { type: 'Syntax', msg: 'Missing arguments' };
          const rad = toRad(thetaVal);
          const x = r * Math.cos(rad);
          const y = r * Math.sin(rad);
          State.vars.X = x;
          State.vars.Y = y;
          stack.push(`X=${formatResult(x)}, Y=${formatResult(y)}`);
          break;
        }
        case 'Arg': {
          const x = stack.pop();
          const theta = toComplex(x).arg();
          stack.push(new Complex(fromRad(theta), 0));
          break;
        }
        case 'Conjg': {
          const x = stack.pop();
          stack.push(toComplex(x).conjg());
          break;
        }
        case 'ReP': {
          const x = stack.pop();
          stack.push(new Complex(toComplex(x).re, 0));
          break;
        }
        case 'ImP': {
          const x = stack.pop();
          stack.push(new Complex(toComplex(x).im, 0));
          break;
        }
        case 'sin': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.sin(toRad(x)), 0));
          } else {
            stack.push(Math.sin(toRad(x)));
          }
          break;
        }
        case 'cos': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.cos(toRad(x)), 0));
          } else {
            stack.push(Math.cos(toRad(x)));
          }
          break;
        }
        case 'tan': {
          const x = stack.pop();
          if (State.mode === 2) {
            const r = toRad(x);
            if (Math.abs(Math.cos(r)) < 1e-14) throw { type: 'Math', msg: 'Undefined' };
            stack.push(new Complex(Math.tan(r), 0));
          } else {
            const r = toRad(x);
            if (Math.abs(Math.cos(r)) < 1e-14) throw { type: 'Math', msg: 'Undefined' };
            stack.push(Math.tan(r));
          }
          break;
        }
        case 'asin': {
          const x = stack.pop();
          if (State.mode === 2) {
            const val = checkReal(x);
            if (val < -1 || val > 1) throw { type: 'Math', msg: 'Domain' };
            stack.push(new Complex(fromRad(Math.asin(val)), 0));
          } else {
            if (x < -1 || x > 1) throw { type: 'Math', msg: 'Domain' };
            stack.push(fromRad(Math.asin(x)));
          }
          break;
        }
        case 'acos': {
          const x = stack.pop();
          if (State.mode === 2) {
            const val = checkReal(x);
            if (val < -1 || val > 1) throw { type: 'Math', msg: 'Domain' };
            stack.push(new Complex(fromRad(Math.acos(val)), 0));
          } else {
            if (x < -1 || x > 1) throw { type: 'Math', msg: 'Domain' };
            stack.push(fromRad(Math.acos(x)));
          }
          break;
        }
        case 'atan': {
          const x = stack.pop();
          if (State.mode === 2) {
            const val = checkReal(x);
            stack.push(new Complex(fromRad(Math.atan(val)), 0));
          } else {
            stack.push(fromRad(Math.atan(x)));
          }
          break;
        }
        case 'sinh': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.sinh(checkReal(x)), 0));
          } else {
            stack.push(Math.sinh(x));
          }
          break;
        }
        case 'cosh': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.cosh(checkReal(x)), 0));
          } else {
            stack.push(Math.cosh(x));
          }
          break;
        }
        case 'tanh': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.tanh(checkReal(x)), 0));
          } else {
            stack.push(Math.tanh(x));
          }
          break;
        }
        case 'asinh': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.asinh(checkReal(x)), 0));
          } else {
            stack.push(Math.asinh(x));
          }
          break;
        }
        case 'acosh': {
          const x = stack.pop();
          if (State.mode === 2) {
            const val = checkReal(x);
            if (val < 1) throw { type: 'Math', msg: 'Domain' };
            stack.push(new Complex(Math.acosh(val), 0));
          } else {
            if (x < 1) throw { type: 'Math', msg: 'Domain' };
            stack.push(Math.acosh(x));
          }
          break;
        }
        case 'atanh': {
          const x = stack.pop();
          if (State.mode === 2) {
            const val = checkReal(x);
            if (Math.abs(val) >= 1) throw { type: 'Math', msg: 'Domain' };
            stack.push(new Complex(Math.atanh(val), 0));
          } else {
            if (Math.abs(x) >= 1) throw { type: 'Math', msg: 'Domain' };
            stack.push(Math.atanh(x));
          }
          break;
        }
        case 'sqrt': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(toComplex(x).sqrt());
          } else {
            if (x < 0) throw { type: 'Math', msg: 'Negative sqrt' };
            stack.push(Math.sqrt(x));
          }
          break;
        }
        case 'cbrt': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.cbrt(checkReal(x)), 0));
          } else {
            stack.push(Math.cbrt(x));
          }
          break;
        }
        case 'abs': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(toComplex(x).abs(), 0));
          } else {
            stack.push(Math.abs(x));
          }
          break;
        }
        case 'ln': {
          const x = stack.pop();
          if (State.mode === 2) {
            const val = checkReal(x);
            if (val <= 0) throw { type: 'Math', msg: 'Log domain' };
            stack.push(new Complex(Math.log(val), 0));
          } else {
            if (x <= 0) throw { type: 'Math', msg: 'Log domain' };
            stack.push(Math.log(x));
          }
          break;
        }
        case 'log': {
          const x = stack.pop();
          if (State.mode === 2) {
            const val = checkReal(x);
            if (val <= 0) throw { type: 'Math', msg: 'Log domain' };
            stack.push(new Complex(Math.log10(val), 0));
          } else {
            if (x <= 0) throw { type: 'Math', msg: 'Log domain' };
            stack.push(Math.log10(x));
          }
          break;
        }
        case 'exp': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.exp(checkReal(x)), 0));
          } else {
            stack.push(Math.exp(x));
          }
          break;
        }
        case 'pow10': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.pow(10, checkReal(x)), 0));
          } else {
            stack.push(Math.pow(10, x));
          }
          break;
        }
        case 'fact': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(factorial(checkRealInt(x)), 0));
          } else {
            stack.push(factorial(x));
          }
          break;
        }
        case 'nPr': {
          const r = stack.pop();
          const n = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(nPr(checkRealInt(n), checkRealInt(r)), 0));
          } else {
            stack.push(nPr(n, r));
          }
          break;
        }
        case 'nCr': {
          const r = stack.pop();
          const n = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(nCr(checkRealInt(n), checkRealInt(r)), 0));
          } else {
            stack.push(nCr(n, r));
          }
          break;
        }
        case 'gcd': {
          const b = stack.pop();
          const a = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(gcd(checkRealInt(a), checkRealInt(b)), 0));
          } else {
            stack.push(gcd(a, b));
          }
          break;
        }
        case 'lcm': {
          const b = stack.pop();
          const a = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(lcm(checkRealInt(a), checkRealInt(b)), 0));
          } else {
            stack.push(lcm(a, b));
          }
          break;
        }
        case 'int': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.trunc(checkReal(x)), 0));
          } else {
            stack.push(Math.trunc(x));
          }
          break;
        }
        case 'intg': {
          const x = stack.pop();
          if (State.mode === 2) {
            stack.push(new Complex(Math.floor(checkReal(x)), 0));
          } else {
            stack.push(Math.floor(x));
          }
          break;
        }
        case 'RanInt': {
          const b = stack.pop();
          const a = stack.pop();
          if (a === undefined || b === undefined) throw { type: 'Syntax', msg: 'Missing arguments' };
          if (State.mode === 2) {
            const valA = checkReal(a);
            const valB = checkReal(b);
            const min = Math.min(valA, valB);
            const max = Math.max(valA, valB);
            stack.push(new Complex(Math.floor(Math.random() * (max - min + 1)) + min, 0));
          } else {
            const min = Math.min(a, b);
            const max = Math.max(a, b);
            stack.push(Math.floor(Math.random() * (max - min + 1)) + min);
          }
          break;
        }
        case 'Rnd': {
          const x = stack.pop();
          if (x === undefined) throw { type: 'Syntax', msg: 'Missing argument' };
          const decimals = State.settings.format === 'Fix' ? State.settings.formatN : 9;
          const factor = Math.pow(10, decimals);
          if (State.mode === 2) {
            const val = checkReal(x);
            stack.push(new Complex(Math.round(val * factor) / factor, 0));
          } else {
            stack.push(Math.round(x * factor) / factor);
          }
          break;
        }
        case 'integral': {
          // Placeholder
          const b = stack.pop();
          const a = stack.pop();
          stack.push((a + b) / 2);
          break;
        }
        default:
          throw { type: 'Syntax', msg: 'Unknown function: ' + tok.name };
      }
    }
  }
  if (stack.length !== 1) throw { type: 'Syntax', msg: 'Invalid expression' };
  return stack[0];
}

function evaluate(tokens) {
  const implicitMult = [];
  for (let i = 0; i < tokens.length; i++) {
    implicitMult.push(tokens[i]);
    if (i + 1 < tokens.length) {
      const cur = tokens[i];
      const nxt = tokens[i + 1];

      const curIsNumOrOperand = cur.type === 'num' || cur.type === 'const' || cur.type === 'var' || cur.raw === ')';
      const nextIsOpenOrOperand = nxt.type === 'func' || nxt.type === 'lp' || nxt.type === 'const' || nxt.type === 'var';

      if (curIsNumOrOperand && nextIsOpenOrOperand && nxt.raw !== ')') {
        implicitMult.push({ display: '×', raw: '*', type: 'op', byteLen: 1 });
      }
    }
  }

  const rawStr = buildRawString(implicitMult);
  if (!rawStr.trim()) throw { type: 'Syntax', msg: 'Empty expression' };

  const lexed = tokenize(rawStr);
  const rpn = toRPN(lexed);
  return evalRPN(rpn, State.settings.angle);
}

// ============================================================
// 7. RESULT FORMATTER
// ============================================================
function convertRadianToAngle(v) {
  const angleUnit = State.settings.angle;
  if (angleUnit === 'D') return v * 180 / Math.PI;
  if (angleUnit === 'G') return v * 200 / Math.PI;
  return v;
}

function numberToFraction(val, maxDenom = 1000, tol = 1e-8) {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) return null;
  if (Number.isInteger(val)) return { n: val, d: 1, isInt: true };

  const isNeg = val < 0;
  const absVal = Math.abs(val);

  let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = absVal;
  let iter = 0;
  while (iter < 12) {
    iter++;
    const a = Math.floor(b);
    const auxH = a * h1 + h2;
    const auxK = a * k1 + k2;
    if (auxK > maxDenom) break;
    [h1, h2] = [auxH, h1];
    [k1, k2] = [auxK, k1];
    const diff = absVal - h1 / k1;
    if (Math.abs(diff) < tol) break;
    if (Math.abs(b - a) < 1e-12) break;
    b = 1 / (b - a);
  }

  if (k1 <= maxDenom && Math.abs(absVal - h1 / k1) < 1e-7) {
    return { n: isNeg ? -h1 : h1, d: k1, isInt: k1 === 1 };
  }
  return null;
}

function formatSingleValAsFraction(num) {
  if (num === null || num === undefined) return '';
  if (Number.isInteger(num)) return String(num);
  const frac = numberToFraction(num);
  if (frac && !frac.isInt && frac.d <= 9999) {
    return `${frac.n}/${frac.d}`;
  }
  return formatRealNumber(num);
}

function formatValueAutoFraction(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;

  if (val instanceof Complex || (val && typeof val === 'object' && 're' in val && 'im' in val)) {
    const z = toComplex(val);
    const isImZero = Math.abs(z.im) < 1e-9;
    const isReZero = Math.abs(z.re) < 1e-9;

    if (isImZero && isReZero) return '0';
    if (isImZero) return formatSingleValAsFraction(z.re);

    const reStr = isReZero ? '' : formatSingleValAsFraction(z.re);
    let imStr = '';
    const absIm = Math.abs(z.im);
    const fracIm = numberToFraction(absIm);

    if (Math.abs(absIm - 1) < 1e-9) {
      imStr = 'i';
    } else if (fracIm && !fracIm.isInt && fracIm.d <= 9999) {
      imStr = `${fracIm.n}/${fracIm.d}i`;
    } else {
      imStr = `${formatRealNumber(absIm)}i`;
    }

    if (isReZero) {
      return z.im < 0 ? `-${imStr}` : imStr;
    }
    const sign = z.im < 0 ? ' - ' : ' + ';
    return `${reStr}${sign}${imStr}`;
  }

  if (typeof val === 'number') {
    return formatSingleValAsFraction(val);
  }
  return String(val);
}

function formatResult(val) {
  if (State.mode === 3) {
    const base = State.baseSystem || 'DEC';
    let coreVal = State.baseValue !== undefined ? State.baseValue : (typeof val === 'number' ? val : parseInt(val, 10));
    if (isNaN(coreVal)) coreVal = 0;

    if (base === 'DEC') {
      if (coreVal < 0) return '-' + Math.abs(coreVal).toString(10);
      return String(coreVal.toString(10));
    }
    const uval = coreVal >>> 0;
    if (base === 'HEX') {
      let hexStr = uval.toString(16).toUpperCase();
      return String(hexStr.padStart(8, '0'));
    }
    if (base === 'BIN') {
      let binStr = uval.toString(2);
      return String(binStr.padStart(16, '0'));
    }
    if (base === 'OCT') {
      let octStr = uval.toString(8);
      return String(octStr.padStart(8, '0'));
    }
  }

  if (State.sdDisplayOverride) {
    return State.sdDisplayOverride;
  }

  return formatValueAutoFraction(val);
}

function formatRealNumber(val) {
  if (typeof val !== 'number') return String(val);
  if (!isFinite(val)) {
    if (val === Infinity || val === -Infinity) throw { type: 'Math', msg: 'Overflow' };
    throw { type: 'Math', msg: 'Undefined' };
  }

  if (State.settings.format === 'Fix') {
    return val.toFixed(State.settings.formatN);
  } else if (State.settings.format === 'Sci') {
    return val.toExponential(State.settings.formatN);
  } else {
    if (val === 0) return '0';
    const abs = Math.abs(val);
    if (abs >= 1e10 || (abs < 1e-2 && abs > 0)) {
      const formatted = val.toExponential(9);
      const [mantissa, exp] = formatted.split('e');
      const expNum = parseInt(exp);
      return mantissa + '×10^' + expNum;
    }
    const rounded = parseFloat(val.toPrecision(10));
    let formatted = String(rounded);
    if (formatted.includes('.')) {
      formatted = formatted.replace(/\.?0+$/, '');
    }
    return formatted;
  }
}

function formatComplex(z) {
  z = toComplex(z);
  const format = State.settings.complexFormat || 'algebraic';

  if (format === 'polar') {
    const r = z.abs();
    const theta = z.arg();
    const thetaVal = convertRadianToAngle(theta);
    const rStr = formatRealNumber(r);
    const thetaStr = formatRealNumber(thetaVal);
    return `${rStr}∠${thetaStr}`;
  } else {
    const a = z.re;
    const b = z.im;
    
    const aStr = formatRealNumber(a);
    const bStr = formatRealNumber(b);
    
    if (b === 0) {
      return aStr;
    }
    if (a === 0) {
      if (b === 1) return 'i';
      if (b === -1) return '-i';
      return `${bStr}i`;
    }
    
    let sign = '+';
    let absB = b;
    if (b < 0) {
      sign = '−';
      absB = -b;
    }
    
    let bPart = '';
    if (absB === 1) {
      bPart = 'i';
    } else {
      bPart = `${formatRealNumber(absB)}i`;
    }
    
    return `${aStr} ${sign} ${bPart}`;
  }
}

// ============================================================
// 8. INPUT BUFFER HELPERS & MATH TEMPLATES
// ============================================================
const TEMPLATE_CONFIGS = {
  integral: {
    order: ['formula', 'lower', 'upper'],
    up: { lower: 'upper', formula: 'upper' },
    down: { upper: 'lower', formula: 'lower' }
  },
  summation: {
    order: ['formula', 'lower', 'upper'],
    up: { lower: 'upper', formula: 'upper' },
    down: { upper: 'lower', formula: 'lower' }
  },
  derivative: {
    order: ['formula', 'targetX'],
    up: { targetX: 'formula' },
    down: { formula: 'targetX' }
  },
  fraction: {
    order: ['num', 'den'],
    up: { den: 'num' },
    down: { num: 'den' }
  },
  mixedFraction: {
    order: ['whole', 'num', 'den'],
    up: { den: 'num', whole: 'num' },
    down: { num: 'den', whole: 'den' }
  }
};

function makeIntegralTemplate() {
  return {
    type: 'template',
    templateType: 'integral',
    subExprs: {
      formula: [],
      lower: [],
      upper: []
    },
    activeSubExpr: 'formula',
    cursorIdx: 0,
    byteLen: 8
  };
}

function makeDerivativeTemplate() {
  return {
    type: 'template',
    templateType: 'derivative',
    subExprs: {
      formula: [],
      targetX: []
    },
    activeSubExpr: 'formula',
    cursorIdx: 0,
    byteLen: 8
  };
}

function makeSummationTemplate() {
  return {
    type: 'template',
    templateType: 'summation',
    subExprs: {
      formula: [],
      lower: [],
      upper: []
    },
    activeSubExpr: 'formula',
    cursorIdx: 0,
    byteLen: 8
  };
}

function makeFractionTemplate() {
  return {
    type: 'template',
    templateType: 'fraction',
    subExprs: {
      num: [],
      den: []
    },
    activeSubExpr: 'num',
    cursorIdx: 0,
    byteLen: 2
  };
}

function makeMixedFractionTemplate() {
  return {
    type: 'template',
    templateType: 'mixedFraction',
    subExprs: {
      whole: [],
      num: [],
      den: []
    },
    activeSubExpr: 'whole',
    cursorIdx: 0,
    byteLen: 3
  };
}

function getActiveContext() {
  if (!State.activeTemplatePath || State.activeTemplatePath.length === 0) {
    if (State.inCalcPrompt) {
      return {
        tokens: State.calcTokens,
        cursorIdx: State.calcCursorIdx,
        setCursorIdx: (val) => { State.calcCursorIdx = val; },
        template: null
      };
    }
    if (State.inSolvePrompt) {
      return {
        tokens: State.solveTokens,
        cursorIdx: State.solveCursorIdx,
        setCursorIdx: (val) => { State.solveCursorIdx = val; },
        template: null
      };
    }
    return {
      tokens: State.tokens,
      cursorIdx: State.cursorIdx,
      setCursorIdx: (val) => { State.cursorIdx = val; },
      template: null
    };
  }
  const template = State.activeTemplatePath[State.activeTemplatePath.length - 1];
  const tokens = template.subExprs[template.activeSubExpr];
  return {
    tokens: tokens,
    cursorIdx: template.cursorIdx,
    setCursorIdx: (val) => { template.cursorIdx = val; },
    template: template
  };
}

function totalBytes(tokens) {
  return tokens.reduce((s, t) => {
    if (t.type === 'template') {
      let sum = t.byteLen || 1;
      for (const k in t.subExprs) {
        sum += totalBytes(t.subExprs[k]);
      }
      return s + sum;
    }
    return s + (t.byteLen || 1);
  }, 0);
}

function insertToken(tok) {
  if (totalBytes(State.tokens) + tok.byteLen > 99) return;
  const ctx = getActiveContext();
  if (State.isInsert && ctx.cursorIdx < ctx.tokens.length) {
    ctx.tokens.splice(ctx.cursorIdx, 1, tok);
    ctx.setCursorIdx(ctx.cursorIdx + 1);
  } else {
    ctx.tokens.splice(ctx.cursorIdx, 0, tok);
    ctx.setCursorIdx(ctx.cursorIdx + 1);
  }

  // If we just inserted a template, automatically enter its formula sub-expression
  if (tok.type === 'template') {
    State.activeTemplatePath.push(tok);
    const config = TEMPLATE_CONFIGS[tok.templateType];
    tok.activeSubExpr = config ? config.order[0] : 'formula';
    tok.cursorIdx = 0;
  }
}

function deleteBeforeCursor() {
  const ctx = getActiveContext();
  if (ctx.cursorIdx > 0) {
    ctx.tokens.splice(ctx.cursorIdx - 1, 1);
    ctx.setCursorIdx(ctx.cursorIdx - 1);
  }
}

function clearAll() {
  State.tokens = [];
  State.cursorIdx = 0;
  State.activeTemplatePath = [];
  State.hasResult = false;
  State.errorState = null;
  State.multiStmts = [];
  State.multiStmtIdx = 0;
  State.sdDisplayOverride = null;
  State.sdMode = 'dec';
  State.inOptnMenu = false;
  State.baseValue = 0;
  State.inCalcPrompt = false;
  State.calcInputStr = '';
  State.calcTokens = [];
  State.calcCursorIdx = 0;
  State.inSolvePrompt = false;
  State.solveInputStr = '';
  State.solveTokens = [];
  State.solveCursorIdx = 0;
  State.inSolveResult = false;
  State.solveEqStr = '';
  State.solveValStr = '';
  State.solveDiffStr = '';
  if (dom.optnScreen) dom.optnScreen.classList.remove('active');
  if (dom.solveScreen) dom.solveScreen.classList.remove('active');
}

function renderOptnScreen() {
  if (!dom.optnScreen) return;
  
  if (State.mode === 2) {
    dom.optnScreen.innerHTML = `
      <div class="optn-title">CMPLX Option</div>
      <div class="optn-list">
        <div class="optn-item" data-optn="1">1: Argument</div>
        <div class="optn-item" data-optn="2">2: Conjugate</div>
        <div class="optn-item" data-optn="3">3: Real Part</div>
        <div class="optn-item" data-optn="4">4: Imaginary Part</div>
      </div>
    `;
  } else if (State.mode === 3) {
    dom.optnScreen.innerHTML = `
      <div class="optn-title">BASE-N Option</div>
      <div class="optn-list">
        <div class="optn-item" data-optn="1">1: And</div>
        <div class="optn-item" data-optn="2">2: Or</div>
        <div class="optn-item" data-optn="3">3: Xor</div>
        <div class="optn-item" data-optn="4">4: Xnor</div>
        <div class="optn-item" data-optn="5">5: Not</div>
        <div class="optn-item" data-optn="6">6: Neg</div>
      </div>
    `;
  }
  
  // Re-bind click events for newly created optn-items
  const optnItems = dom.optnScreen.querySelectorAll('.optn-item');
  optnItems.forEach(item => {
    item.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const optVal = item.dataset.optn;
      if (optVal) {
        handleKey(optVal);
        saveState();
      }
    });
  });
}

function handleOptnKey(key) {
  if (State.mode === 2) {
    if (key === '1') {
      insertToken({ display: 'Arg(', raw: 'Arg(', type: 'func', byteLen: 4 });
      State.inOptnMenu = false;
    } else if (key === '2') {
      insertToken({ display: 'Conjg(', raw: 'Conjg(', type: 'func', byteLen: 6 });
      State.inOptnMenu = false;
    } else if (key === '3') {
      insertToken({ display: 'ReP(', raw: 'ReP(', type: 'func', byteLen: 4 });
      State.inOptnMenu = false;
    } else if (key === '4') {
      insertToken({ display: 'ImP(', raw: 'ImP(', type: 'func', byteLen: 4 });
      State.inOptnMenu = false;
    } else if (key === 'AC' || key === 'ON' || key === 'OPTN') {
      State.inOptnMenu = false;
    }
  } else if (State.mode === 3) {
    if (key === '1') {
      insertToken({ display: ' And ', raw: '__AND__', type: 'op', byteLen: 5 });
      State.inOptnMenu = false;
    } else if (key === '2') {
      insertToken({ display: ' Or ', raw: '__OR__', type: 'op', byteLen: 4 });
      State.inOptnMenu = false;
    } else if (key === '3') {
      insertToken({ display: ' Xor ', raw: '__XOR__', type: 'op', byteLen: 5 });
      State.inOptnMenu = false;
    } else if (key === '4') {
      insertToken({ display: ' Xnor ', raw: '__XNOR__', type: 'op', byteLen: 6 });
      State.inOptnMenu = false;
    } else if (key === '5') {
      insertToken({ display: 'Not(', raw: '__NOT__(', type: 'func', byteLen: 4 });
      State.inOptnMenu = false;
    } else if (key === '6') {
      insertToken({ display: 'Neg(', raw: '__NEG__(', type: 'func', byteLen: 4 });
      State.inOptnMenu = false;
    } else if (key === 'AC' || key === 'ON' || key === 'OPTN') {
      State.inOptnMenu = false;
    }
  }

  if (!State.inOptnMenu) {
    if (dom.optnScreen) {
      dom.optnScreen.classList.remove('active');
    }
  }
}

// ============================================================
// 9. KEY HANDLER
// ============================================================
function handleKey(key) {
  if (State.isPowerOff) {
    if (key === 'ON') {
      State.isPowerOff = false;
      clearAll();
      renderAll();
    }
    return;
  }

  // --- CALC prompt mode: intercept all keys ---
  if (State.inCalcPrompt) {
    handleCalcInputKey(key);
    return;
  }

  // --- SOLVE prompt mode: intercept all keys ---
  if (State.inSolvePrompt) {
    handleSolveInputKey(key);
    return;
  }

  // --- SOLVE result screen: AC/ON exits, any key clears ---
  if (State.inSolveResult) {
    if (key === 'AC' || key === 'ON') {
      State.inSolveResult = false;
      State.solveEqStr = '';
      if (dom.solveScreen) dom.solveScreen.classList.remove('active');
    }
    renderAll();
    return;
  }

  if (State.mode === 3) {
    if (!isKeyAllowedInBaseN(key)) {
      return;
    }
  }

  if (State.inOptnMenu) {
    handleOptnKey(key);
    renderAll();
    return;
  }

  if (State.inMenu) {
    handleMenuKey(key);
    renderAll();
    return;
  }

  // --- Mode 9 Equation / Function intercept ---
  if (State.mode === 9) {
    handleMode9Key(key);
    renderAll();
    return;
  }

  // --- Mode A (10) Inequality intercept ---
  if (State.mode === 10) {
    handleModeAKey(key);
    renderAll();
    return;
  }

  if (State.errorState) {
    if (key === 'AC' || key === 'ON') {
      State.errorState = null;
      clearAll();
    } else if (key === 'LEFT') {
      State.errorState = null;
      if (State.prevTokens) {
        State.tokens = State.prevTokens.slice();
      }
      State.cursorIdx = State.prevCursorIdx || 0;
    } else if (key === 'RIGHT') {
      State.errorState = null;
      if (State.prevTokens) {
        State.tokens = State.prevTokens.slice();
      }
      State.cursorIdx = State.prevCursorIdx || State.tokens.length;
    }
    renderAll();
    return;
  }

  if (State.multiStmts.length > 0 && State.multiStmtIdx < State.multiStmts.length - 1 && State.hasResult) {
    if (key === 'EQUALS') {
      State.multiStmtIdx++;
      execMultiStmt();
      renderAll();
      return;
    }
  }

  if (key === 'SHIFT') {
    if (State.isAlpha) { State.isAlpha = false; }
    State.isShift = !State.isShift;
    renderAll();
    return;
  }
  if (key === 'ALPHA') {
    if (State.isShift) { State.isShift = false; }
    State.isAlpha = !State.isAlpha;
    renderAll();
    return;
  }

  let effectiveKey = key;
  if (State.isShift) {
    effectiveKey = 'SHIFT_' + key;
    State.isShift = false;
  } else if (State.isAlpha) {
    effectiveKey = 'ALPHA_' + key;
    State.isAlpha = false;
  }

  if (State.hasResult && !['EQUALS', 'LEFT', 'RIGHT', 'UP', 'DOWN', 'AC', 'ON', 'MENU', 'STO', 'MPLUS', 'SD', 'SQUARE', 'POWER', 'LOG_BASE', 'LN'].includes(effectiveKey)) {
    const tok = resolveToken(effectiveKey);
    if (tok) {
      if (tok.type === 'num' || tok.type === 'func' || tok.type === 'lp' || tok.type === 'const' || tok.type === 'var') {
        clearAll();
      } else if (tok.type === 'op') {
        const prevAns = State.Ans;
        const prevBaseVal = State.baseValue;
        clearAll();
        State.Ans = prevAns;
        State.baseValue = prevBaseVal;
        insertToken(Object.assign({}, KEY_TOKENS['ANS']));
      }
    }
  }

  dispatchAction(effectiveKey);
  renderAll();
}

// ============================================================
// 10. ACTION DISPATCHER & NAVIGATION HELPERS
// ============================================================
function handleLeftKey() {
  if (State.activeTemplatePath && State.activeTemplatePath.length > 0) {
    const template = State.activeTemplatePath[State.activeTemplatePath.length - 1];
    if (template.cursorIdx > 0) {
      const subTokens = template.subExprs[template.activeSubExpr];
      const tokLeft = subTokens[template.cursorIdx - 1];
      if (tokLeft && tokLeft.type === 'template') {
        State.activeTemplatePath.push(tokLeft);
        const config = TEMPLATE_CONFIGS[tokLeft.templateType];
        tokLeft.activeSubExpr = config.order[config.order.length - 1];
        tokLeft.cursorIdx = (tokLeft.subExprs[tokLeft.activeSubExpr] || []).length;
      } else {
        template.cursorIdx--;
      }
    } else {
      const config = TEMPLATE_CONFIGS[template.templateType];
      const idx = config.order.indexOf(template.activeSubExpr);
      if (idx > 0) {
        template.activeSubExpr = config.order[idx - 1];
        template.cursorIdx = (template.subExprs[template.activeSubExpr] || []).length;
      } else {
        State.activeTemplatePath.pop();
        const parentCtx = getActiveContext();
        const parentTokens = parentCtx.tokens;
        const tempIdx = parentTokens.indexOf(template);
        if (tempIdx !== -1) {
          parentCtx.setCursorIdx(tempIdx);
        }
      }
    }
  } else {
    if (State.cursorIdx > 0) {
      const tokLeft = State.tokens[State.cursorIdx - 1];
      if (tokLeft && tokLeft.type === 'template') {
        State.activeTemplatePath.push(tokLeft);
        const config = TEMPLATE_CONFIGS[tokLeft.templateType];
        tokLeft.activeSubExpr = config.order[config.order.length - 1];
        tokLeft.cursorIdx = (tokLeft.subExprs[tokLeft.activeSubExpr] || []).length;
      } else {
        State.cursorIdx--;
      }
    }
  }
}

function handleRightKey() {
  if (State.activeTemplatePath && State.activeTemplatePath.length > 0) {
    const template = State.activeTemplatePath[State.activeTemplatePath.length - 1];
    const subTokens = template.subExprs[template.activeSubExpr] || [];
    if (template.cursorIdx < subTokens.length) {
      const tokAt = subTokens[template.cursorIdx];
      if (tokAt && tokAt.type === 'template') {
        State.activeTemplatePath.push(tokAt);
        const config = TEMPLATE_CONFIGS[tokAt.templateType];
        tokAt.activeSubExpr = config.order[0];
        tokAt.cursorIdx = 0;
      } else {
        template.cursorIdx++;
      }
    } else {
      const config = TEMPLATE_CONFIGS[template.templateType];
      const idx = config.order.indexOf(template.activeSubExpr);
      if (idx < config.order.length - 1) {
        template.activeSubExpr = config.order[idx + 1];
        template.cursorIdx = 0;
      } else {
        State.activeTemplatePath.pop();
        const parentCtx = getActiveContext();
        const parentTokens = parentCtx.tokens;
        const tempIdx = parentTokens.indexOf(template);
        if (tempIdx !== -1) {
          parentCtx.setCursorIdx(tempIdx + 1);
        }
      }
    }
  } else {
    if (State.cursorIdx < State.tokens.length) {
      const tokAt = State.tokens[State.cursorIdx];
      if (tokAt && tokAt.type === 'template') {
        State.activeTemplatePath.push(tokAt);
        const config = TEMPLATE_CONFIGS[tokAt.templateType];
        tokAt.activeSubExpr = config.order[0];
        tokAt.cursorIdx = 0;
      } else {
        State.cursorIdx++;
      }
    }
  }
}

function handleUpKey() {
  if (State.activeTemplatePath && State.activeTemplatePath.length > 0) {
    const template = State.activeTemplatePath[State.activeTemplatePath.length - 1];
    const config = TEMPLATE_CONFIGS[template.templateType];
    const nextSub = config.up[template.activeSubExpr];
    if (nextSub) {
      template.activeSubExpr = nextSub;
      template.cursorIdx = Math.min((template.subExprs[nextSub] || []).length, template.cursorIdx);
    }
  } else {
    handleHistoryUp();
  }
}

function handleDownKey() {
  if (State.activeTemplatePath && State.activeTemplatePath.length > 0) {
    const template = State.activeTemplatePath[State.activeTemplatePath.length - 1];
    const config = TEMPLATE_CONFIGS[template.templateType];
    const nextSub = config.down[template.activeSubExpr];
    if (nextSub) {
      template.activeSubExpr = nextSub;
      template.cursorIdx = Math.min((template.subExprs[nextSub] || []).length, template.cursorIdx);
    }
  } else {
    handleHistoryDown();
  }
}

function dispatchAction(key) {
  // --- Handle OPTN menu item selection ---
  if (State.inOptnMenu) {
    // Any key closes the OPTN menu first
    State.inOptnMenu = false;
    if (dom.optnScreen) dom.optnScreen.classList.remove('active');
    if (State.mode === 2) {
      const optnFuncMap = {
        '1': { display: 'Arg(', raw: 'Arg(', type: 'func', byteLen: 4 },
        '2': { display: 'Conjg(', raw: 'Conjg(', type: 'func', byteLen: 6 },
        '3': { display: 'ReP(', raw: 'ReP(', type: 'func', byteLen: 4 },
        '4': { display: 'ImP(', raw: 'ImP(', type: 'func', byteLen: 4 },
      };
      if (optnFuncMap[key]) {
        insertToken(optnFuncMap[key]);
        renderAll();
        return;
      }
    } else if (State.mode === 3) {
      const optnFuncMap = {
        '1': { display: ' And ', raw: '__AND__', type: 'op', byteLen: 5 },
        '2': { display: ' Or ', raw: '__OR__', type: 'op', byteLen: 4 },
        '3': { display: ' Xor ', raw: '__XOR__', type: 'op', byteLen: 5 },
        '4': { display: ' Xnor ', raw: '__XNOR__', type: 'op', byteLen: 6 },
        '5': { display: 'Not(', raw: '__NOT__(', type: 'func', byteLen: 4 },
        '6': { display: 'Neg(', raw: '__NEG__(', type: 'func', byteLen: 4 },
      };
      if (optnFuncMap[key]) {
        insertToken(optnFuncMap[key]);
        renderAll();
        return;
      }
    }
    // For all other keys (AC, DEL, etc.) just close menu and continue
    if (key === 'AC') { clearAll(); return; }
    // Re-render and fall through for other keys
    renderAll();
    return;
  }

  // --- Block COMP-only functions in Mode 2 ---
  if (State.mode === 2 && ['INTEGRAL', 'SHIFT_INTEGRAL', 'ALPHA_INTEGRAL'].includes(key)) {
    dom.screenOutput.textContent = 'Not Available';
    dom.screenOutput.style.display = 'block';
    return;
  }

  if (State.mode === 3) {
    const allowedActions = [
      'ON', 'AC', 'DEL', 'SHIFT_DEL', 'LEFT', 'RIGHT', 'UP', 'DOWN', 
      'MENU', 'SHIFT_MENU', 'EQUALS', 'SHIFT_AC', 'SHIFT_9', 'OPTN',
      'PLUS', 'MINUS', 'MULTIPLY', 'DIVIDE', 'LPAREN', 'RPAREN', 'ANS',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
    ];
    if (State.baseSystem === 'HEX') {
      allowedActions.push('NEGATION', 'DEGREE', 'INVERSE', 'SIN', 'COS', 'TAN');
    } else {
      allowedActions.push('NEGATION');
    }
    allowedActions.push('SQUARE', 'POWER', 'LOG_BASE', 'LN');

    if (!allowedActions.includes(key)) {
      return;
    }

    if (key === 'NEGATION') {
      if (State.baseSystem === 'HEX') {
        insertToken({ display: 'A', raw: 'A', type: 'num', byteLen: 1 });
      } else {
        insertToken({ display: '(-)', raw: '(-1)*', type: 'op', byteLen: 3 });
      }
      return;
    }
    if (key === 'DEGREE' && State.baseSystem === 'HEX') {
      insertToken({ display: 'B', raw: 'B', type: 'num', byteLen: 1 });
      return;
    }
    if (key === 'INVERSE' && State.baseSystem === 'HEX') {
      insertToken({ display: 'C', raw: 'C', type: 'num', byteLen: 1 });
      return;
    }
    if (key === 'SIN' && State.baseSystem === 'HEX') {
      insertToken({ display: 'D', raw: 'D', type: 'num', byteLen: 1 });
      return;
    }
    if (key === 'COS' && State.baseSystem === 'HEX') {
      insertToken({ display: 'E', raw: 'E', type: 'num', byteLen: 1 });
      return;
    }
    if (key === 'TAN' && State.baseSystem === 'HEX') {
      insertToken({ display: 'F', raw: 'F', type: 'num', byteLen: 1 });
      return;
    }

    if (key === 'SQUARE') {
      changeBaseSystem('DEC');
      return;
    }
    if (key === 'POWER') {
      changeBaseSystem('HEX');
      return;
    }
    if (key === 'LOG_BASE') {
      changeBaseSystem('BIN');
      return;
    }
    if (key === 'LN') {
      changeBaseSystem('OCT');
      return;
    }
  }

  switch (key) {
    case 'ON':
      State.isPowerOff = false;
      clearAll();
      State.isShift = false;
      State.isAlpha = false;
      if (dom.lcd) dom.lcd.style.opacity = '1';
      return;

    case 'AC':
      if (State.tokens.length === 0 && !State.hasResult) { /* double AC */ }
      clearAll();
      return;

    case 'DEL':
      if (State.hasResult) { clearAll(); return; }
      deleteBeforeCursor();
      return;

    case 'SHIFT_DEL':
      State.isInsert = !State.isInsert;
      return;

    case 'LEFT':
      handleLeftKey();
      return;

    case 'RIGHT':
      handleRightKey();
      return;

    case 'UP':
      handleUpKey();
      return;

    case 'DOWN':
      handleDownKey();
      return;

    case 'MENU':
      State.inMenu = true;
      State.menuCursor = State.mode - 1;
      return;

    case 'SHIFT_MENU':
      openSetup();
      return;

    case 'EQUALS':
      handleEquals();
      return;

    case 'SD':
      handleSD();
      return;

    case 'STO':
      State.waitingSTO = true;
      return;

    case 'SHIFT_STO':
      State.waitingRCL = true;
      return;

    case 'MPLUS':
      handleMPlus(1);
      return;

    case 'SHIFT_MPLUS':
      handleMPlus(-1);
      return;

    case 'SHIFT_9':
      handleReset();
      return;

    case 'SHIFT_AC':
      State.isPowerOff = true;
      clearAll();
      return;

    case 'OPTN':
      if (State.mode === 2 || State.mode === 3) {
        State.inOptnMenu = true;
        renderOptnScreen();
      } else {
        showOptnMenu();
      }
      return;

    case 'CALC':
      handleCalc();
      return;

    case 'ALPHA_CALC':
      insertToken({ display: '=', raw: '__EQ__', type: 'special' });
      return;

    case 'SHIFT_CALC':
      handleSolve();
      return;

    case 'ENG':
      if (State.mode === 2) {
        insertToken({ display: 'i', raw: '__IMAG_I__', type: 'const', byteLen: 1 });
      } else {
        handleENG();
      }
      return;

    case 'DEGREE':
      handleDegreeConversion();
      return;

    case 'SHIFT_DEGREE':
      handleFACT();
      return;

    case 'SHIFT_7':
      showConstants();
      return;

    case 'SHIFT_8':
      showConversions();
      return;

    case 'FRAC':
      insertToken(makeFractionTemplate());
      return;

    case 'SHIFT_FRAC':
      insertToken(makeMixedFractionTemplate());
      return;

    case 'INTEGRAL':
      insertToken(makeIntegralTemplate());
      return;

    case 'SHIFT_INTEGRAL':
      insertToken(makeDerivativeTemplate());
      return;

    case 'ALPHA_INTEGRAL':
      insertToken(makeSummationTemplate());
      return;

    case 'X_VAR':
      insertToken({ display: 'X', raw: '__VAR_X__', type: 'var', byteLen: 1 });
      return;

    default:
      break;
  }

  if (State.waitingSTO) {
    State.waitingSTO = false;
    const varName = getVarFromKey(key);
    if (varName) {
      try {
        const result = evaluateExpression(State.tokens);
        State.vars[varName] = result;
        State.Ans = result;
        State.baseValue = result;
        State.hasResult = true;
        saveHistory();
      } catch (e) { /* noop */ }
    }
    return;
  }

  if (State.waitingRCL) {
    State.waitingRCL = false;
    const varName = getVarFromKey(key);
    if (varName) {
      const varToken = { display: varName, raw: '__VAR_' + varName + '__', type: 'var', byteLen: 1 };
      insertToken(varToken);
    }
    return;
  }

  if (key.startsWith('ALPHA_') && key.length > 6) {
    const tok = KEY_TOKENS[key];
    if (tok) { insertToken(Object.assign({}, tok)); return; }
  }

  const tok = resolveToken(key);
  if (tok) {
    insertToken(Object.assign({}, tok));
  }
}

function resolveToken(key) {
  return KEY_TOKENS[key] || null;
}

function getVarFromKey(key) {
  const alphaToVar = {
    'ALPHA_NEGATION': 'A', 'ALPHA_DEGREE': 'B', 'ALPHA_INVERSE': 'C',
    'ALPHA_SIN': 'D', 'ALPHA_COS': 'E', 'ALPHA_TAN': 'F',
    'ALPHA_STO': 'M', 'ALPHA_4': 'Y', 'ALPHA_5': 'Z',
    'ALPHA_MPLUS': 'M', 'ALPHA_LPAREN': 'M',
    'ALPHA_POWER': 'F', 'ALPHA_SQUARE': 'D', 'ALPHA_SQRT': 'E',
    'ALPHA_LN': 'F', 'ALPHA_LOG_BASE': 'B', 'ALPHA_FRAC': 'C',
    'ALPHA_X_VAR': 'X', 'ALPHA_7': 'S', 'ALPHA_8': 'T',
    'ALPHA_9': 'U', 'ALPHA_DEL': 'W', 'ALPHA_AC': 'W',
    'ALPHA_RPAREN': 'N',
  };
  if (alphaToVar[key]) return alphaToVar[key];
  if (/^[A-FMXYZabcdfmxyz]$/.test(key)) return key.toUpperCase();
  return null;
}

// ============================================================
// 11. HISTORY
// ============================================================
function saveHistory() {
  if (State.tokens.length > 0) {
    const entry = State.tokens.slice();
    State.history.push(entry);
    if (State.history.length > 20) State.history.shift();
    State.historyIdx = State.history.length - 1;
  }
}

function handleHistoryUp() {
  if (State.historyIdx < State.history.length - 1) {
    State.historyIdx++;
    loadHistoryEntry();
  }
}

function handleHistoryDown() {
  if (State.historyIdx > 0) {
    State.historyIdx--;
    loadHistoryEntry();
  } else if (State.historyIdx === 0) {
    State.historyIdx = -1;
    clearAll();
  }
}

function loadHistoryEntry() {
  const entry = State.history[State.historyIdx];
  if (entry) {
    State.tokens = entry.slice();
    State.cursorIdx = State.tokens.length;
    State.hasResult = false;
  }
}

// ============================================================
// 12. EQUALS / EVALUATE
// ============================================================
function handleEquals() {
  if (State.tokens.length === 0) return;

  // Exit any active template before evaluating
  State.activeTemplatePath = [];

  const colonIdx = State.tokens.findIndex(t => t.raw === '__COLON__');
  if (colonIdx >= 0) {
    State.multiStmts = splitByColon(State.tokens);
    State.multiStmtIdx = 0;
    execMultiStmt();
    return;
  }

  let openCount = 0;
  for (const t of State.tokens) {
    if (t.raw) {
      for (const ch of t.raw) {
        if (ch === '(') openCount++;
        else if (ch === ')') openCount--;
      }
    }
  }
  const rparenToken = KEY_TOKENS['RPAREN'];
  for (let i = 0; i < openCount; i++) {
    State.tokens.push(Object.assign({}, rparenToken));
  }
  State.cursorIdx = State.tokens.length;
  State.prevTokens = State.tokens.slice();
  State.prevCursorIdx = State.cursorIdx;
  State.cursorIdx = State.tokens.length;

  try {
    const result = evaluateExpression(State.tokens);
    State.PreAns = State.Ans;
    State.Ans = result;
    State.baseValue = result;
    State.hasResult = true;
    State.errorState = null;
    saveHistory();
  } catch (e) {
    State.errorState = { type: e.type || 'Math', msg: e.msg || 'Error' };
    State.hasResult = false;
  }
}

function splitByColon(tokens) {
  const stmts = [];
  let cur = [];
  for (const t of tokens) {
    if (t.raw === '__COLON__') {
      stmts.push(cur);
      cur = [];
    } else {
      cur.push(t);
    }
  }
  stmts.push(cur);
  return stmts;
}

function execMultiStmt() {
  const curTokens = State.multiStmts[State.multiStmtIdx];
  State.prevTokens = curTokens.slice();
  try {
    const result = evaluateExpression(curTokens);
    State.PreAns = State.Ans;
    State.Ans = result;
    State.baseValue = result;
    State.hasResult = true;
    State.errorState = null;
    const hasMore = State.multiStmtIdx < State.multiStmts.length - 1;
    dom.indDisp.classList.toggle('active', hasMore);
  } catch (e) {
    State.errorState = { type: e.type || 'Math', msg: e.msg || 'Error' };
    State.hasResult = false;
  }
}

// ============================================================
// 13. S⇔D TOGGLE
// ============================================================
function handleSD() {
  if (!State.hasResult || State.Ans === null) return;
  const z = toComplex(State.Ans);

  if (State.sdMode === 'dec') {
    if (z.im === 0) {
      const frac = decimalToFraction(z.re);
      if (frac && frac.d <= 9999) {
        State.sdDisplayOverride = frac.n + '/' + frac.d;
        State.sdMode = 'frac';
      } else {
        State.sdDisplayOverride = null;
      }
    } else {
      const fracRe = decimalToFraction(z.re);
      const fracIm = decimalToFraction(z.im);

      const reStr = fracRe ? `${fracRe.n}/${fracRe.d}` : formatRealNumber(z.re);
      let imStr = '';
      if (fracIm) {
        if (fracIm.n === 1 && fracIm.d === 1) imStr = 'i';
        else if (fracIm.n === -1 && fracIm.d === 1) imStr = '-i';
        else imStr = `${fracIm.n}/${fracIm.d}i`;
      } else {
        if (z.im === 1) imStr = 'i';
        else if (z.im === -1) imStr = '-i';
        else imStr = `${formatRealNumber(z.im)}i`;
      }

      if (z.im !== 0) {
        if (z.re === 0) {
          State.sdDisplayOverride = imStr;
        } else {
          let sign = '+';
          let displayIm = imStr;
          if (z.im < 0) {
            sign = '−';
            displayIm = fracIm ? (fracIm.n === -1 && fracIm.d === 1 ? 'i' : `${Math.abs(fracIm.n)}/${fracIm.d}i`) : (z.im === -1 ? 'i' : `${formatRealNumber(Math.abs(z.im))}i`);
          }
          State.sdDisplayOverride = `${reStr} ${sign} ${displayIm}`;
        }
        State.sdMode = 'frac';
      } else {
        State.sdDisplayOverride = null;
      }
    }
  } else {
    State.sdDisplayOverride = null;
    State.sdMode = 'dec';
  }
  renderOutput();
}

function decimalToFraction(val) {
  if (Number.isInteger(val)) return null;
  const tolerance = 1e-9;
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1, b = val;
  do {
    const a = Math.floor(b);
    [h1, h2] = [a * h1 + h2, h1];
    [k1, k2] = [a * k1 + k2, k1];
    b = 1 / (b - a);
  } while (Math.abs(val - h1 / k1) > tolerance && k1 < 10000);
  if (k1 > 9999 || k1 === 1) return null;
  return { n: h1, d: k1 };
}

// ============================================================
// 14. DEGREE CONVERSION & FACT
// ============================================================
function handleDegreeConversion() {
  if (State.hasResult) {
    const z = toComplex(State.Ans);
    if (z.im !== 0) return;
    const val = z.re;
    const deg = Math.floor(val);
    const minFrac = (val - deg) * 60;
    const min = Math.floor(minFrac);
    const sec = Math.round((minFrac - min) * 60);
    dom.screenOutput.textContent = `${deg}°${min}'${sec}"`;
    return;
  }
  const tok = KEY_TOKENS['DEGREE'];
  if (tok) insertToken(Object.assign({}, tok));
}

function handleFACT() {
  if (!State.hasResult || State.Ans === null || State.Ans === undefined) return;
  let val = State.Ans;
  if (!Number.isInteger(val) || val <= 1 || val > 1000000000) {
    dom.screenOutput.textContent = String(val);
    return;
  }

  const factors = [];
  let d = 2;
  let temp = val;
  while (temp > 1) {
    let count = 0;
    while (temp % d === 0) {
      count++;
      temp /= d;
    }
    if (count > 0) {
      factors.push({ base: d, exp: count });
    }
    d++;
    if (d * d > temp) {
      if (temp > 1) {
        factors.push({ base: temp, exp: 1 });
        break;
      }
    }
  }

  if (factors.length === 0) {
    dom.screenOutput.textContent = String(val);
    return;
  }

  const factStr = factors.map(f => {
    if (f.exp === 1) return `${f.base}`;
    return `${f.base}^${f.exp}`;
  }).join('×');

  dom.screenOutput.textContent = factStr;
}

// ============================================================
// 15. M+ / M-
// ============================================================
function handleMPlus(sign) {
  let val = 0;
  if (State.hasResult) {
    val = State.Ans;
  } else if (State.tokens.length > 0) {
    try { val = evaluateExpression(State.tokens); } catch (e) { return; }
  }
  if (State.mode === 2) {
    const current = toComplex(State.vars.M);
    const addition = toComplex(val).mul(new Complex(sign, 0));
    State.vars.M = current.add(addition);
  } else {
    State.vars.M += sign * val;
  }
}

// ============================================================
// 16. ENG KEY
// ============================================================
function handleENG() {
  if (State.mode === 2) {
    // In Mode 2, ENG key inserts imaginary unit i (handled in dispatchAction)
    return;
  }
  if (State.hasResult) {
    const val = State.Ans;
    if (val instanceof Complex || (val && typeof val === 'object' && 're' in val)) return;
    if (val === 0) { dom.screenOutput.textContent = '0'; return; }
    const exp3 = Math.floor(Math.log10(Math.abs(val)) / 3) * 3;
    const mantissa = val / Math.pow(10, exp3);
    dom.screenOutput.textContent = mantissa.toPrecision(5) + '×10^' + exp3;
  }
}

// ============================================================
// 17. OPTN / CALC / SOLVE
// ============================================================
function showOptnMenu() {
  dom.screenOutput.textContent = 'OPTN menu';
}

function hasVariableX(tokens) {
  if (!tokens) return false;
  for (const t of tokens) {
    if (t.raw === '__VAR_X__') return true;
    if (t.type === 'template' && t.subExprs) {
      for (const key in t.subExprs) {
        if (hasVariableX(t.subExprs[key])) return true;
      }
    }
  }
  return false;
}

/**
 * CALC – Bước 2.1: kích hoạt chế độ nhập X?
 */
function handleCalc() {
  const hasX = hasVariableX(State.tokens);
  if (!hasX) {
    State.errorState = { type: 'Syntax', msg: 'No X variable' };
    return;
  }
  if (State.tokens.length === 0) return;

  State.inCalcPrompt = true;
  State.calcTokens = [];
  State.calcCursorIdx = 0;
  State.calcInputStr = '';
  State.hasResult = false;
}

/**
 * SHIFT CALC (SOLVE) – Bước 3.1: kích hoạt chế độ dò nghiệm
 */
function handleSolve() {
  const hasX = hasVariableX(State.tokens);
  if (!hasX) {
    State.errorState = { type: 'Variable', msg: 'No X variable' };
    return;
  }
  if (State.tokens.length === 0) return;

  State.inSolvePrompt = true;
  State.solveTokens = [];
  State.solveCursorIdx = 0;
  State.solveInputStr = '';
  State.hasResult = false;
}

/**
 * Xử lý phím bấm trong chế độ CALC (nhập giá trị X)
 */
function handleCalcInputKey(key) {
  // AC / ON → thoát về chế độ bình thường
  if (key === 'AC' || key === 'ON') {
    State.inCalcPrompt = false;
    State.calcTokens = [];
    State.calcCursorIdx = 0;
    State.calcInputStr = '';
    renderAll();
    return true;
  }

  // DEL → xóa 1 ký tự trước cursor
  if (key === 'DEL') {
    deleteBeforeCursor();
    renderAll();
    return true;
  }

  // Phím di chuyển cursor
  if (key === 'LEFT') {
    handleLeftKey();
    renderAll();
    return true;
  }
  if (key === 'RIGHT') {
    handleRightKey();
    renderAll();
    return true;
  }

  // EQUALS → Bước 2.4: tính toán
  if (key === 'EQUALS') {
    let xVal;
    if (State.calcTokens.length === 0) {
      xVal = State.vars.X; // lấy giá trị mặc định
    } else {
      try {
        const result = evaluateExpression(State.calcTokens);
        xVal = (result && typeof result === 'object' && 're' in result) ? result.re : result;
        if (typeof xVal === 'number' && isNaN(xVal)) {
          xVal = 0;
        }
      } catch (e) {
        State.errorState = { type: e.type || 'Math', msg: e.msg || 'Error' };
        State.inCalcPrompt = false;
        State.calcTokens = [];
        State.calcCursorIdx = 0;
        renderAll();
        return true;
      }
    }
    if (typeof xVal === 'number' && !isNaN(xVal)) {
      State.vars.X = xVal;
    } else if (xVal && typeof xVal === 'object' && 're' in xVal) {
      State.vars.X = xVal;
    }
    State.inCalcPrompt = false;
    State.calcTokens = [];
    State.calcCursorIdx = 0;
    State.calcInputStr = '';

    try {
      const result = evaluateExpression(State.tokens);
      State.PreAns = State.Ans;
      State.Ans = result;
      State.hasResult = true;
      State.errorState = null;
    } catch (e) {
      State.errorState = { type: e.type || 'Math', msg: e.msg || 'Error' };
      State.hasResult = false;
    }
    renderAll();
    return true;
  }

  // Modifier keys (SHIFT / ALPHA)
  if (key === 'SHIFT') {
    if (State.isAlpha) { State.isAlpha = false; }
    State.isShift = !State.isShift;
    renderAll();
    return true;
  }
  if (key === 'ALPHA') {
    if (State.isShift) { State.isShift = false; }
    State.isAlpha = !State.isAlpha;
    renderAll();
    return true;
  }

  let effectiveKey = key;
  if (State.isShift) {
    effectiveKey = 'SHIFT_' + key;
    State.isShift = false;
  } else if (State.isAlpha) {
    effectiveKey = 'ALPHA_' + key;
    State.isAlpha = false;
  }

  dispatchAction(effectiveKey);
  renderAll();
  return true;
}

/**
 * Xử lý phím bấm trong chế độ SOLVE (nhập điểm xuất phát dò nghiệm)
 */
function handleSolveInputKey(key) {
  // AC / ON → thoát
  if (key === 'AC' || key === 'ON') {
    State.inSolvePrompt = false;
    State.solveTokens = [];
    State.solveCursorIdx = 0;
    State.solveInputStr = '';
    renderAll();
    return true;
  }

  // DEL
  if (key === 'DEL') {
    deleteBeforeCursor();
    renderAll();
    return true;
  }

  // Phím di chuyển cursor
  if (key === 'LEFT') {
    handleLeftKey();
    renderAll();
    return true;
  }
  if (key === 'RIGHT') {
    handleRightKey();
    renderAll();
    return true;
  }

  // EQUALS → Bước 3.3: chạy thuật toán dò nghiệm
  if (key === 'EQUALS') {
    let guess;
    if (State.solveTokens.length === 0) {
      guess = State.vars.X;
    } else {
      try {
        const result = evaluateExpression(State.solveTokens);
        guess = (result && typeof result === 'object' && 're' in result) ? result.re : result;
        if (typeof guess === 'number' && isNaN(guess)) {
          guess = 0;
        }
      } catch (e) {
        State.errorState = { type: e.type || 'Math', msg: e.msg || 'Error' };
        State.inSolvePrompt = false;
        State.solveTokens = [];
        State.solveCursorIdx = 0;
        renderAll();
        return true;
      }
    }
    if (typeof guess === 'number' && !isNaN(guess)) {
      // Keep guess
    } else if (guess && typeof guess === 'object' && 're' in guess) {
      guess = guess.re;
    } else {
      guess = 0;
    }

    State.inSolvePrompt = false;
    State.solveTokens = [];
    State.solveCursorIdx = 0;
    State.solveInputStr = '';

    // Xây dựng chuỗi hiển thị phương trình gốc
    const rawEq = buildRawString(State.tokens);

    // Tách vế trái và vế phải theo token __EQ__
    const eqIdx = State.tokens.findIndex(t => t.raw === '__EQ__');
    let lhsTokens, rhsTokens;
    if (eqIdx >= 0) {
      lhsTokens = State.tokens.slice(0, eqIdx);
      rhsTokens  = State.tokens.slice(eqIdx + 1);
    } else {
      lhsTokens = State.tokens;
      rhsTokens  = []; // RHS = 0
    }

    // Hàm f(x) = LHS(x) - RHS(x)
    function f(x) {
      State.vars.X = x;
      let lhs, rhs;
      try { lhs = evaluateExpression(lhsTokens); } catch(e) { lhs = NaN; }
      if (rhsTokens.length === 0) {
        rhs = 0;
      } else {
        try { rhs = evaluateExpression(rhsTokens); } catch(e) { rhs = NaN; }
      }
      if (isNaN(lhs) || isNaN(rhs)) throw new Error('Domain Error');
      return (typeof lhs === 'object' ? lhs.re : lhs) - (typeof rhs === 'object' ? rhs.re : rhs);
    }

    // Đạo hàm số trị
    function df(x) {
      const h = 1e-7;
      return (f(x + h) - f(x - h)) / (2 * h);
    }

    const TOL = 1e-9;
    const MAX_ITER = 100;
    let root = null;

    // Thuật toán Newton-Raphson
    try {
      let x = guess;
      for (let i = 0; i < MAX_ITER; i++) {
        let fx, dfx;
        try { fx = f(x); } catch(e) { fx = NaN; }
        if (isNaN(fx)) break;
        if (Math.abs(fx) < TOL) { root = x; break; }
        try { dfx = df(x); } catch(e) { dfx = NaN; }
        if (isNaN(dfx) || Math.abs(dfx) < 1e-15) break;
        const xNext = x - fx / dfx;
        if (Math.abs(xNext - x) < TOL) { root = xNext; break; }
        x = xNext;
        if (!isFinite(x)) break;
      }
    } catch(e) { root = null; }

    // Fallback: Bisection trên [-1000, 1000] nếu Newton không tìm được
    if (root === null) {
      try {
        const ranges = [
          [-1e3, 1e3], [-1e6, 1e6],
          [guess - 100, guess + 100],
          [guess - 1e4, guess + 1e4]
        ];
        outer: for (const [a0, b0] of ranges) {
          let lo = a0, hi = b0;
          let flo, fhi;
          try { flo = f(lo); } catch(e) { continue; }
          try { fhi = f(hi); } catch(e) { continue; }
          if (isNaN(flo) || isNaN(fhi)) continue;
          if (flo * fhi > 0) {
            // Chia nhỏ để tìm khoảng đổi dấu
            const N = 1000;
            const step = (b0 - a0) / N;
            let prev = lo, fPrev;
            try { fPrev = f(prev); } catch(e) { continue; }
            for (let k = 1; k <= N; k++) {
              const cur = a0 + k * step;
              let fCur;
              try { fCur = f(cur); } catch(e) { prev = cur; fPrev = NaN; continue; }
              if (!isNaN(fPrev) && fPrev * fCur <= 0) {
                lo = prev; hi = cur; flo = fPrev; fhi = fCur;
                break;
              }
              prev = cur; fPrev = fCur;
            }
            if (flo * fhi > 0) continue;
          }
          // Bisection
          for (let i = 0; i < MAX_ITER; i++) {
            const mid = (lo + hi) / 2;
            let fmid;
            try { fmid = f(mid); } catch(e) { break; }
            if (isNaN(fmid)) break;
            if (Math.abs(fmid) < TOL || (hi - lo) / 2 < TOL) { root = mid; break outer; }
            if (flo * fmid <= 0) { hi = mid; fhi = fmid; }
            else { lo = mid; flo = fmid; }
          }
        }
      } catch(e) { root = null; }
    }

    // Khôi phục X ban đầu nếu không tìm được
    if (root === null) {
      State.vars.X = guess;
      State.errorState = { type: 'Can\'t Solve', msg: 'No solution found' };
      State.hasResult = false;
      renderAll();
      return true;
    }

    // Làm tròn nghiệm nếu rất gần số nguyên
    const roundedRoot = Math.round(root * 1e9) / 1e9;
    root = roundedRoot;

    // Tính sai số L - R
    let lrDiff = 0;
    try {
      State.vars.X = root;
      const lhs = evaluateExpression(lhsTokens);
      const rhs = rhsTokens.length === 0 ? 0 : evaluateExpression(rhsTokens);
      const lhsNum = typeof lhs === 'object' ? lhs.re : lhs;
      const rhsNum = typeof rhs === 'object' ? rhs.re : rhs;
      lrDiff = Math.abs(lhsNum - rhsNum) < TOL ? 0 : lhsNum - rhsNum;
    } catch(e) { lrDiff = 0; }

    // Cập nhật X global
    State.vars.X = root;
    State.Ans = root;
    State.hasResult = true;
    State.errorState = null;

    // Hiển thị kết quả 3 dòng Casio chuẩn
    State.inSolveResult = true;
    State.solveEqStr  = rawEq;
    State.solveValStr = formatResult(root);
    State.solveDiffStr = formatResult(lrDiff);

    renderAll();
    return true;
  }

  // Modifier keys (SHIFT / ALPHA)
  if (key === 'SHIFT') {
    if (State.isAlpha) { State.isAlpha = false; }
    State.isShift = !State.isShift;
    renderAll();
    return true;
  }
  if (key === 'ALPHA') {
    if (State.isShift) { State.isShift = false; }
    State.isAlpha = !State.isAlpha;
    renderAll();
    return true;
  }

  let effectiveKey = key;
  if (State.isShift) {
    effectiveKey = 'SHIFT_' + key;
    State.isShift = false;
  } else if (State.isAlpha) {
    effectiveKey = 'ALPHA_' + key;
    State.isAlpha = false;
  }

  dispatchAction(effectiveKey);
  renderAll();
  return true;
}

// ============================================================
// 18. CONSTANTS & CONVERSIONS
// ============================================================
function showConstants() {
  const constants = {
    '1': 'c (speed of light) = 299792458',
    '2': 'h (Planck) = 6.62607015×10^-34',
    '3': 'e (elementary charge) = 1.602176634×10^-19',
    '4': 'me (electron mass) = 9.1093837×10^-31',
    '5': 'mp (proton mass) = 1.67262192×10^-27',
    '6': 'NA (Avogadro) = 6.02214076×10^23',
    '7': 'k (Boltzmann) = 1.380649×10^-23',
    '8': 'G (gravitational) = 6.67430×10^-11',
    '9': 'R (gas constant) = 8.314462618',
  };
  const key = prompt('Select constant (1-9):\n' +
    '1: c  2: h  3: e  4: me  5: mp\n' +
    '6: NA  7: k  8: G  9: R');
  if (key && constants[key]) {
    dom.screenOutput.textContent = constants[key];
  }
}

function showConversions() {
  const conversions = {
    '1': 'cm → in: ×0.393701',
    '2': 'm → ft: ×3.28084',
    '3': 'km → mi: ×0.621371',
    '4': 'kg → lb: ×2.20462',
    '5': 'g → oz: ×0.035274',
    '6': 'L → gal: ×0.264172',
    '7': '°C → °F: ×1.8+32',
    '8': 'Pa → atm: /101325',
  };
  const key = prompt('Select conversion (1-8):\n' +
    '1: cm→in  2: m→ft  3: km→mi  4: kg→lb\n' +
    '5: g→oz  6: L→gal  7: °C→°F  8: Pa→atm');
  if (key && conversions[key]) {
    dom.screenOutput.textContent = conversions[key];
  }
}

// ============================================================
// 19. MENU NAVIGATION
// ============================================================
function handleMenuKey(key) {
  const total = MODES.length;
  const cols = 4;

  switch (key) {
    case 'RIGHT':
      if (State.menuCursor < total - 1) {
        State.menuCursor++;
      }
      break;
    case 'LEFT':
      if (State.menuCursor > 0) {
        State.menuCursor--;
      }
      break;
    case 'DOWN':
      if (State.menuCursor + cols < total) {
        State.menuCursor += cols;
      }
      break;
    case 'UP':
      if (State.menuCursor - cols >= 0) {
        State.menuCursor -= cols;
      }
      break;
    case 'EQUALS':
      selectMode(State.menuCursor);
      return;
    case 'AC':
    case 'ON':
    case 'MENU':
      State.inMenu = false;
      return;
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
      selectMode(parseInt(key) - 1);
      return;
    case 'ALPHA_NEGATION':
    case 'NEGATION':
    case 'A':
    case 'a':
      selectMode(9);
      return;
    case 'ALPHA_DEGREE':
    case 'DEGREE':
    case 'B':
    case 'b':
      selectMode(10);
      return;
    case 'ALPHA_INVERSE':
    case 'INVERSE':
    case 'C':
    case 'c':
      selectMode(11);
      return;
  }
}

function selectMode(idx) {
  State.mode = MODES[idx].id;
  State.inMenu = false;
  clearAll();
  if (State.mode === 3) {
    State.baseSystem = 'DEC';
  } else if (State.mode === 9) {
    initMode9();
  } else if (State.mode === 10) {
    initModeA();
  }
}

// ============================================================
// MODE 9: EQUATION / FUNCTION SOLVER (Simul & Polynomial)
// ============================================================

State.mode9 = {
  step: 'type_select', // 'type_select' | 'dim_select' | 'input' | 'result'
  type: 'poly',        // 'simul' | 'poly'
  dim: 2,              // 2, 3, 4
  coeffs: [0, 0, 0],   // 1D array for poly, 2D array for simul
  cursorRow: 0,
  cursorCol: 0,
  inputStr: '',
  results: [],
  resultIndex: 0,
  sdMode: 'frac'       // 'frac' | 'dec'
};

function initMode9() {
  State.mode9 = {
    step: 'type_select',
    type: 'poly',
    dim: 2,
    coeffs: [0, 0, 0],
    cursorRow: 0,
    cursorCol: 0,
    inputStr: '',
    results: [],
    resultIndex: 0,
    sdMode: 'frac'
  };
}

function setupMode9Dimension(type, dim) {
  State.mode9.type = type;
  State.mode9.dim = dim;
  State.mode9.step = 'input';
  State.mode9.cursorRow = 0;
  State.mode9.cursorCol = 0;
  State.mode9.inputStr = '';
  State.mode9.results = [];
  State.mode9.resultIndex = 0;
  State.mode9.sdMode = 'frac';

  if (type === 'simul') {
    State.mode9.coeffs = Array.from({ length: dim }, () => Array(dim + 1).fill(0));
  } else {
    State.mode9.coeffs = Array(dim + 1).fill(0);
  }
}

function parseSimpleNumeric(str) {
  if (!str) return 0;
  str = String(str).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 2) {
      const n = parseFloat(parts[0]);
      const d = parseFloat(parts[1]);
      if (!isNaN(n) && !isNaN(d) && d !== 0) return n / d;
    }
  }
  const val = parseFloat(str);
  return isNaN(val) ? 0 : val;
}

function commitMode9Input() {
  const m9 = State.mode9;
  if (m9.inputStr !== '') {
    const val = parseSimpleNumeric(m9.inputStr);
    if (m9.type === 'poly') {
      m9.coeffs[m9.cursorCol] = val;
    } else {
      m9.coeffs[m9.cursorRow][m9.cursorCol] = val;
    }
    m9.inputStr = '';
  }
}

function advanceMode9Cursor() {
  const m9 = State.mode9;
  if (m9.type === 'poly') {
    if (m9.cursorCol < m9.dim) {
      m9.cursorCol++;
    } else {
      solveMode9();
    }
  } else {
    const maxCols = m9.dim + 1;
    if (m9.cursorCol < maxCols - 1) {
      m9.cursorCol++;
    } else if (m9.cursorRow < m9.dim - 1) {
      m9.cursorRow++;
      m9.cursorCol = 0;
    } else {
      solveMode9();
    }
  }
}

function renderMode9Screen() {
  const el = dom.mode9Screen;
  if (!el) return;

  const m9 = State.mode9;

  if (m9.step === 'type_select') {
    el.innerHTML = `
      <div class="m9-branch-menu">
        <div class="m9-branch-item" data-type="simul">1:Simul Equation</div>
        <div class="m9-branch-item" data-type="poly">2:Polynomial</div>
      </div>
    `;
    const bSimul = el.querySelector('[data-type="simul"]');
    const bPoly = el.querySelector('[data-type="poly"]');
    if (bSimul) {
      bSimul.addEventListener('click', () => {
        m9.type = 'simul';
        m9.step = 'dim_select';
        renderAll();
      });
    }
    if (bPoly) {
      bPoly.addEventListener('click', () => {
        m9.type = 'poly';
        m9.step = 'dim_select';
        renderAll();
      });
    }
    return;
  }

  if (m9.step === 'dim_select') {
    const isSimul = m9.type === 'simul';
    el.innerHTML = `
      <div class="m9-dim-select">
        <div class="m9-dim-title">${isSimul ? 'Simul Equation' : 'Polynomial'}</div>
        <div class="m9-dim-subtitle">${isSimul ? 'Unknowns?' : 'Degree?'}</div>
        <div class="m9-dim-options">2 ~ 4</div>
      </div>
    `;
    return;
  }

  if (m9.step === 'input') {
    if (m9.type === 'poly') {
      const deg = m9.dim;
      const names = ['a', 'b', 'c', 'd', 'e'];
      let headerFormula = '';
      if (deg === 2) headerFormula = 'aX² + bX + c = 0';
      else if (deg === 3) headerFormula = 'aX³ + bX² + cX + d = 0';
      else if (deg === 4) headerFormula = 'aX⁴ + bX³ + cX² + dX + e = 0';

      const curName = names[m9.cursorCol] || 'a';
      const curVal = m9.inputStr !== '' ? m9.inputStr : formatValueAutoFraction(m9.coeffs[m9.cursorCol]);

      let previewTags = '';
      for (let i = 0; i <= deg; i++) {
        const isActive = (i === m9.cursorCol);
        const valDisp = isActive && m9.inputStr !== '' ? m9.inputStr : formatValueAutoFraction(m9.coeffs[i]);
        previewTags += `<div class="m9-poly-coeff-tag ${isActive ? 'active' : ''}">${names[i]}=${valDisp}</div>`;
      }

      el.innerHTML = `
        <div class="m9-poly-input">
          <div class="m9-poly-header">${headerFormula}</div>
          <div class="m9-poly-coeffs-preview">${previewTags}</div>
          <div class="m9-input-line">
            <span>${curName} =</span>
            <span>${curVal}<span class="cursor-blink"></span></span>
          </div>
        </div>
      `;
    } else {
      const rows = m9.dim;
      const cols = m9.dim + 1;
      const varNames = ['x', 'y', 'z', 't'];

      let gridHTML = '';
      for (let r = 0; r < rows; r++) {
        gridHTML += '<div class="m9-matrix-row">';
        for (let c = 0; c < cols; c++) {
          const isActive = (r === m9.cursorRow && c === m9.cursorCol);
          const cellVal = isActive && m9.inputStr !== '' ? m9.inputStr : formatValueAutoFraction(m9.coeffs[r][c]);
          gridHTML += `<div class="m9-matrix-cell ${isActive ? 'active' : ''}">${cellVal}</div>`;
        }
        gridHTML += '</div>';
      }

      let curLabel = '';
      if (m9.cursorCol < m9.dim) {
        curLabel = `${varNames[m9.cursorCol]}${m9.cursorRow + 1} =`;
      } else {
        curLabel = `const${m9.cursorRow + 1} =`;
      }
      const curVal = m9.inputStr !== '' ? m9.inputStr : formatValueAutoFraction(m9.coeffs[m9.cursorRow][m9.cursorCol]);

      el.innerHTML = `
        <div class="m9-matrix-wrap">
          <div class="m9-matrix-grid">${gridHTML}</div>
          <div class="m9-input-line">
            <span>${curLabel}</span>
            <span>${curVal}<span class="cursor-blink"></span></span>
          </div>
        </div>
      `;
    }
    return;
  }

  if (m9.step === 'result') {
    const resItem = m9.results[m9.resultIndex];
    if (!resItem) {
      el.innerHTML = '<div class="m9-result-screen"><div>Không có nghiệm</div></div>';
      return;
    }

    const hasPrev = m9.resultIndex > 0;
    const hasNext = m9.resultIndex < m9.results.length - 1;
    const navArrow = (hasPrev ? '▲' : '') + (hasNext ? '▼' : '');

    let valDisplay = '';
    if (resItem.isMsg) {
      valDisplay = `<div class="m9-result-val" style="font-size: 13.5px; text-align: center;">${resItem.val}</div>`;
    } else {
      let formattedVal = '';
      if (m9.sdMode === 'dec') {
        if (resItem.val instanceof Complex || (typeof resItem.val === 'object' && 're' in resItem.val)) {
          formattedVal = formatComplex(resItem.val);
        } else {
          formattedVal = formatRealNumber(resItem.val);
        }
      } else {
        formattedVal = formatValueAutoFraction(resItem.val);
      }
      valDisplay = `<div class="m9-result-val">${formattedVal}</div>`;
    }

    el.innerHTML = `
      <div class="m9-result-screen">
        <div class="m9-result-top">
          <span>${resItem.label}</span>
          <span class="m9-result-nav-ind">${navArrow}</span>
        </div>
        <div class="m9-result-main">${valDisplay}</div>
        <div class="m9-result-bottom-hint">
          <span>[=] Tiếp theo</span>
          <span>[S⇔D] Phân số</span>
          <span>[AC] Sửa</span>
        </div>
      </div>
    `;
    return;
  }
}

function handleMode9Key(key) {
  const m9 = State.mode9;

  if (key === 'ON' || key === 'MENU') {
    State.mode = 1;
    State.inMenu = (key === 'MENU');
    clearAll();
    return;
  }

  if (m9.step === 'type_select') {
    if (key === '1') {
      m9.type = 'simul';
      m9.step = 'dim_select';
    } else if (key === '2') {
      m9.type = 'poly';
      m9.step = 'dim_select';
    } else if (key === 'AC') {
      State.mode = 1;
      clearAll();
    }
    return;
  }

  if (m9.step === 'dim_select') {
    if (key === '2' || key === '3' || key === '4') {
      setupMode9Dimension(m9.type, parseInt(key, 10));
    } else if (key === 'AC') {
      m9.step = 'type_select';
    }
    return;
  }

  if (m9.step === 'input') {
    if (/^[0-9]$/.test(key)) {
      m9.inputStr += key;
      return;
    }
    if (key === 'DOT') {
      if (!m9.inputStr.includes('.')) m9.inputStr += '.';
      return;
    }
    if (key === 'MINUS' || key === 'NEGATION' || key === 'ALPHA_NEGATION') {
      if (m9.inputStr === '') m9.inputStr = '-';
      else if (!m9.inputStr.startsWith('-')) m9.inputStr = '-' + m9.inputStr;
      else m9.inputStr = m9.inputStr.substring(1);
      return;
    }
    if (key === 'FRAC') {
      if (m9.inputStr !== '' && !m9.inputStr.includes('/')) {
        m9.inputStr += '/';
      }
      return;
    }
    if (key === 'DEL') {
      if (m9.inputStr.length > 0) {
        m9.inputStr = m9.inputStr.slice(0, -1);
      }
      return;
    }
    if (key === 'AC') {
      if (m9.inputStr !== '') {
        m9.inputStr = '';
      } else {
        if (m9.type === 'poly') {
          m9.coeffs = Array(m9.dim + 1).fill(0);
        } else {
          m9.coeffs = Array.from({ length: m9.dim }, () => Array(m9.dim + 1).fill(0));
        }
        m9.cursorCol = 0;
        m9.cursorRow = 0;
      }
      return;
    }
    if (key === 'EQUALS') {
      commitMode9Input();
      advanceMode9Cursor();
      return;
    }
    // Arrow navigation
    if (key === 'RIGHT') {
      commitMode9Input();
      if (m9.type === 'poly') {
        if (m9.cursorCol < m9.dim) m9.cursorCol++;
      } else {
        if (m9.cursorCol < m9.dim) m9.cursorCol++;
      }
      return;
    }
    if (key === 'LEFT') {
      commitMode9Input();
      if (m9.cursorCol > 0) m9.cursorCol--;
      return;
    }
    if (key === 'DOWN') {
      commitMode9Input();
      if (m9.type === 'simul') {
        if (m9.cursorRow < m9.dim - 1) m9.cursorRow++;
      }
      return;
    }
    if (key === 'UP') {
      commitMode9Input();
      if (m9.type === 'simul') {
        if (m9.cursorRow > 0) m9.cursorRow--;
      }
      return;
    }
    return;
  }

  if (m9.step === 'result') {
    if (key === 'EQUALS' || key === 'DOWN') {
      if (m9.resultIndex < m9.results.length - 1) {
        m9.resultIndex++;
      }
      return;
    }
    if (key === 'UP') {
      if (m9.resultIndex > 0) {
        m9.resultIndex--;
      }
      return;
    }
    if (key === 'SD') {
      m9.sdMode = (m9.sdMode === 'frac' ? 'dec' : 'frac');
      return;
    }
    if (key === 'AC') {
      m9.step = 'input';
      m9.inputStr = '';
      if (m9.type === 'poly') {
        m9.coeffs = Array(m9.dim + 1).fill(0);
      } else {
        m9.coeffs = Array.from({ length: m9.dim }, () => Array(m9.dim + 1).fill(0));
      }
      m9.cursorCol = 0;
      m9.cursorRow = 0;
      return;
    }
  }
}

function solveMode9() {
  const m9 = State.mode9;
  m9.results = [];
  m9.resultIndex = 0;
  m9.sdMode = 'frac';

  if (m9.type === 'simul') {
    m9.results = solveSimul(m9.coeffs);
  } else {
    m9.results = solvePolynomial(m9.coeffs);
  }
  m9.step = 'result';
}

function solveSimul(aug) {
  const n = aug.length;
  const A = aug.map(row => row.slice());

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    if (Math.abs(A[maxRow][i]) > 1e-12) {
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      const pivot = A[i][i];
      for (let j = i; j <= n; j++) {
        A[i][j] /= pivot;
      }
      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = A[k][i];
          for (let j = i; j <= n; j++) {
            A[k][j] -= factor * A[i][j];
          }
        }
      }
    }
  }

  for (let i = 0; i < n; i++) {
    let allZero = true;
    for (let j = 0; j < n; j++) {
      if (Math.abs(A[i][j]) > 1e-9) {
        allZero = false;
        break;
      }
    }
    if (allZero) {
      if (Math.abs(A[i][n]) > 1e-7) {
        return [{ label: 'Kết quả', val: 'No Solution', isMsg: true }];
      } else {
        return [{ label: 'Kết quả', val: 'Infinite Solutions', isMsg: true }];
      }
    }
  }

  const varNames = ['x', 'y', 'z', 't'];
  const res = [];
  for (let i = 0; i < n; i++) {
    const val = Math.abs(A[i][n]) < 1e-12 ? 0 : A[i][n];
    res.push({ label: `${varNames[i]} =`, val: val });
  }
  return res;
}

function solvePolynomial(coeffs) {
  const deg = coeffs.length - 1;
  if (deg === 2) {
    return solveQuadratic(coeffs[0], coeffs[1], coeffs[2]);
  } else if (deg === 3) {
    return solveCubic(coeffs[0], coeffs[1], coeffs[2], coeffs[3]);
  } else if (deg === 4) {
    return solveQuartic(coeffs[0], coeffs[1], coeffs[2], coeffs[3], coeffs[4]);
  }
  return [];
}

function solveQuadratic(a, b, c) {
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) {
      return [{ label: 'Kết quả', val: Math.abs(c) < 1e-12 ? 'Infinite Solutions' : 'No Solution', isMsg: true }];
    }
    return [{ label: 'x =', val: -c / b }];
  }

  const delta = b * b - 4 * a * c;
  const res = [];

  if (delta > 1e-11) {
    const sqrtD = Math.sqrt(delta);
    const x1 = (-b + sqrtD) / (2 * a);
    const x2 = (-b - sqrtD) / (2 * a);
    res.push({ label: 'x1 =', val: x1 });
    res.push({ label: 'x2 =', val: x2 });
  } else if (Math.abs(delta) <= 1e-11) {
    const x = -b / (2 * a);
    res.push({ label: 'x =', val: x });
  } else {
    const re = -b / (2 * a);
    const im = Math.sqrt(-delta) / Math.abs(2 * a);
    res.push({ label: 'x1 =', val: new Complex(re, im) });
    res.push({ label: 'x2 =', val: new Complex(re, -im) });
  }

  // Extrema: Vertex of parabola
  const xv = -b / (2 * a);
  const yv = c - (b * b) / (4 * a);
  if (a > 0) {
    res.push({ label: 'X-Value Minimum =', val: xv });
    res.push({ label: 'Y-Value Minimum =', val: yv });
  } else {
    res.push({ label: 'X-Value Maximum =', val: xv });
    res.push({ label: 'Y-Value Maximum =', val: yv });
  }

  return res;
}

function solveCubic(a, b, c, d) {
  if (Math.abs(a) < 1e-12) return solveQuadratic(b, c, d);

  const a1 = b / a;
  const a2 = c / a;
  const a3 = d / a;

  const Q = (3 * a2 - a1 * a1) / 9;
  const R = (9 * a1 * a2 - 27 * a3 - 2 * a1 * a1 * a1) / 54;
  const D = Q * Q * Q + R * R;

  const res = [];

  if (D < -1e-11) {
    const theta = Math.acos(Math.max(-1, Math.min(1, R / Math.sqrt(-Q * Q * Q))));
    const sqrtQ = 2 * Math.sqrt(-Q);
    const x1 = sqrtQ * Math.cos(theta / 3) - a1 / 3;
    const x2 = sqrtQ * Math.cos((theta + 2 * Math.PI) / 3) - a1 / 3;
    const x3 = sqrtQ * Math.cos((theta + 4 * Math.PI) / 3) - a1 / 3;
    const sorted = [x1, x2, x3].sort((m, n) => n - m);
    res.push({ label: 'x1 =', val: sorted[0] });
    res.push({ label: 'x2 =', val: sorted[1] });
    res.push({ label: 'x3 =', val: sorted[2] });
  } else if (Math.abs(D) <= 1e-11) {
    const S = Math.cbrt(R);
    const x1 = 2 * S - a1 / 3;
    const x2 = -S - a1 / 3;
    res.push({ label: 'x1 =', val: x1 });
    res.push({ label: 'x2 =', val: x2 });
  } else {
    const sqrtD = Math.sqrt(D);
    const S = Math.cbrt(R + sqrtD);
    const T = Math.cbrt(R - sqrtD);
    const x1 = (S + T) - a1 / 3;
    const re = -(S + T) / 2 - a1 / 3;
    const im = Math.abs((Math.sqrt(3) / 2) * (S - T));
    res.push({ label: 'x1 =', val: x1 });
    res.push({ label: 'x2 =', val: new Complex(re, im) });
    res.push({ label: 'x3 =', val: new Complex(re, -im) });
  }

  // Extrema: derivative 3ax^2 + 2bx + c = 0
  const dDelta = 4 * b * b - 12 * a * c;
  if (dDelta > 1e-10) {
    const sqrtDD = Math.sqrt(dDelta);
    const r1 = (-2 * b + sqrtDD) / (6 * a);
    const r2 = (-2 * b - sqrtDD) / (6 * a);
    const evalY = (x) => a * x * x * x + b * x * x + c * x + d;
    const y1 = evalY(r1);
    const y2 = evalY(r2);

    let maxPt = { x: r1, y: y1 };
    let minPt = { x: r2, y: y2 };
    if (a > 0) {
      if (r1 > r2) {
        maxPt = { x: r2, y: y2 };
        minPt = { x: r1, y: y1 };
      }
    } else {
      if (r1 < r2) {
        maxPt = { x: r2, y: y2 };
        minPt = { x: r1, y: y1 };
      }
    }
    res.push({ label: 'x-Value Local Max =', val: maxPt.x });
    res.push({ label: 'y-Value Local Max =', val: maxPt.y });
    res.push({ label: 'x-Value Local Min =', val: minPt.x });
    res.push({ label: 'y-Value Local Min =', val: minPt.y });
  }

  return res;
}

function solveQuartic(a, b, c, d, e) {
  if (Math.abs(a) < 1e-12) return solveCubic(b, c, d, e);

  const p = [e / a, d / a, c / a, b / a, 1];
  let roots = [
    new Complex(0.4, 0.9),
    new Complex(-0.7, 0.8),
    new Complex(-0.5, -0.6),
    new Complex(0.8, -0.7)
  ];

  const evalPoly = (z) => {
    let res = new Complex(p[4], 0);
    for (let i = 3; i >= 0; i--) {
      res = res.mul(z).add(new Complex(p[i], 0));
    }
    return res;
  };

  for (let iter = 0; iter < 120; iter++) {
    for (let i = 0; i < 4; i++) {
      let denom = new Complex(1, 0);
      for (let j = 0; j < 4; j++) {
        if (i !== j) {
          denom = denom.mul(roots[i].sub(roots[j]));
        }
      }
      if (denom.abs() > 1e-14) {
        const num = evalPoly(roots[i]);
        roots[i] = roots[i].sub(num.div(denom));
      }
    }
  }

  const res = [];
  roots.forEach((z, idx) => {
    const cleanRe = Math.abs(z.re) < 1e-10 ? 0 : z.re;
    const cleanIm = Math.abs(z.im) < 1e-7 ? 0 : z.im;
    if (cleanIm === 0) {
      res.push({ label: `x${idx + 1} =`, val: cleanRe });
    } else {
      res.push({ label: `x${idx + 1} =`, val: new Complex(cleanRe, cleanIm) });
    }
  });

  return res;
}

// ============================================================
// MODE A: INEQUALITY SOLVER (Polynomial Degree 2, 3, 4)
// ============================================================

State.modeA = {
  step: 'degree_select', // 'degree_select' | 'type_select' | 'input' | 'result'
  degree: 2,             // 2, 3, 4
  type: 1,               // 1: > 0, 2: < 0, 3: >= 0, 4: <= 0
  coeffs: [0, 0, 0],
  cursorCol: 0,
  inputStr: '',
  resultSummary: '',
  resultFormattedFrac: '',
  resultFormattedDec: '',
  sdMode: 'frac'
};

function initModeA() {
  State.modeA = {
    step: 'degree_select',
    degree: 2,
    type: 1,
    coeffs: [0, 0, 0],
    cursorCol: 0,
    inputStr: '',
    resultSummary: '',
    resultFormattedFrac: '',
    resultFormattedDec: '',
    sdMode: 'frac'
  };
}

function setupModeADegree(deg) {
  State.modeA.degree = deg;
  State.modeA.coeffs = Array(deg + 1).fill(0);
  State.modeA.cursorCol = 0;
  State.modeA.inputStr = '';
  State.modeA.step = 'type_select';
}

function commitModeAInput() {
  const mA = State.modeA;
  if (mA.inputStr !== '') {
    const val = parseSimpleNumeric(mA.inputStr);
    mA.coeffs[mA.cursorCol] = val;
    mA.inputStr = '';
  }
}

function advanceModeACursor() {
  const mA = State.modeA;
  if (mA.cursorCol < mA.degree) {
    mA.cursorCol++;
  } else {
    solveModeA();
  }
}

function formatInequalityFormula(deg, type) {
  const opMap = { 1: ' > 0', 2: ' < 0', 3: ' ≥ 0', 4: ' ≤ 0' };
  const op = opMap[type] || ' > 0';
  if (deg === 2) return `aX² + bX + c${op}`;
  if (deg === 3) return `aX³ + bX² + cX + d${op}`;
  if (deg === 4) return `aX⁴ + bX³ + cX² + dX + e${op}`;
  return `aXⁿ + ...${op}`;
}

function renderModeAScreen() {
  const el = dom.modeAScreen;
  if (!el) return;

  const mA = State.modeA;

  if (mA.step === 'degree_select') {
    el.innerHTML = `
      <div class="mA-degree-select">
        <div class="mA-deg-title">Polynomial</div>
        <div class="mA-deg-sub">Degree?</div>
        <div class="mA-deg-options">Select 2~4</div>
      </div>
    `;
    return;
  }

  if (mA.step === 'type_select') {
    const deg = mA.degree;
    let listHTML = '';
    for (let t = 1; t <= 4; t++) {
      const isSelected = (mA.type === t);
      listHTML += `<div class="mA-type-item ${isSelected ? 'selected' : ''}" data-type="${t}">${t}: ${formatInequalityFormula(deg, t)}</div>`;
    }
    el.innerHTML = `
      <div class="mA-type-list">
        ${listHTML}
      </div>
    `;
    el.querySelectorAll('.mA-type-item').forEach(item => {
      item.addEventListener('click', () => {
        const t = parseInt(item.dataset.type, 10);
        mA.type = t;
        mA.step = 'input';
        mA.cursorCol = 0;
        renderAll();
      });
    });
    return;
  }

  if (mA.step === 'input') {
    const deg = mA.degree;
    const names = ['a', 'b', 'c', 'd', 'e'];
    const curName = names[mA.cursorCol] || 'a';
    const curVal = mA.inputStr !== '' ? mA.inputStr : formatValueAutoFraction(mA.coeffs[mA.cursorCol]);

    let previewTags = '';
    for (let i = 0; i <= deg; i++) {
      const isActive = (i === mA.cursorCol);
      const valDisp = isActive && mA.inputStr !== '' ? mA.inputStr : formatValueAutoFraction(mA.coeffs[i]);
      previewTags += `<div class="mA-poly-coeff-tag ${isActive ? 'active' : ''}">${names[i]}=${valDisp}</div>`;
    }

    el.innerHTML = `
      <div class="mA-poly-input">
        <div class="mA-poly-header">${formatInequalityFormula(deg, mA.type)}</div>
        <div class="mA-poly-coeffs-preview">${previewTags}</div>
        <div class="mA-input-line">
          <span>${curName} =</span>
          <span>${curVal}<span class="cursor-blink"></span></span>
        </div>
      </div>
    `;
    return;
  }

  if (mA.step === 'result') {
    const dispVal = (mA.sdMode === 'dec' ? mA.resultFormattedDec : mA.resultFormattedFrac) || 'No Solution';

    el.innerHTML = `
      <div class="mA-result-screen">
        <div class="mA-result-top">
          <span>${mA.resultSummary}</span>
        </div>
        <div class="mA-result-main">
          <div class="mA-result-val">${dispVal}</div>
        </div>
        <div class="mA-result-bottom-hint">
          <span>[AC] Sửa</span>
          <span>[OPTN] Dấu</span>
          <span>[S⇔D] Phân số</span>
        </div>
      </div>
    `;
    return;
  }
}

function handleModeAKey(key) {
  const mA = State.modeA;

  if (key === 'ON' || key === 'MENU') {
    State.mode = 1;
    State.inMenu = (key === 'MENU');
    clearAll();
    return;
  }

  if (mA.step === 'degree_select') {
    if (key === '2' || key === '3' || key === '4') {
      setupModeADegree(parseInt(key, 10));
    } else if (key === 'AC') {
      State.mode = 1;
      clearAll();
    }
    return;
  }

  if (mA.step === 'type_select') {
    if (key === '1' || key === '2' || key === '3' || key === '4') {
      mA.type = parseInt(key, 10);
      mA.step = 'input';
      mA.cursorCol = 0;
    } else if (key === 'AC') {
      mA.step = 'degree_select';
    }
    return;
  }

  if (mA.step === 'input') {
    if (/^[0-9]$/.test(key)) {
      mA.inputStr += key;
      return;
    }
    if (key === 'DOT') {
      if (!mA.inputStr.includes('.')) mA.inputStr += '.';
      return;
    }
    if (key === 'MINUS' || key === 'NEGATION' || key === 'ALPHA_NEGATION') {
      if (mA.inputStr === '') mA.inputStr = '-';
      else if (!mA.inputStr.startsWith('-')) mA.inputStr = '-' + mA.inputStr;
      else mA.inputStr = mA.inputStr.substring(1);
      return;
    }
    if (key === 'FRAC') {
      if (mA.inputStr !== '' && !mA.inputStr.includes('/')) {
        mA.inputStr += '/';
      }
      return;
    }
    if (key === 'DEL') {
      if (mA.inputStr.length > 0) {
        mA.inputStr = mA.inputStr.slice(0, -1);
      }
      return;
    }
    if (key === 'AC') {
      if (mA.inputStr !== '') {
        mA.inputStr = '';
      } else {
        mA.coeffs = Array(mA.degree + 1).fill(0);
        mA.cursorCol = 0;
      }
      return;
    }
    if (key === 'EQUALS') {
      commitModeAInput();
      advanceModeACursor();
      return;
    }
    if (key === 'OPTN') {
      commitModeAInput();
      mA.step = 'type_select';
      return;
    }
    if (key === 'RIGHT') {
      commitModeAInput();
      if (mA.cursorCol < mA.degree) mA.cursorCol++;
      return;
    }
    if (key === 'LEFT') {
      commitModeAInput();
      if (mA.cursorCol > 0) mA.cursorCol--;
      return;
    }
    if (key === 'UP' || key === 'DOWN') {
      commitModeAInput();
      return;
    }
    return;
  }

  if (mA.step === 'result') {
    if (key === 'AC') {
      mA.step = 'input';
      mA.inputStr = '';
      mA.coeffs = Array(mA.degree + 1).fill(0);
      mA.cursorCol = 0;
      return;
    }
    if (key === 'OPTN') {
      mA.step = 'type_select';
      return;
    }
    if (key === 'SD') {
      mA.sdMode = (mA.sdMode === 'frac' ? 'dec' : 'frac');
      return;
    }
    if (key === 'EQUALS' || key === 'DOWN') {
      mA.step = 'input';
      mA.inputStr = '';
      return;
    }
  }
}

function solveModeA() {
  const mA = State.modeA;
  const res = solveInequalityEngine(mA.degree, mA.type, mA.coeffs);
  mA.resultSummary = res.summary;
  mA.resultFormattedFrac = res.valFrac;
  mA.resultFormattedDec = res.valDec;
  mA.sdMode = 'frac';
  mA.step = 'result';
}

function formatNumFracHTMLModeA(val) {
  if (Math.abs(val) < 1e-12) return '0';
  const frac = numberToFraction(val);
  if (frac) {
    if (frac.isInt) return String(frac.n);
    const sign = frac.n < 0 ? '-' : '';
    const absN = Math.abs(frac.n);
    return `${sign}<span class="lcd-frac-box"><span class="lcd-frac-num">${absN}</span><span class="lcd-frac-den">${frac.d}</span></span>`;
  }
  return val.toFixed(4).replace(/\.?0+$/, '');
}

function formatNumDecModeA(val) {
  if (Math.abs(val) < 1e-12) return '0';
  return val.toFixed(6).replace(/\.?0+$/, '');
}

function evalPolyModeA(coeffs, x) {
  let res = coeffs[0];
  for (let i = 1; i < coeffs.length; i++) {
    res = res * x + coeffs[i];
  }
  return res;
}

function solvePolyRootsModeA(coeffs) {
  let c = coeffs.slice();
  while (c.length > 1 && Math.abs(c[0]) < 1e-12) {
    c.shift();
  }
  const deg = c.length - 1;
  if (deg <= 0) return [];

  if (deg === 1) {
    return [-c[1] / c[0]];
  }

  if (deg === 2) {
    const [a, b, d] = c;
    const delta = b * b - 4 * a * d;
    if (delta > 1e-11) {
      const sqrtD = Math.sqrt(delta);
      const r1 = (-b - sqrtD) / (2 * a);
      const r2 = (-b + sqrtD) / (2 * a);
      return [r1, r2].sort((x, y) => x - y);
    } else if (Math.abs(delta) <= 1e-11) {
      return [-b / (2 * a)];
    }
    return [];
  }

  if (deg === 3) {
    const [a, b, d, e] = c;
    const a1 = b / a, a2 = d / a, a3 = e / a;
    const Q = (3 * a2 - a1 * a1) / 9;
    const R = (9 * a1 * a2 - 27 * a3 - 2 * a1 * a1 * a1) / 54;
    const D = Q * Q * Q + R * R;
    const roots = [];
    if (D < -1e-11) {
      const theta = Math.acos(Math.max(-1, Math.min(1, R / Math.sqrt(-Q * Q * Q))));
      const sqrtQ = 2 * Math.sqrt(-Q);
      roots.push(sqrtQ * Math.cos(theta / 3) - a1 / 3);
      roots.push(sqrtQ * Math.cos((theta + 2 * Math.PI) / 3) - a1 / 3);
      roots.push(sqrtQ * Math.cos((theta + 4 * Math.PI) / 3) - a1 / 3);
    } else if (Math.abs(D) <= 1e-11) {
      const S = Math.cbrt(R);
      roots.push(2 * S - a1 / 3);
      roots.push(-S - a1 / 3);
    } else {
      const sqrtD = Math.sqrt(D);
      const S = Math.cbrt(R + sqrtD);
      const T = Math.cbrt(R - sqrtD);
      roots.push((S + T) - a1 / 3);
    }
    return roots.sort((x, y) => x - y);
  }

  if (deg === 4) {
    const [a, b, d, e, f] = c;
    const p = [f / a, e / a, d / a, b / a, 1];
    let roots = [
      { re: 0.4, im: 0.9 },
      { re: -0.7, im: 0.8 },
      { re: -0.5, im: -0.6 },
      { re: 0.8, im: -0.7 }
    ];

    const cMul = (u, v) => ({ re: u.re * v.re - u.im * v.im, im: u.re * v.im + u.im * v.re });
    const cAdd = (u, v) => ({ re: u.re + v.re, im: u.im + v.im });
    const cSub = (u, v) => ({ re: u.re - v.re, im: u.im - v.im });
    const cDiv = (u, v) => {
      const denom = v.re * v.re + v.im * v.im;
      return { re: (u.re * v.re + u.im * v.im) / denom, im: (u.im * v.re - u.re * v.im) / denom };
    };
    const cAbs = (u) => Math.hypot(u.re, u.im);

    const evalP = (z) => {
      let res = { re: p[4], im: 0 };
      for (let i = 3; i >= 0; i--) {
        res = cAdd(cMul(res, z), { re: p[i], im: 0 });
      }
      return res;
    };

    for (let iter = 0; iter < 120; iter++) {
      for (let i = 0; i < 4; i++) {
        let denom = { re: 1, im: 0 };
        for (let j = 0; j < 4; j++) {
          if (i !== j) {
            denom = cMul(denom, cSub(roots[i], roots[j]));
          }
        }
        if (cAbs(denom) > 1e-14) {
          const num = evalP(roots[i]);
          roots[i] = cSub(roots[i], cDiv(num, denom));
        }
      }
    }

    const realRoots = [];
    for (const z of roots) {
      if (Math.abs(z.im) < 1e-5) {
        let r = z.re;
        for (let n = 0; n < 10; n++) {
          const val = evalPolyModeA(c, r);
          const dVal = 4 * a * r * r * r + 3 * b * r * r + 2 * d * r + e;
          if (Math.abs(dVal) > 1e-12) {
            r -= val / dVal;
          }
        }
        realRoots.push(r);
      }
    }
    return realRoots.sort((x, y) => x - y);
  }

  return [];
}

function cleanRootsModeA(rawRoots) {
  if (!rawRoots || rawRoots.length === 0) return [];
  const sorted = rawRoots.slice().sort((a, b) => a - b);
  const unique = [];
  for (const r of sorted) {
    if (unique.length === 0 || Math.abs(r - unique[unique.length - 1]) > 1e-6) {
      unique.push(Math.abs(r) < 1e-10 ? 0 : r);
    }
  }
  return unique;
}

function solveInequalityEngine(degree, type, coeffs) {
  // type: 1: > 0, 2: < 0, 3: >= 0, 4: <= 0
  const isStrict = (type === 1 || type === 2);
  const opSymbol = isStrict ? '<' : '≤';

  let allZero = coeffs.every(v => Math.abs(v) < 1e-12);
  if (allZero) {
    if (type === 3 || type === 4) {
      return {
        summary: 'All Real Numbers',
        valFrac: 'All Real Numbers',
        valDec: 'All Real Numbers'
      };
    } else {
      return {
        summary: 'No Solution',
        valFrac: 'No Solution',
        valDec: 'No Solution'
      };
    }
  }

  const roots = cleanRootsModeA(solvePolyRootsModeA(coeffs));
  const k = roots.length;

  const intervalsValid = [];
  for (let j = 0; j <= k; j++) {
    let testX = 0;
    if (k === 0) {
      testX = 0;
    } else if (j === 0) {
      testX = roots[0] - 1;
    } else if (j === k) {
      testX = roots[k - 1] + 1;
    } else {
      testX = (roots[j - 1] + roots[j]) / 2;
    }
    const val = evalPolyModeA(coeffs, testX);
    let ok = false;
    if (type === 1) ok = (val > 1e-9);
    else if (type === 2) ok = (val < -1e-9);
    else if (type === 3) ok = (val >= -1e-9);
    else if (type === 4) ok = (val <= 1e-9);
    intervalsValid.push(ok);
  }

  const rootsValid = [];
  for (let i = 0; i < k; i++) {
    if (type === 1 || type === 2) rootsValid.push(false);
    else rootsValid.push(true);
  }

  const allIntervalsOk = intervalsValid.every(Boolean);
  const allRootsOk = (k === 0) || rootsValid.every(Boolean);
  if (allIntervalsOk && allRootsOk) {
    return {
      summary: 'All Real Numbers',
      valFrac: 'All Real Numbers',
      valDec: 'All Real Numbers'
    };
  }

  const noIntervalsOk = intervalsValid.every(v => !v);
  const noRootsOk = rootsValid.every(v => !v);
  if (noIntervalsOk && noRootsOk) {
    return {
      summary: 'No Solution',
      valFrac: 'No Solution',
      valDec: 'No Solution'
    };
  }

  // Build raw list of valid intervals:
  const rawIntervals = [];
  for (let j = 0; j <= k; j++) {
    if (intervalsValid[j]) {
      const left = j === 0 ? null : roots[j - 1];
      const right = j === k ? null : roots[j];
      rawIntervals.push({ left, right, leftIdx: j - 1, rightIdx: j });
    }
  }

  // Merge adjacent intervals only if boundary root is valid
  const mergedIntervals = [];
  for (let idx = 0; idx < rawIntervals.length; idx++) {
    const cur = rawIntervals[idx];
    if (mergedIntervals.length === 0) {
      mergedIntervals.push({ left: cur.left, right: cur.right, leftIdx: cur.leftIdx, rightIdx: cur.rightIdx });
    } else {
      const prev = mergedIntervals[mergedIntervals.length - 1];
      if (prev.rightIdx === cur.leftIdx && prev.rightIdx !== null && rootsValid[prev.rightIdx] === true) {
        prev.right = cur.right;
        prev.rightIdx = cur.rightIdx;
      } else {
        mergedIntervals.push({ left: cur.left, right: cur.right, leftIdx: cur.leftIdx, rightIdx: cur.rightIdx });
      }
    }
  }

  // Add isolated valid root points
  const pieces = mergedIntervals.map(it => ({ ...it, isPoint: false }));
  for (let i = 0; i < k; i++) {
    if (rootsValid[i]) {
      const leftIntOk = intervalsValid[i];
      const rightIntOk = intervalsValid[i + 1];
      if (!leftIntOk && !rightIntOk) {
        pieces.push({ left: roots[i], right: roots[i], isPoint: true });
      }
    }
  }

  // Sort pieces
  pieces.sort((p1, p2) => {
    const v1 = p1.left !== null ? p1.left : -Infinity;
    const v2 = p2.left !== null ? p2.left : -Infinity;
    return v1 - v2;
  });

  // Check if pieces form a punctured line: e.g. x < a and a < x
  if (pieces.length === 2 && pieces[0].left === null && pieces[1].right === null && pieces[0].right === pieces[1].left && isStrict) {
    const a = pieces[0].right;
    const summary = `x < a , a < x`;
    const valFrac = `x < ${formatNumFracHTMLModeA(a)} , ${formatNumFracHTMLModeA(a)} < x`;
    const valDec = `x < ${formatNumDecModeA(a)} , ${formatNumDecModeA(a)} < x`;
    return { summary, valFrac, valDec };
  }

  const summaryParts = [];
  const fracParts = [];
  const decParts = [];

  const letterNames = ['a', 'b', 'c', 'd', 'e'];
  let lIdx = 0;

  for (const piece of pieces) {
    if (piece.isPoint) {
      const a = letterNames[lIdx++];
      summaryParts.push(`x = ${a}`);
      fracParts.push(`x = ${formatNumFracHTMLModeA(piece.left)}`);
      decParts.push(`x = ${formatNumDecModeA(piece.left)}`);
    } else if (piece.left === null && piece.right !== null) {
      const a = letterNames[lIdx++];
      summaryParts.push(`x ${opSymbol} ${a}`);
      fracParts.push(`x ${opSymbol} ${formatNumFracHTMLModeA(piece.right)}`);
      decParts.push(`x ${opSymbol} ${formatNumDecModeA(piece.right)}`);
    } else if (piece.left !== null && piece.right === null) {
      const a = letterNames[lIdx++];
      summaryParts.push(`${a} ${opSymbol} x`);
      fracParts.push(`${formatNumFracHTMLModeA(piece.left)} ${opSymbol} x`);
      decParts.push(`${formatNumDecModeA(piece.left)} ${opSymbol} x`);
    } else if (piece.left !== null && piece.right !== null) {
      const a = letterNames[lIdx++];
      const b = letterNames[lIdx++];
      summaryParts.push(`${a} ${opSymbol} x ${opSymbol} ${b}`);
      fracParts.push(`${formatNumFracHTMLModeA(piece.left)} ${opSymbol} x ${opSymbol} ${formatNumFracHTMLModeA(piece.right)}`);
      decParts.push(`${formatNumDecModeA(piece.left)} ${opSymbol} x ${opSymbol} ${formatNumDecModeA(piece.right)}`);
    }
  }

  return {
    summary: summaryParts.join(' , '),
    valFrac: fracParts.join(' , '),
    valDec: decParts.join(' , ')
  };
}

// ============================================================
// 20. SETUP MENU
// ============================================================
function openSetup() {
  const options = ['Angle: D', 'Angle: R', 'Angle: G', 'Norm', 'Fix', 'Sci', 'Complex: a+bi', 'Complex: r∠θ'];
  const current = State.settings.angle === 'D' ? 0 :
    State.settings.angle === 'R' ? 1 : 2;
  const format = State.settings.format === 'Norm' ? 3 :
    State.settings.format === 'Fix' ? 4 : 5;
  const complexFormatIdx = (State.settings.complexFormat || 'algebraic') === 'algebraic' ? 6 : 7;

  const choice = prompt('Setup Menu:\n' +
    '0: Angle D  1: Angle R  2: Angle G\n' +
    '3: Norm  4: Fix  5: Sci\n' +
    '6: Complex a+bi  7: Complex r∠θ\n' +
    'Current: ' + options[current] + ', ' + options[format] + ', ' + options[complexFormatIdx]);

  if (choice !== null) {
    const c = parseInt(choice);
    if (c >= 0 && c <= 2) {
      State.settings.angle = ['D', 'R', 'G'][c];
    } else if (c >= 3 && c <= 5) {
      State.settings.format = ['Norm', 'Fix', 'Sci'][c - 3];
      if (c === 4 || c === 5) {
        const n = prompt('Number of digits (0-9):');
        if (n !== null) {
          const digits = parseInt(n);
          if (!isNaN(digits) && digits >= 0 && digits <= 9) {
            State.settings.formatN = digits;
          }
        }
      }
    } else if (c === 6) {
      State.settings.complexFormat = 'algebraic';
    } else if (c === 7) {
      State.settings.complexFormat = 'polar';
    }
  }
}

// ============================================================
// 21. RESET
// ============================================================
function handleReset() {
  State.vars = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, M: 0, X: 0, Y: 0 };
  State.Ans = 0;
  State.PreAns = 0;
  State.settings = { angle: 'D', format: 'Norm', formatN: 2, io: 'Math', complexFormat: 'algebraic' };
  State.mode = 1;
  State.history = [];
  State.historyIdx = -1;
  clearAll();
}

// ============================================================
// 22. PERSISTENCE
// ============================================================
function saveState() {
  try {
    const saved = {
      vars: State.vars,
      Ans: State.Ans,
      PreAns: State.PreAns,
      baseValue: State.baseValue,
      mode: State.mode,
      settings: State.settings,
      isPowerOff: State.isPowerOff,
      history: State.history,
    };
    localStorage.setItem('casio_fx580_state', JSON.stringify(saved));
  } catch (e) { /* storage might be blocked */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem('casio_fx580_state');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.vars) State.vars = Object.assign(State.vars, saved.vars);
    if (saved.Ans !== undefined) State.Ans = saved.Ans;
    if (saved.PreAns !== undefined) State.PreAns = saved.PreAns;
    if (saved.baseValue !== undefined) State.baseValue = saved.baseValue;
    if (saved.mode) State.mode = saved.mode;
    if (saved.settings) State.settings = Object.assign(State.settings, saved.settings);
    if (saved.isPowerOff !== undefined) State.isPowerOff = saved.isPowerOff;
    if (saved.history) State.history = saved.history;
  } catch (e) { /* corrupt data */ }
}

// ============================================================
// 23. EVENT BINDING
// ============================================================
function bindEvents() {
  const buttons = document.querySelectorAll('[data-key]');
  buttons.forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const key = btn.dataset.key;
      if (key) handleKey(key);
      saveState();
    });
  });

  const optnItems = document.querySelectorAll('.optn-item');
  optnItems.forEach(item => {
    item.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const optVal = item.dataset.optn;
      if (optVal) {
        handleKey(optVal);
        saveState();
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I') {
      e.preventDefault();
      if (State.mode === 2) {
        handleKey('ENG');
      }
      saveState();
      return;
    }

    const keyMap = {
      '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
      '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
      '.': 'DOT', '+': 'PLUS', '-': 'MINUS', '*': 'MULTIPLY', '/': 'DIVIDE',
      '(': 'LPAREN', ')': 'RPAREN', 'Enter': 'EQUALS', '=': 'EQUALS',
      'Backspace': 'DEL', 'Escape': 'AC', 'Delete': 'AC',
      'ArrowLeft': 'LEFT', 'ArrowRight': 'RIGHT', 'ArrowUp': 'UP', 'ArrowDown': 'DOWN',
    };
    const key = keyMap[e.key];
    if (key) {
      e.preventDefault();
      handleKey(key);
      saveState();
    }
  });
}

// ============================================================
// 24. BOOT
// ============================================================
function init() {
  loadState();
  State.isPowerOff = false; // Always ensure screen is ON on startup
  if (dom.lcd) dom.lcd.style.opacity = '1';
  bindEvents();
  renderAll();
}

function isKeyAllowedInBaseN(key) {
  // Always allowed system keys
  const systemKeys = [
    'ON', 'AC', 'DEL', 'SHIFT_DEL', 'LEFT', 'RIGHT', 'UP', 'DOWN', 
    'MENU', 'SHIFT_MENU', 'EQUALS', 'SHIFT', 'ALPHA', 'OPTN', 'SHIFT_AC', 'SHIFT_9'
  ];
  if (systemKeys.includes(key)) return true;

  // Base selection keys: DEC (SQUARE), HEX (POWER), BIN (LOG_BASE), OCT (LN)
  const baseKeys = ['SQUARE', 'POWER', 'LOG_BASE', 'LN'];
  if (baseKeys.includes(key)) return true;

  // Operators and parens allowed in all bases
  const mathKeys = ['PLUS', 'MINUS', 'MULTIPLY', 'DIVIDE', 'LPAREN', 'RPAREN', 'ANS', 'NEGATION'];
  if (mathKeys.includes(key)) return true;

  const base = State.baseSystem || 'DEC';

  if (base === 'DEC') {
    return ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key);
  }
  if (base === 'HEX') {
    // A: NEGATION, B: DEGREE, C: INVERSE, D: SIN, E: COS, F: TAN
    const hexKeys = [
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'NEGATION', 'DEGREE', 'INVERSE', 'SIN', 'COS', 'TAN'
    ];
    return hexKeys.includes(key);
  }
  if (base === 'BIN') {
    return ['0', '1'].includes(key);
  }
  if (base === 'OCT') {
    return ['0', '1', '2', '3', '4', '5', '6', '7'].includes(key);
  }

  return false;
}

function changeBaseSystem(newBase) {
  if (State.tokens.length > 0) {
    try {
      const result = evaluateExpression(State.tokens);
      State.PreAns = State.Ans;
      State.Ans = result;
      State.baseValue = result;
      State.hasResult = true;
      State.errorState = null;
      State.tokens = [];
      State.cursorIdx = 0;
    } catch (e) {
      State.errorState = { type: e.type || 'Math', msg: e.msg || 'Error' };
      State.hasResult = false;
      State.tokens = [];
      State.cursorIdx = 0;
    }
  }

  State.baseSystem = newBase;

  if (State.baseValue === undefined || State.baseValue === null) {
    State.baseValue = typeof State.Ans === 'number' ? State.Ans : 0;
  }

  if (State.hasResult && State.Ans !== null) {
    State.sdDisplayOverride = null;
    State.sdMode = 'dec';
  } else {
    State.tokens = [];
    State.cursorIdx = 0;
  }
  renderAll();
}

// Export to window for EyeAssist integration
window.handleKey = handleKey;
window.State = State;
window.saveState = saveState;

document.addEventListener('DOMContentLoaded', init);