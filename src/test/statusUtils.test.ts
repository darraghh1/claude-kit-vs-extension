import * as assert from 'assert';
import {
  normalizeStatus,
  calculatePlanStatus,
  getPhaseStatusIcon,
  getPlanStatusIcon,
} from '../parser/statusUtils';

describe('statusUtils', () => {
  describe('normalizeStatus', () => {
    it('should normalize "complete" variations to "completed"', () => {
      assert.strictEqual(normalizeStatus('complete'), 'completed');
      assert.strictEqual(normalizeStatus('Complete'), 'completed');
      assert.strictEqual(normalizeStatus('COMPLETED'), 'completed');
      assert.strictEqual(normalizeStatus('  completed  '), 'completed');
    });

    it('should normalize "done" to "completed"', () => {
      assert.strictEqual(normalizeStatus('done'), 'completed');
      assert.strictEqual(normalizeStatus('Done'), 'completed');
      assert.strictEqual(normalizeStatus('DONE'), 'completed');
    });

    it('should normalize progress indicators to "in-progress"', () => {
      assert.strictEqual(normalizeStatus('in-progress'), 'in-progress');
      assert.strictEqual(normalizeStatus('In Progress'), 'in-progress');
      assert.strictEqual(normalizeStatus('WIP'), 'in-progress');
      assert.strictEqual(normalizeStatus('wip'), 'in-progress');
      assert.strictEqual(normalizeStatus('active'), 'in-progress');
      assert.strictEqual(normalizeStatus('Active'), 'in-progress');
    });

    it('should default unknown values to "pending"', () => {
      assert.strictEqual(normalizeStatus(''), 'pending');
      assert.strictEqual(normalizeStatus('todo'), 'pending');
      assert.strictEqual(normalizeStatus('planned'), 'pending');
      assert.strictEqual(normalizeStatus('not started'), 'pending');
    });

    it('should handle emoji indicators', () => {
      assert.strictEqual(normalizeStatus('✅ Done'), 'completed');
      assert.strictEqual(normalizeStatus('✓ Complete'), 'completed');
      assert.strictEqual(normalizeStatus('🔄 Working'), 'in-progress');
    });

    it('should handle null/undefined gracefully', () => {
      assert.strictEqual(normalizeStatus(null as unknown as string), 'pending');
      assert.strictEqual(
        normalizeStatus(undefined as unknown as string),
        'pending'
      );
    });
  });

  describe('calculatePlanStatus', () => {
    it('should return "pending" for empty phases', () => {
      assert.strictEqual(calculatePlanStatus([]), 'pending');
    });

    it('should return "completed" when all phases completed', () => {
      const phases = [
        { status: 'completed' as const },
        { status: 'completed' as const },
        { status: 'completed' as const },
      ];
      assert.strictEqual(calculatePlanStatus(phases), 'completed');
    });

    it('should return "in-progress" when any phase is in-progress', () => {
      const phases = [
        { status: 'completed' as const },
        { status: 'in-progress' as const },
        { status: 'pending' as const },
      ];
      assert.strictEqual(calculatePlanStatus(phases), 'in-progress');
    });

    it('should return "in-progress" when some completed but none in-progress', () => {
      const phases = [
        { status: 'completed' as const },
        { status: 'pending' as const },
        { status: 'pending' as const },
      ];
      assert.strictEqual(calculatePlanStatus(phases), 'in-progress');
    });

    it('should return "pending" when all phases pending', () => {
      const phases = [
        { status: 'pending' as const },
        { status: 'pending' as const },
      ];
      assert.strictEqual(calculatePlanStatus(phases), 'pending');
    });
  });

  describe('getPhaseStatusIcon', () => {
    it('should return correct icons for each status', () => {
      assert.strictEqual(getPhaseStatusIcon('completed'), 'check');
      assert.strictEqual(getPhaseStatusIcon('in-progress'), 'sync~spin');
      assert.strictEqual(getPhaseStatusIcon('pending'), 'circle-outline');
    });
  });

  describe('getPlanStatusIcon', () => {
    it('should return correct icons for each status', () => {
      assert.strictEqual(getPlanStatusIcon('completed'), 'check-all');
      assert.strictEqual(getPlanStatusIcon('in-progress'), 'sync');
      assert.strictEqual(getPlanStatusIcon('pending'), 'circle-outline');
      assert.strictEqual(getPlanStatusIcon('cancelled'), 'close');
    });
  });
});
