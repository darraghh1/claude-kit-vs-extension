import * as assert from 'assert';
import { getPlanId, getPlanDisplayName } from '../parser/planScanner';

describe('planScanner', () => {
  describe('getPlanId', () => {
    it('should extract directory name from path', () => {
      assert.strictEqual(
        getPlanId('/home/user/plans/251215-feature/plan.md'),
        '251215-feature'
      );
      assert.strictEqual(
        getPlanId('C:\\Projects\\plans\\260102-test\\plan.md'),
        '260102-test'
      );
    });
  });

  describe('getPlanDisplayName', () => {
    it('should convert YYMMDD-name to Title Case', () => {
      assert.strictEqual(
        getPlanDisplayName('251215-feature-name'),
        'Feature Name'
      );
      assert.strictEqual(
        getPlanDisplayName('260102-api-integration'),
        'Api Integration'
      );
    });

    it('should handle YYMMDD-HHMM-name format', () => {
      assert.strictEqual(
        getPlanDisplayName('260102-0609-claude-kit-vs-extension'),
        'Claude Kit Vs Extension'
      );
    });

    it('should handle names without date prefix', () => {
      assert.strictEqual(getPlanDisplayName('my-feature'), 'My Feature');
      assert.strictEqual(getPlanDisplayName('simple'), 'Simple');
    });

    it('should handle single word names', () => {
      assert.strictEqual(getPlanDisplayName('251215-test'), 'Test');
    });
  });
});
