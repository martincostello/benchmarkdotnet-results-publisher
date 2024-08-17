// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as core from '@actions/core';
import { ActionFixture } from './ActionFixture';
import { setup } from './fixtures';

import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals';

const timeout = 45000;

describe('benchmarkdotnet-results-publisher', () => {

  beforeAll(() => {
    Date.now = jest.fn(() => new Date(Date.UTC(2024, 7, 17, 12, 34, 56)).valueOf())
  });

  describe('when publishing', () => {
    describe.each([['new-benchmark']])('results for %s', (scenario: string) => {
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

      test('does not log any errors', () => {
        expect(fixture.getErrors()).toEqual([]);
      });
    });
  });
});
