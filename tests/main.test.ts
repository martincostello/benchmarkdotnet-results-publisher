// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as core from '@actions/core';
import { ActionFixture } from './ActionFixture';
import { setup } from './fixtures';

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

const timeout = 45000;

describe.skip('benchmarkdotnet-results-publisher', () => {
  describe('when publishing', () => {
    describe.each([['many-benchmarks']])('results for %s', (name: string) => {
      let fixture: ActionFixture;

      beforeAll(async () => {
        await setup('scenarios');
        fixture = new ActionFixture();

        await fixture.initialize();

        await fixture.run();
      }, timeout);

      afterAll(async () => {
        await fixture?.destroy();
      });

      test('does not log any errors', () => {
        expect(core.error).toHaveBeenCalledTimes(0);
      });

      test('does not fail', () => {
        expect(core.setFailed).toHaveBeenCalledTimes(0);
      });

      test('updates the data', async () => {
        expect(await fixture.getContent('data.json')).toMatchSnapshot();
      });

      test('generates the correct commit message', async () => {
        expect(await fixture.commitHistory(2)).toMatchSnapshot();
      });

      test('generates the correct diff', async () => {
        expect(await fixture.diff()).toMatchSnapshot();
      });
    });
  });
});
