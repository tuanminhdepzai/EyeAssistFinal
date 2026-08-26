/**
 * VoiceNormalizer — Chuẩn hóa text đầu vào từ ASR tiếng Việt
 *
 * Xử lý các vấn đề phổ biến của Web Speech API với tiếng Việt:
 *   - Dấu câu thừa, khoảng trắng bất thường
 *   - Biến thể phát âm vùng miền / lỗi ASR thường gặp
 *   - Số viết bằng chữ số Ả Rập xen lẫn ("3 phẩy 14" thay vì "ba phẩy mười bốn")
 *   - Viết hoa/thường không nhất quán
 *
 * Module này stateless, có thể dùng độc lập trong test.
 */
export class VoiceNormalizer {
  constructor() {
    // Alias map: biến thể phát âm → dạng chuẩn
    this.aliases = new Map([
      // Toán tử
      ['nhơn', 'nhân'],
      ['chía', 'chia'],
      ['bầng', 'bằng'],
      ['bằn', 'bằng'],
      ['cộn', 'cộng'],
      ['trử', 'trừ'],
      ['thừ', 'trừ'],
      ['nhẩn', 'nhân'],

      // Hàm lượng giác
      ['sin ngược', 'arcsin'],
      ['cos ngược', 'arccos'],
      ['tan ngược', 'arctan'],
      ['cô sin', 'cos'],
      ['côsin', 'cos'],
      ['tang', 'tan'],
      ['lôgarit', 'logarit'],
      ['lô ga rit', 'logarit'],
      ['lo ga rit', 'logarit'],

      // Hằng số
      ['số pi', 'pi'],
      ['hằng số e', 'e'],
      ['hằng số pi', 'pi'],
      ['vô cực', 'inf'],

      // Phép toán mở rộng
      ['giai thừa', 'factorial'],
      ['phần trăm', 'percent'],
      ['chia lấy dư', 'modulo'],
      ['căn bậc ba', 'cbrt'],
      ['căn bậc hai', 'sqrt'],
      ['e mũ', 'exp'],
      ['mười mũ', 'pow10'],

      // Điều khiển
      ['xoá hết', 'xóa hết'],
      ['xoá tất cả', 'xóa tất cả'],
      ['xoá', 'xóa'],
      ['backspace', 'xóa một'],
      ['lui lại', 'xóa một'],
      ['quay lại', 'undo'],

      // Vật lý 3D
      ['xoay sang trái', 'xoay trái'],
      ['xoay sang phải', 'xoay phải'],
      ['lật ngửa', 'lật tay'],
      ['lật úp', 'lật tay'],
      ['úp tay', 'lật tay'],
      ['ngửa tay', 'lật tay'],
      ['đổi tay phải', 'tay phải'],
      ['đổi tay trái', 'tay trái'],
      ['nắm tay lại', 'nắm tay'],
      ['mở bàn tay', 'mở tay'],
      ['duỗi tay', 'mở tay'],
      ['khóa đáp án', 'khóa'],
      ['chốt đáp án', 'khóa'],
      ['chốt', 'khóa'],
      ['bài tiếp theo', 'bài mới'],
      ['bài tiếp', 'bài mới'],
      ['tạo đề', 'bài mới'],
      ['đặt lại', 'reset'],
      ['quay về gốc', 'reset'],
    ]);

    // Regex chuẩn hóa (biên dịch sẵn)
    this._reMultiSpace = /\s+/g;
    this._rePunctuation = /[.,!?;:(){}\[\]"'`]/g;
    this._reTrailingSpace = /^\s+|\s+$/g;
    this._reDigitWord = /(\d+)\s+(phẩy|chấm)\s+(\d+)/gi;
  }

  /**
   * Chuẩn hóa text thô từ ASR
   * @param {string} raw - text gốc từ SpeechRecognition
   * @returns {string} text đã chuẩn hóa
   */
  normalize(raw) {
    if (!raw || typeof raw !== 'string') return '';

    let s = raw;

    // 1. Lowercase + loại bỏ dấu câu
    s = s.toLowerCase();
    s = s.replace(this._rePunctuation, ' ');

    // 2. Chuyển số Ả Rập xen lẫn thành dạng đọc tiếng Việt
    //    "3 phẩy 14" → "3 . 14" (giữ nguyên số, tách phần thập phân)
    s = s.replace(this._reDigitWord, '$1 . $3');

    // 3. Thay thế alias (dùng word boundary để tránh thay substring)
    //    Sắp xếp theo độ dài giảm dần để ưu tiên cụm dài hơn
    if (!this._sortedAliases) {
      this._sortedAliases = [...this.aliases.entries()]
        .sort((a, b) => b[0].length - a[0].length);
      const vnChars = 'àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ';
      this._aliasRegexes = this._sortedAliases.map(([variant, canonical]) => ({
        re: new RegExp(
          '(?<![\\w' + vnChars + '])' +
          variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
          '(?![\\w' + vnChars + '])', 'g'),
        canonical
      }));
    }
    for (const { re, canonical } of this._aliasRegexes) {
      s = s.replace(re, canonical);
    }

    // 4. Chuẩn hóa khoảng trắng
    s = s.replace(this._reMultiSpace, ' ');
    s = s.replace(this._reTrailingSpace, '');

    return s;
  }

  /**
   * Kiểm tra xem text có chứa keyword (sau khi chuẩn hóa)
   * @param {string} text - text đã normalize
   * @param {string[]} keywords - danh sách từ khóa cần tìm
   * @returns {{ matched: string|null, index: number }}
   */
  findKeyword(text, keywords) {
    for (let i = 0; i < keywords.length; i++) {
      if (text.includes(keywords[i])) {
        return { matched: keywords[i], index: i };
      }
    }
    return { matched: null, index: -1 };
  }

  /**
   * Tách phần số và phần lệnh từ text hỗn hợp
   * Ví dụ: "sin 45" → { command: 'sin', value: '45' }
   *        "3 cộng 5" → { command: 'cộng', value: '3 5' }
   * @param {string} text - text đã normalize
   * @returns {{ prefix: string, command: string, suffix: string }}
   */
  splitCommandAndValue(text) {
    const operators = [
      'cộng', 'trừ', 'nhân', 'chia', 'bằng',
      'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan',
      'log', 'ln', 'sqrt', 'cbrt', 'exp', 'factorial',
      'mũ', 'lũy thừa', 'phần', 'trên', 'modulo'
    ];

    for (const op of operators) {
      const idx = text.indexOf(op);
      if (idx >= 0) {
        return {
          prefix: text.slice(0, idx).trim(),
          command: op,
          suffix: text.slice(idx + op.length).trim()
        };
      }
    }

    return { prefix: '', command: '', suffix: text };
  }
}
