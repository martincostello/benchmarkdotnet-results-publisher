// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { ActionFixture } from './ActionFixture';
import { setup } from './fixtures';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

const timeout = 45000;

describe('benchmarkdotnet-results-publisher', () => {
  beforeAll(() => {
    Date.now = vi.fn(() =>
      new Date(Date.UTC(2024, 7, 17, 12, 34, 56)).valueOf()
    );
  });

  describe('when publishing', () => {
    describe.each([
      ['new-benchmark', true],
      ['existing-benchmark', true],
      ['jobs-benchmark', true],
      ['regression', false],
      ['failing-benchmark', true],
    ])('results for %s', (scenario: string, succeeds: boolean) => {
      let fixture: ActionFixture;

      beforeAll(async () => {
        await setup(scenario);
        fixture = new ActionFixture();

        await fixture.initialize(scenario);

        await fixture.run();
      }, timeout);

      afterAll(async () => {
        await fixture?.destroy();
      });

      test('reports the correct result', () => {
        expect(fixture.success).toEqual(succeeds);
      });

      test('does not log any errors', () => {
        expect(fixture.getErrors()).toEqual([]);
      });

      test('generates the expected GitHub step summary', async () => {
        expect(fixture.stepSummary).toMatchSnapshot();
      });
    });
  });
});
