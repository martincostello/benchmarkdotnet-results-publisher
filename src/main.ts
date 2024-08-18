// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as core from '@actions/core';
import * as path from 'path';

import { Context } from '@actions/github/lib/context';
import { BenchmarksPublisher } from './BenchmarksPublisher';
import { PublishOptions } from './PublishOptions';

export async function run(): Promise<void> {
  try {
    const context = new Context();
    const repoPath = path.normalize(process.env.GITHUB_WORKSPACE ?? '.');

    const options: PublishOptions = {
      accessToken: core.getInput('repo-token', { required: true }),
      apiUrl: context.apiUrl,
      branch: core.getInput('branch', { required: false }),
      commitMessage: core.getInput('commit-message', { required: false }),
      failOnThreshold:
        core.getInput('fail-on-threshold', { required: false }) === 'true',
      name: core.getInput('name', { required: false }),
      outputFilePath: core.getInput('output-file-path', { required: false }),
      outputStepSummary:
        core.getInput('output-step-summary', { required: false }) === 'true',
      repo:
        core.getInput('repo', { required: false }) ??
        process.env.GITHUB_REPOSITORY,
      repoPath,
      resultsPath: core.getInput('results-path', { required: false }),
      runId: context.runId.toString(10),
      runRepo: process.env.GITHUB_REPOSITORY,
      serverUrl: context.serverUrl,
      sha: context.sha,
    };

    let threshold = core.getInput('fail-threshold-duration', {
      required: false,
    });
    if (threshold) {
      options.failThresholdDuration = parseFloat(threshold);
    }

    threshold = core.getInput('fail-threshold-memory', {
      required: false,
    });
    if (threshold) {
      options.failThresholdMemory = parseFloat(threshold);
    }

    const maxItemsString = core.getInput('max-items', { required: false });
    if (maxItemsString) {
      options.maxItems = parseInt(maxItemsString, 10);
    }

    const publisher = new BenchmarksPublisher(options);
    await publisher.publish();
  } catch (error: any) {
    core.error('Failed to publish benchmark results.');
    core.error(error);
    if (error instanceof Error) {
      if (error.stack) {
        core.error(error.stack);
      }
      core.setFailed(error.message);
    }
  }
}

if (require.main === module) {
  run();
}
