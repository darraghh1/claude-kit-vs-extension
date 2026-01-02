import * as assert from 'assert';
import {
  normalizePriority,
  parseDateFromDirName,
  parseEffortToHours,
} from '../parser/metadataExtractor';

describe('metadataExtractor', () => {
  describe('normalizePriority', () => {
    it('should normalize P1/High to P1', () => {
      assert.strictEqual(normalizePriority('P1'), 'P1');
      assert.strictEqual(normalizePriority('high'), 'P1');
      assert.strictEqual(normalizePriority('CRITICAL'), 'P1');
      assert.strictEqual(normalizePriority('High'), 'P1');
    });

    it('should normalize P2/Medium to P2', () => {
      assert.strictEqual(normalizePriority('P2'), 'P2');
      assert.strictEqual(normalizePriority('medium'), 'P2');
      assert.strictEqual(normalizePriority('normal'), 'P2');
      assert.strictEqual(normalizePriority('MEDIUM'), 'P2');
    });

    it('should normalize P3/Low to P3', () => {
      assert.strictEqual(normalizePriority('P3'), 'P3');
      assert.strictEqual(normalizePriority('low'), 'P3');
      assert.strictEqual(normalizePriority('LOW'), 'P3');
    });

    it('should return null for invalid', () => {
      assert.strictEqual(normalizePriority(''), null);
      assert.strictEqual(normalizePriority(undefined), null);
      assert.strictEqual(normalizePriority('invalid'), null);
      assert.strictEqual(normalizePriority('P5'), null);
    });
  });

  describe('parseDateFromDirName', () => {
    it('should parse YYMMDD format', () => {
      const date = parseDateFromDirName('251215-feature-name');
      assert.ok(date);
      assert.strictEqual(date.getFullYear(), 2025);
      assert.strictEqual(date.getMonth(), 11); // December (0-indexed)
      assert.strictEqual(date.getDate(), 15);
    });

    it('should parse YYMMDD-HHMM format', () => {
      const date = parseDateFromDirName('251215-1430-feature-name');
      assert.ok(date);
      assert.strictEqual(date.getFullYear(), 2025);
      assert.strictEqual(date.getMonth(), 11);
      assert.strictEqual(date.getDate(), 15);
    });

    it('should parse 260102 format correctly', () => {
      const date = parseDateFromDirName('260102-0609-claude-kit');
      assert.ok(date);
      assert.strictEqual(date.getFullYear(), 2026);
      assert.strictEqual(date.getMonth(), 0); // January
      assert.strictEqual(date.getDate(), 2);
    });

    it('should return undefined for invalid', () => {
      assert.strictEqual(parseDateFromDirName('feature-name'), undefined);
      assert.strictEqual(parseDateFromDirName('abc123'), undefined);
      assert.strictEqual(parseDateFromDirName('12-something'), undefined);
    });
  });

  describe('parseEffortToHours', () => {
    it('should parse hours', () => {
      assert.strictEqual(parseEffortToHours('4h'), 4);
      assert.strictEqual(parseEffortToHours('4 hours'), 4);
      assert.strictEqual(parseEffortToHours('1.5h'), 1.5);
      assert.strictEqual(parseEffortToHours('10hr'), 10);
      assert.strictEqual(parseEffortToHours('2 hrs'), 2);
    });

    it('should parse minutes to hours', () => {
      assert.strictEqual(parseEffortToHours('30m'), 0.5);
      assert.strictEqual(parseEffortToHours('90 min'), 1.5);
      assert.strictEqual(parseEffortToHours('60 minutes'), 1);
    });

    it('should parse days to hours (8h per day)', () => {
      assert.strictEqual(parseEffortToHours('2d'), 16);
      assert.strictEqual(parseEffortToHours('1 day'), 8);
      assert.strictEqual(parseEffortToHours('0.5d'), 4);
    });

    it('should return 0 for invalid', () => {
      assert.strictEqual(parseEffortToHours(''), 0);
      assert.strictEqual(parseEffortToHours(undefined), 0);
      assert.strictEqual(parseEffortToHours('unknown'), 0);
      assert.strictEqual(parseEffortToHours('soon'), 0);
    });
  });
});
