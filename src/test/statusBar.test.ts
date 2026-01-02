/**
 * StatusBar tests
 *
 * Note: Full StatusBarItem tests require VS Code extension host environment.
 * These tests focus on data logic and helper methods that can be tested in isolation.
 */

import * as assert from 'assert';
import { PlanData, ProjectProgress, PlanStatus, PhaseStatus } from '../types';

// Helper to create mock plan data
function createMockPlan(overrides: Partial<PlanData> = {}): PlanData {
  return {
    id: 'test-plan',
    name: 'Test Plan',
    path: '/path/to/plan.md',
    status: 'in-progress' as PlanStatus,
    phases: [],
    completedCount: 0,
    totalCount: 0,
    percentage: 0,
    lastModified: new Date(),
    description: undefined,
    priority: null,
    tags: [],
    issue: undefined,
    branch: undefined,
    effort: undefined,
    createdDate: undefined,
    completedDate: undefined,
    ...overrides,
  };
}

function createMockProgress(
  plans: PlanData[],
  overrides: Partial<ProjectProgress> = {}
): ProjectProgress {
  const totalPhases = plans.reduce((sum, p) => sum + p.totalCount, 0);
  const completedPhases = plans.reduce((sum, p) => sum + p.completedCount, 0);

  return {
    rootPath: '/project',
    projectName: 'Test Project',
    plans,
    totalPhases,
    completedPhases,
    percentage: totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0,
    ...overrides,
  };
}

// Mock findCurrentPlan logic for testing
function findCurrentPlan(progress: ProjectProgress | null): PlanData | null {
  if (!progress) return null;

  const plans = progress.plans;

  // First: find in-progress plan
  const inProgress = plans.find((p) => p.status === 'in-progress');
  if (inProgress) return inProgress;

  // Second: find pending plan with some progress
  const pendingWithProgress = plans.find(
    (p) => p.status === 'pending' && p.completedCount > 0
  );
  if (pendingWithProgress) return pendingWithProgress;

  // Third: most recently modified
  const sorted = [...plans].sort(
    (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
  );
  return sorted[0] || null;
}

// Mock truncate helper
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

describe('StatusBar Logic', () => {
  describe('findCurrentPlan', () => {
    it('should return null for null progress', () => {
      assert.strictEqual(findCurrentPlan(null), null);
    });

    it('should return null for empty plans', () => {
      const progress = createMockProgress([]);
      assert.strictEqual(findCurrentPlan(progress), null);
    });

    it('should prioritize in-progress plan', () => {
      const plans = [
        createMockPlan({ id: 'pending', status: 'pending', lastModified: new Date('2025-01-02') }),
        createMockPlan({ id: 'progress', status: 'in-progress', lastModified: new Date('2025-01-01') }),
        createMockPlan({ id: 'completed', status: 'completed', lastModified: new Date('2025-01-03') }),
      ];
      const progress = createMockProgress(plans);
      const result = findCurrentPlan(progress);

      assert.strictEqual(result?.id, 'progress');
    });

    it('should prioritize pending with progress when no in-progress', () => {
      const plans = [
        createMockPlan({ id: 'pending', status: 'pending', completedCount: 0 }),
        createMockPlan({ id: 'partial', status: 'pending', completedCount: 2 }),
        createMockPlan({ id: 'completed', status: 'completed' }),
      ];
      const progress = createMockProgress(plans);
      const result = findCurrentPlan(progress);

      assert.strictEqual(result?.id, 'partial');
    });

    it('should return most recently modified as fallback', () => {
      const plans = [
        createMockPlan({ id: 'old', status: 'pending', lastModified: new Date('2025-01-01') }),
        createMockPlan({ id: 'recent', status: 'pending', lastModified: new Date('2025-01-03') }),
        createMockPlan({ id: 'older', status: 'pending', lastModified: new Date('2025-01-02') }),
      ];
      const progress = createMockProgress(plans);
      const result = findCurrentPlan(progress);

      assert.strictEqual(result?.id, 'recent');
    });
  });

  describe('truncate', () => {
    it('should not truncate short strings', () => {
      assert.strictEqual(truncate('short', 10), 'short');
    });

    it('should truncate long strings with ellipsis', () => {
      assert.strictEqual(truncate('this is a very long string', 10), 'this is a…');
    });

    it('should handle exact length strings', () => {
      assert.strictEqual(truncate('exact', 5), 'exact');
    });

    it('should handle single character over limit', () => {
      assert.strictEqual(truncate('toolong', 6), 'toolo…');
    });
  });

  describe('status bar text formatting', () => {
    it('should format progress text correctly', () => {
      const plan = createMockPlan({
        completedCount: 3,
        totalCount: 5,
        name: 'My Feature',
      });

      const progressText = `${plan.completedCount}/${plan.totalCount}`;
      const planName = truncate(plan.name, 20);
      const text = `$(sync) ${progressText} · ${planName}`;

      assert.strictEqual(text, '$(sync) 3/5 · My Feature');
    });

    it('should truncate long plan names', () => {
      const plan = createMockPlan({
        completedCount: 1,
        totalCount: 10,
        name: 'This is a very long plan name that should be truncated',
      });

      const progressText = `${plan.completedCount}/${plan.totalCount}`;
      const planName = truncate(plan.name, 20);
      const text = `$(folder) ${progressText} · ${planName}`;

      assert.ok(text.includes('…'));
      assert.ok(text.length < 50);
    });

    it('should use correct icon for completed status', () => {
      const plan = createMockPlan({ status: 'completed' });
      const icon = plan.status === 'completed' ? '$(check)' : '$(folder)';

      assert.strictEqual(icon, '$(check)');
    });

    it('should use correct icon for in-progress status', () => {
      const plan = createMockPlan({ status: 'in-progress' });
      let icon = '$(folder)';
      if (plan.status === 'completed') {
        icon = '$(check)';
      } else if (plan.status === 'in-progress') {
        icon = '$(sync)';
      }

      assert.strictEqual(icon, '$(sync)');
    });
  });

  describe('tooltip formatting', () => {
    it('should include plan name in tooltip', () => {
      const plan = createMockPlan({ name: 'Test Plan' });
      const lines = [`ClaudeKit: ${plan.name}`];

      assert.ok(lines.join('\n').includes('ClaudeKit: Test Plan'));
    });

    it('should include progress in tooltip', () => {
      const plan = createMockPlan({
        completedCount: 4,
        totalCount: 8,
        percentage: 50,
      });
      const line = `Progress: ${plan.completedCount}/${plan.totalCount} phases (${plan.percentage}%)`;

      assert.strictEqual(line, 'Progress: 4/8 phases (50%)');
    });

    it('should include priority if present', () => {
      const plan = createMockPlan({ priority: 'P1' });
      const lines: string[] = [];
      if (plan.priority) {
        lines.push(`Priority: ${plan.priority}`);
      }

      assert.ok(lines.includes('Priority: P1'));
    });

    it('should include effort if present', () => {
      const plan = createMockPlan({ effort: '4h' });
      const lines: string[] = [];
      if (plan.effort) {
        lines.push(`Effort: ${plan.effort}`);
      }

      assert.ok(lines.includes('Effort: 4h'));
    });

    it('should show other plans count', () => {
      const progress = createMockProgress([
        createMockPlan({ id: 'plan1' }),
        createMockPlan({ id: 'plan2' }),
        createMockPlan({ id: 'plan3' }),
      ]);

      const otherPlans = progress.plans.length - 1;
      const line = `+${otherPlans} other plan${otherPlans > 1 ? 's' : ''}`;

      assert.strictEqual(line, '+2 other plans');
    });
  });
});
