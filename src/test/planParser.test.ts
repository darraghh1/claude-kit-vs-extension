import * as assert from 'assert';
import * as path from 'path';
import { parsePlanTable } from '../parser/planParser';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('planParser', () => {
  describe('parsePlanTable', () => {
    it('should parse standard table format', async () => {
      const planFile = path.join(fixturesDir, 'standard-table-plan.md');
      const phases = await parsePlanTable(planFile);

      assert.strictEqual(phases.length, 3);

      assert.strictEqual(phases[0].phase, 1);
      assert.strictEqual(phases[0].name, 'Project Setup');
      assert.strictEqual(phases[0].status, 'completed');
      assert.ok(phases[0].file.includes('phase-01-project-setup.md'));

      assert.strictEqual(phases[1].phase, 2);
      assert.strictEqual(phases[1].status, 'in-progress');

      assert.strictEqual(phases[2].phase, 3);
      assert.strictEqual(phases[2].status, 'pending');
    });

    it('should parse link-first table format', async () => {
      const planFile = path.join(fixturesDir, 'link-first-plan.md');
      const phases = await parsePlanTable(planFile);

      assert.strictEqual(phases.length, 3);

      assert.strictEqual(phases[0].phase, 1);
      assert.strictEqual(phases[0].status, 'completed');
      assert.ok(phases[0].file.includes('phase-01.md'));

      assert.strictEqual(phases[1].phase, 2);
      assert.strictEqual(phases[1].status, 'in-progress');

      assert.strictEqual(phases[2].phase, 3);
      assert.strictEqual(phases[2].status, 'pending');
    });

    it('should parse simple table format (no links)', async () => {
      const planFile = path.join(fixturesDir, 'simple-plan.md');
      const phases = await parsePlanTable(planFile);

      assert.strictEqual(phases.length, 3);
      assert.strictEqual(phases[0].status, 'completed');
      assert.strictEqual(phases[1].status, 'in-progress');
      assert.strictEqual(phases[2].status, 'pending');
    });

    it('should parse number-link table format', async () => {
      const planFile = path.join(fixturesDir, 'number-link-plan.md');
      const phases = await parsePlanTable(planFile);

      assert.strictEqual(phases.length, 3);

      assert.strictEqual(phases[0].phase, 1);
      assert.strictEqual(phases[0].name, 'Database Setup');
      assert.strictEqual(phases[0].status, 'completed');
      assert.ok(phases[0].file.includes('phase-01.md'));

      assert.strictEqual(phases[1].phase, 2);
      assert.strictEqual(phases[1].name, 'API Layer');
      assert.strictEqual(phases[1].status, 'in-progress');

      assert.strictEqual(phases[2].phase, 3);
      assert.strictEqual(phases[2].name, 'Frontend');
      assert.strictEqual(phases[2].status, 'pending');
    });

    it('should parse heading-based format', async () => {
      const planFile = path.join(fixturesDir, 'heading-plan.md');
      const phases = await parsePlanTable(planFile);

      assert.strictEqual(phases.length, 3);

      assert.strictEqual(phases[0].phase, 1);
      assert.strictEqual(phases[0].name, 'Database Schema');
      assert.strictEqual(phases[0].status, 'completed');

      assert.strictEqual(phases[1].phase, 2);
      assert.strictEqual(phases[1].name, 'API Development');
      assert.strictEqual(phases[1].status, 'in-progress');

      assert.strictEqual(phases[2].phase, 3);
      assert.strictEqual(phases[2].name, 'Frontend UI');
      assert.strictEqual(phases[2].status, 'pending');
    });

    it('should parse checkbox format', async () => {
      const planFile = path.join(fixturesDir, 'checkbox-plan.md');
      const phases = await parsePlanTable(planFile);

      assert.strictEqual(phases.length, 3);
      assert.strictEqual(phases[0].status, 'completed'); // [x] = completed
      assert.strictEqual(phases[1].status, 'pending'); // [ ] = pending
      assert.strictEqual(phases[2].status, 'pending'); // [ ] = pending
    });

    it('should handle missing file gracefully', async () => {
      const planFile = path.join(fixturesDir, 'non-existent.md');
      await assert.rejects(async () => await parsePlanTable(planFile));
    });

    it('should return empty array for plan with no phases', async () => {
      const planFile = path.join(fixturesDir, 'empty-plan.md');
      const phases = await parsePlanTable(planFile);
      assert.strictEqual(phases.length, 0);
    });

    it('should parse numbered list with inline status', async () => {
      const planFile = path.join(fixturesDir, 'numbered-list-plan.md');
      const phases = await parsePlanTable(planFile);

      assert.strictEqual(phases.length, 3);

      assert.strictEqual(phases[0].phase, 1);
      assert.strictEqual(phases[0].name, 'Database Schema');
      assert.strictEqual(phases[0].status, 'completed');

      assert.strictEqual(phases[1].phase, 2);
      assert.strictEqual(phases[1].name, 'API Layer');
      assert.strictEqual(phases[1].status, 'in-progress');

      assert.strictEqual(phases[2].phase, 3);
      assert.strictEqual(phases[2].name, 'Frontend');
      assert.strictEqual(phases[2].status, 'pending');
    });

    it('should skip dependency table and use numbered list', async () => {
      // Ensures dependency graph table is ignored
      const planFile = path.join(fixturesDir, 'numbered-list-plan.md');
      const phases = await parsePlanTable(planFile);

      // Should NOT have extracted "None" as a phase name from dependency table
      const hasNone = phases.some((p) => p.name.toLowerCase().includes('none'));
      assert.strictEqual(hasNone, false, 'Should not extract from dependency table');
    });

    it('should parse multi-column table with Description column', async () => {
      const planFile = path.join(fixturesDir, 'multi-column-table-plan.md');
      const phases = await parsePlanTable(planFile);

      assert.strictEqual(phases.length, 3);

      // Should use Description column for name, not Phase column
      assert.strictEqual(phases[0].name, 'TeamMemberTable migration');
      assert.strictEqual(phases[0].status, 'completed');

      assert.strictEqual(phases[1].name, 'ProfileList migration');
      assert.strictEqual(phases[1].status, 'completed');

      assert.strictEqual(phases[2].name, 'TimeEntryGrid update');
      assert.strictEqual(phases[2].status, 'pending');
    });
  });
});
