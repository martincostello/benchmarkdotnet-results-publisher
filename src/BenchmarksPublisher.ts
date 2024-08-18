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
    const count = Object.keys(benchmarks).length;
    if (count > 0) {
      core.info(
        `Found ${count} BenchmarkDotNet result${count === 1 ? '' : 's'}.`
      );
      await this.publishResults(benchmarks);
    } else {
      core.warning('No BenchmarkDotNet results found to publish.');
    }
  }

  private async findJsonResults(): Promise<string[]> {
    let cwd = this.options.resultsPath;
    if (!cwd) {
      cwd = path.join(this.options.repoPath, 'BenchmarkDotNet.Artifacts');
    }
    return await glob(['**/*-report-full-compressed.json'], {
      absolute: true,
      cwd,
      nodir: true,
      realpath: true,
    });
  }

  private async getBenchmarks(): Promise<
    Record<string, BenchmarkDotNetResults>
  > {
    const paths = await this.findJsonResults();

    if (core.isDebug()) {
      core.debug(`Found ${paths.length} BenchmarkDotNet JSON result files.`);
      for (const fileName of paths) {
        core.debug(`  - ${fileName}`);
      }
    }

    const results: Record<string, BenchmarkDotNetResults> = {};

    for (const fileName of paths) {
      results[fileName] = await this.parseResults(fileName);
    }

    if (core.isDebug()) {
      core.debug(`Found ${Object.keys(results).length} sets of benchmarks.`);
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
    let branch = this.options.branch;
    if (!branch) {
      branch = 'gh-pages';
    }
    return branch;
  }

  private getResultsPath(): string {
    let filePath = this.options.outputFilePath;
    if (!filePath) {
      filePath = 'data.json';
    }
    return filePath;
  }

  private async getCurrentResults(): Promise<{
    data: BenchmarksData;
    sha: string | undefined;
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
          sha: undefined,
        };
      }
      throw error;
    }
  }

  private generateCommitMessage(names: string[], sha: string): string {
    const messageLines = [
      names.length > 1
        ? `Publish ${names.length} benchmarks results for ${this.options.runRepo}`
        : `Publish benchmarks results for ${this.options.runRepo}`,
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
    sha: string | undefined,
    results: BenchmarksData
  ): Promise<boolean> {
    const [owner, repo] = this.options.repo.split('/');
    const branch = this.getBranch();
    const fileName = this.getResultsPath();

    let message = this.options.commitMessage;
    if (!message) {
      message = this.generateCommitMessage(
        Object.keys(results.entries),
        this.options.sha
      );
    }

    const json = JSON.stringify(results, null, 2);
    const content = Buffer.from(json, 'utf8').toString('base64');

    const octokit = github.getOctokit(this.options.accessToken, {
      baseUrl: this.options.apiUrl,
    });

    try {
      await this.ensureBranch(owner, repo, branch);

      const { data: commit } =
        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          branch,
          path: fileName,
          sha,
          message,
          content,
        });

      core.info(
        `Updated ${fileName} in ${owner}/${repo}@${branch}. Commit SHA ${commit.content?.sha?.substring(0, 7)}.`
      );
      return true;
    } catch (error: any) {
      if (error['status'] === 409) {
        return false;
      }
      throw error;
    }
  }

  private async ensureBranch(
    owner: string,
    repo: string,
    branch: string
  ): Promise<void> {
    const octokit = github.getOctokit(this.options.accessToken, {
      baseUrl: this.options.apiUrl,
    });

    let exists: boolean;

    try {
      await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch,
      });
      exists = true;
    } catch (error: any) {
      if (error['status'] === 404) {
        exists = false;
      } else {
        throw error;
      }
    }

    if (!exists) {
      const { data: repository } = await octokit.rest.repos.get({
        owner,
        repo,
      });
      const { data: defaultBranch } = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: repository.default_branch,
      });
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
        sha: defaultBranch.commit.sha,
      });
    }
  }

  private mergeResults(
    existingData: BenchmarksData,
    results: Record<string, BenchmarkDotNetResults>,
    commit: Commit
  ): BenchmarksData {
    const now = Date.now();
    const mergedData = { ...existingData, lastUpdated: now };

    for (const fileName in results) {
      const result = results[fileName];

      let suiteName = this.options.name;
      if (!suiteName) {
        suiteName = result.Title.split('-')[0];
      }

      let suite = mergedData.entries[suiteName] ?? [];

      const items: BenchmarkResult[] = [];

      for (const benchmark of result.Benchmarks) {
        const item: BenchmarkResult = {
          name: benchmark.FullName,
          value: benchmark.Statistics.Mean,
          unit: 'ns',
          range: `± ${benchmark.Statistics.StandardDeviation}`,
        };

        if (benchmark.Memory) {
          item.bytesAllocated = benchmark.Memory.BytesAllocatedPerOperation;
        }

        items.push(item);
      }

      suite.push({
        commit,
        date: now,
        benches: items,
      });

      if (this.options.maxItems && suite.length > this.options.maxItems) {
        core.debug(
          `Suite ${suiteName} contains ${suite.length} items. Truncating to configured maximum of ${this.options.maxItems}.`
        );
        suite = suite.slice(suite.length - this.options.maxItems);
      }

      mergedData.entries[suiteName] = suite;
    }

    return mergedData;
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
  bytesAllocated?: number;
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
