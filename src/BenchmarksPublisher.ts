// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { PublishOptions } from './PublishOptions';

export class BenchmarksPublisher {
  private readonly options: PublishOptions;

  constructor(options: PublishOptions) {
    this.options = options;
  }

  public async publish(): Promise<void> {
    const benchmarks = await this.getBenchmarks();
    if (Object.keys(benchmarks).length) {
      await this.publishResults(benchmarks);
    } else {
      core.warning('No benchmarks found to publish.');
    }
  }

  private async findJsonResults(): Promise<string[]> {
    return await glob(['**/*-report-full-compressed.json'], {
      absolute: true,
      cwd:
        this.options.resultsPath ??
        path.join(this.options.repoPath, 'BenchmarkDotNet.Artifacts'),
      nodir: true,
      realpath: true,
    });
  }

  private async getBenchmarks(): Promise<
    Record<string, BenchmarkDotNetResults>
  > {
    const paths = await this.findJsonResults();

    core.debug(`Found ${paths.length} BenchmarkDotNet JSON result files.`);
    for (const fileName of paths) {
      core.debug(`  - ${fileName}`);
    }

    const results: Record<string, BenchmarkDotNetResults> = {};

    for (const fileName of paths) {
      results[fileName] = await this.parseResults(fileName);
    }

    core.debug(`Found ${Object.keys(results).length} sets of benchmarks.`);
    if (core.isDebug()) {
      for (const fileName in results) {
        const result = results[fileName];
        const names = result.Benchmarks.map((b) => b.FullName);
        core.debug(`  - '${fileName}' (${result.Title}):`);
        for (const name of names) {
          core.debug(`    - ${name}`);
        }
      }
    }

    return results;
  }

  private async parseResults(
    fileName: string
  ): Promise<BenchmarkDotNetResults> {
    try {
      const json = await fs.promises.readFile(fileName, { encoding: 'utf8' });
      return JSON.parse(json);
    } catch (error) {
      core.debug(`Failed to parse '${fileName}': ${error}`);
      throw new Error(
        `Failed to parse '${fileName}' as BenchmarkDotNet JSON output. Results must be a JSON file generated with the '--exporters json' option: ${error}`
      );
    }
  }

  private getBranch(): string {
    return this.options.branch ?? 'gh-pages';
  }

  private getResultsPath(): string {
    return this.options.outputFilePath ?? 'data.json';
  }

  private async getCurrentResults(): Promise<{
    data: BenchmarksData;
    sha: string;
  }> {
    const [owner, repo] = this.options.repo.split('/');
    const ref = this.getBranch();
    const fileName = this.getResultsPath();

    const octokit = github.getOctokit(this.options.accessToken, {
      baseUrl: this.options.apiUrl,
    });

    try {
      const { data: contents } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: fileName,
        ref,
        headers: {
          accept: 'application/vnd.github.object+json',
        },
      });

      const encoding = contents['encoding'];
      let json: string;

      if (encoding === 'base64' && contents['content']) {
        json = Buffer.from(contents['content'], 'base64').toString();
      } else if (encoding === 'none') {
        const response = await fetch(contents['download_url']);
        json = await response.text();
      } else {
        throw new Error(`Unexpected encoding for ${path}: ${encoding}`);
      }

      const data = JSON.parse(json);
      return {
        data,
        sha: contents['sha'],
      };
    } catch (error: any) {
      if (error['status'] === 404) {
        return {
          data: {
            lastUpdated: 0,
            repoUrl: `${this.options.serverUrl}/${this.options.runRepo}`,
            entries: {},
          },
          sha: '',
        };
      }
      throw error;
    }
  }

  private generateCommitMessage(names: string[], sha: string): string {
    const messageLines = [
      names.length > 1
        ? `Publish results for ${names.length} benchmarks`
        : `Publish results for ${names[0]}`,
      '',
    ];

    if (names.length > 1) {
      messageLines.push(
        `Publish BenchmarkDotNet results for ${names.length} benchmarks.`
      );
    } else {
      messageLines.push(
        `Publish BenchmarkDotNet results for the ${names[0]} benchmark.`
      );
    }

    messageLines.push(
      '',
      `Generated from ${this.options.runRepo}@${sha} by ${this.options.serverUrl}/${this.options.runRepo}/actions/runs/${this.options.runId}.`,
      '',
      '---',
      'benchmarks:'
    );

    for (const name of names) {
      messageLines.push(`- name: ${name}`);
    }

    messageLines.push('...', '', '');

    return messageLines.join('\n');
  }

  private async updateResults(
    sha: string,
    results: BenchmarksData
  ): Promise<boolean> {
    const [owner, repo] = this.options.repo.split('/');
    const branch = this.getBranch();
    const fileName = this.getResultsPath();

    const message =
      this.options.commitMessage ??
      this.generateCommitMessage(Object.keys(results.entries), sha);

    const json = JSON.stringify(results, null, 2);
    const content = Buffer.from(json, 'utf8').toString('base64');

    const octokit = github.getOctokit(this.options.accessToken, {
      baseUrl: this.options.apiUrl,
    });

    try {
      const { data: commit } =
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          branch,
          path: fileName,
          sha: sha ?? undefined,
          message,
          content,
        });

      core.info(
        `Updated ${fileName} in ${repo}@${branch}. Commit SHA ${commit.content?.sha?.substring(0, 7)}.`
      );
      return true;
    } catch (error: any) {
      if (error['status'] === 409) {
        return false;
      }
      throw error;
    }
  }

  private mergeResults(
    existingData: BenchmarksData,
    results: Record<string, BenchmarkDotNetResults>,
    commit: Commit
  ): BenchmarksData {
    const mergedData = { ...existingData, lastUpdated: Date.now() };

    for (const fileName in results) {
      const result = results[fileName];
      const suiteName = this.options.name ?? result.Title.split('-')[0];
      const suite = mergedData.entries[suiteName] ?? [];

      let items: BenchmarkResult[] = [];

      for (const benchmark of result.Benchmarks) {
        const item: BenchmarkResult = {
          name: benchmark.FullName,
          value: benchmark.Statistics.Mean,
          unit: 'ns',
          range: `± ${benchmark.Statistics.StandardDeviation}`,
        };

        if (benchmark.Memory) {
          item.allocated = benchmark.Memory.BytesAllocatedPerOperation;
        }

        items.push(item);
      }

      if (this.options.maxItems && items.length > this.options.maxItems) {
        items = items.slice(items.length - this.options.maxItems);
      }

      suite.push({
        commit,
        date: Date.now(),
        benches: items,
      });

      mergedData.entries[suiteName] = suite;
    }

    return existingData;
  }

  private async publishResults(
    benchmarks: Record<string, BenchmarkDotNetResults>
  ): Promise<void> {
    const commit = await this.getCurrentCommit();

    let attempts = 0;
    const maxRetries = 3;

    while (attempts < maxRetries) {
      const { data, sha } = await this.getCurrentResults();
      const merged = this.mergeResults(data, benchmarks, commit);
      if (await this.updateResults(sha, merged)) {
        return;
      }

      attempts++;
    }

    throw new Error(`Failed to update results after ${maxRetries} attempts.`);
  }

  private async getCurrentCommit(): Promise<Commit> {
    if (!this.options.runRepo) {
      throw new Error(
        'Failed to determine the repository to use for the current Git commit.'
      );
    }
    const [owner, repo] = this.options.runRepo.split('/');
    const ref = this.options.sha;

    const octokit = github.getOctokit(this.options.accessToken, {
      baseUrl: this.options.apiUrl,
    });

    const { data: commit } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref,
    });

    return {
      author: {
        username: commit.author?.login,
      },
      committer: {
        username: commit.committer?.login,
      },
      sha: commit.sha,
      message: commit.commit.message,
      timestamp: commit.commit.committer?.date,
      url: commit.html_url,
    };
  }
}

export interface Benchmark {
  commit: Commit;
  date: number;
  benches: BenchmarkResult[];
}

interface BenchmarkResult {
  name: string;
  value: number;
  range?: string;
  unit: string;
  allocated?: number;
}

interface BenchmarkDotnetBenchmark {
  FullName: string;
  Statistics: {
    StandardDeviation: number;
    Mean: number;
  };
  Memory?: {
    Gen0Collections: number;
    Gen1Collections: number;
    Gen2Collections: number;
    TotalOperations: number;
    BytesAllocatedPerOperation: number;
  };
}

interface BenchmarkDotNetResults {
  Title: string;
  Benchmarks: BenchmarkDotnetBenchmark[];
}

interface GitHubUser {
  username?: string;
}

interface Commit {
  author: GitHubUser;
  committer: GitHubUser;
  sha: string;
  message: string;
  timestamp?: string;
  url: string;
}

type BenchmarkSuites = { [name: string]: Benchmark[] };

interface BenchmarksData {
  lastUpdated: number;
  repoUrl: string;
  entries: BenchmarkSuites;
}
