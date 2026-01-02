/**
 * TreeProvider tests
 *
 * Note: Full TreeItem tests require VS Code extension host environment.
 * These tests focus on data management and helper methods that can
 * be tested in isolation.
 */

import * as assert from 'assert';
import { PlanData, PhaseData, PhaseStatus, PlanStatus } from '../types';

// Note: PlansTreeProvider tests require VS Code extension host environment
// and must be run via `npm run test:vscode`. The tests below only verify
// data structures that don't depend on the vscode module.

// Helper to create mock plan data
function createMockPlan(
  overrides: Partial<PlanData> = {}
): PlanData {
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

function createMockPhase(
  overrides: Partial<PhaseData> = {}
): PhaseData {
  return {
    phase: 1,
    name: 'Test Phase',
    status: 'pending' as PhaseStatus,
    file: '/path/to/phase-01.md',
    linkText: 'phase-01',
    ...overrides,
  };
}

describe('TreeProvider Data Structures', () => {
  describe('PlanData structure', () => {
    it('should create plan with required fields', () => {
      const plan = createMockPlan({
        id: '251215-feature',
        name: 'Feature Implementation',
        status: 'in-progress',
        percentage: 50,
      });

      assert.strictEqual(plan.id, '251215-feature');
      assert.strictEqual(plan.name, 'Feature Implementation');
      assert.strictEqual(plan.status, 'in-progress');
      assert.strictEqual(plan.percentage, 50);
    });

    it('should include optional metadata fields', () => {
      const plan = createMockPlan({
        priority: 'P1',
        branch: 'feature/my-feature',
        effort: '4h',
        description: 'A test plan',
      });

      assert.strictEqual(plan.priority, 'P1');
      assert.strictEqual(plan.branch, 'feature/my-feature');
      assert.strictEqual(plan.effort, '4h');
      assert.strictEqual(plan.description, 'A test plan');
    });
  });

  describe('PhaseData structure', () => {
    it('should create phase with required fields', () => {
      const phase = createMockPhase({
        phase: 2,
        name: 'API Integration',
        status: 'completed',
      });

      assert.strictEqual(phase.phase, 2);
      assert.strictEqual(phase.name, 'API Integration');
      assert.strictEqual(phase.status, 'completed');
    });

    it('should include file reference', () => {
      const phase = createMockPhase({
        file: '/plans/test/phase-03.md',
        linkText: 'phase-03',
      });

      assert.strictEqual(phase.file, '/plans/test/phase-03.md');
      assert.strictEqual(phase.linkText, 'phase-03');
    });
  });

  describe('Plan with phases', () => {
    it('should calculate progress correctly', () => {
      const phases: PhaseData[] = [
        createMockPhase({ phase: 1, status: 'completed' }),
        createMockPhase({ phase: 2, status: 'completed' }),
        createMockPhase({ phase: 3, status: 'in-progress' }),
        createMockPhase({ phase: 4, status: 'pending' }),
      ];

      const plan = createMockPlan({
        phases,
        completedCount: 2,
        totalCount: 4,
        percentage: 50,
      });

      assert.strictEqual(plan.completedCount, 2);
      assert.strictEqual(plan.totalCount, 4);
      assert.strictEqual(plan.percentage, 50);
      assert.strictEqual(plan.phases.length, 4);
    });
  });

  describe('Label formatting', () => {
    it('should format plan label with priority', () => {
      const plan = createMockPlan({ name: 'My Feature', priority: 'P1' });
      const label = plan.priority ? `${plan.name} [${plan.priority}]` : plan.name;

      assert.strictEqual(label, 'My Feature [P1]');
    });

    it('should format plan label without priority', () => {
      const plan = createMockPlan({ name: 'My Feature', priority: null });
      const label = plan.priority ? `${plan.name} [${plan.priority}]` : plan.name;

      assert.strictEqual(label, 'My Feature');
    });

    it('should format phase label', () => {
      const phase = createMockPhase({ phase: 3, name: 'Testing' });
      const label = `Phase ${phase.phase}: ${phase.name}`;

      assert.strictEqual(label, 'Phase 3: Testing');
    });
  });

  describe('Tooltip building', () => {
    it('should build plan tooltip with all fields', () => {
      const plan = createMockPlan({
        name: 'Test Plan',
        completedCount: 3,
        totalCount: 5,
        percentage: 60,
        status: 'in-progress',
        priority: 'P2',
        effort: '8h',
        description: 'This is a description',
      });

      const tooltipLines = [
        plan.name,
        `Progress: ${plan.completedCount}/${plan.totalCount} phases (${plan.percentage}%)`,
        `Status: ${plan.status}`,
      ];
      if (plan.priority) tooltipLines.push(`Priority: ${plan.priority}`);
      if (plan.effort) tooltipLines.push(`Effort: ${plan.effort}`);
      if (plan.description) tooltipLines.push('', plan.description);

      const tooltip = tooltipLines.join('\n');

      assert.ok(tooltip.includes('Test Plan'));
      assert.ok(tooltip.includes('Progress: 3/5 phases (60%)'));
      assert.ok(tooltip.includes('Status: in-progress'));
      assert.ok(tooltip.includes('Priority: P2'));
      assert.ok(tooltip.includes('Effort: 8h'));
      assert.ok(tooltip.includes('This is a description'));
    });

    it('should build phase tooltip', () => {
      const phase = createMockPhase({ phase: 2, name: 'API Setup', status: 'in-progress' });
      const label = `Phase ${phase.phase}: ${phase.name}`;
      const tooltip = `${label}\nStatus: ${phase.status}\nClick to open`;

      assert.ok(tooltip.includes('Phase 2: API Setup'));
      assert.ok(tooltip.includes('Status: in-progress'));
      assert.ok(tooltip.includes('Click to open'));
    });
  });

  // Note: PlansTreeProvider class tests require VS Code extension host
  // and are tested in src/test/suite/extension.test.ts via vsce test
});