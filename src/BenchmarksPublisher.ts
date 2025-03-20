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
  private readonly markdownResultSuffix = '-report-github';
  private readonly commentWatermark =
    '<!-- martincostello/benchmarkdotnet-results-publisher -->';

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
      const deltas = await this.publishResults(benchmarks);

      if (this.options.outputStepSummary) {
        await this.generateSummary();
      }

      if (this.options.commentOnThreshold || this.options.failOnThreshold) {
        const hasRegressions = await this.processDeltas(deltas);
        if (hasRegressions && this.options.failOnThreshold) {
          core.setFailed(`One or more benchmarks' values have regressed.`);
        }
      }
    } else {
      core.warning('No BenchmarkDotNet results found to publish.');
    }
  }

  private async findJsonResults(): Promise<string[]> {
    return await this.findResults('**/*-report-full-compressed.json');
  }

  private async findMarkdownResults(): Promise<string[]> {
    return await this.findResults(`**/*${this.markdownResultSuffix}.md`);
  }

  private async findResults(pattern: string): Promise<string[]> {
    return await glob([pattern], {
      absolute: true,
      cwd: this.getArtifactsPath(),
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

  private getArtifactsPath(): string {
    let artifacts = this.options.resultsPath;
    if (!artifacts) {
      artifacts = path.join(this.options.repoPath, 'BenchmarkDotNet.Artifacts');
    }
    return artifacts;
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

  private getRunRepository(): string {
    if (!this.options.runRepo) {
      throw new Error(
        'Failed to determine the repository associated with the current workflow run.'
      );
    }
    return this.options.runRepo;
  }

  private getWorkflowRunUrl(): string {
    return `${this.options.serverUrl}/${this.options.runRepo}/actions/runs/${this.options.runId}`;
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

    await this.ensureBranch(owner, repo, ref);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  private generateCommitMessage(
    names: string[],
    sha: string,
    prefix: string
  ): string {
    if (prefix && prefix.length > 0) {
      prefix = `${prefix.trimEnd()} `;
    }

    const messageLines = [
      names.length > 1
        ? `${prefix}Publish ${names.length} benchmarks results for ${this.options.runRepo}`
        : `${prefix}Publish benchmarks results for ${this.options.runRepo}`,
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
      `Generated from ${this.options.runRepo}@${sha} by ${this.getWorkflowRunUrl()}.`,
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
        this.options.sha,
        this.options.commitMessagePrefix
      );
    }

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
          sha,
          message,
          content,
        });

      core.info(
        `Updated ${fileName} in ${owner}/${repo}@${branch}. Commit SHA ${commit.content?.sha?.substring(0, 7)}.`
      );
      return true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error['status'] === 409) {
        core.warning(
          `Failed to create or update ${fileName} for branch ${branch} in repository ${owner}/${repo}: ${error}`
        );
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          value: benchmark.Statistics?.Mean ?? NaN,
          unit: 'ns',
          range: benchmark.Statistics
            ? `± ${benchmark.Statistics?.StandardDeviation}`
            : undefined,
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
  ): Promise<Record<string, BenchmarksDelta[]>> {
    const commit = await this.getCurrentCommit();

    let attempts = 0;
    const maxRetries = 3;

    while (attempts < maxRetries) {
      const { data, sha } = await this.getCurrentResults();
      const merged = this.mergeResults(data, benchmarks, commit);
      if (await this.updateResults(sha, merged)) {
        const results: Record<string, BenchmarksDelta[]> = {};

        for (const suiteName in merged.entries) {
          const suite = merged.entries[suiteName];

          const currentBenchmark = suite[suite.length - 1];
          const previousBenchmark =
            suite.length > 1 ? suite[suite.length - 2] : null;

          const deltas: BenchmarksDelta[] = [];

          for (const current of currentBenchmark.benches) {
            const previous = previousBenchmark?.benches.find(
              (b) => b.name === current.name
            );

            if (!previous) {
              continue;
            }

            deltas.push({
              current,
              previous,
            });
          }

          results[suiteName] = deltas;
        }

        return results;
      }

      attempts++;
    }

    throw new Error(`Failed to update results after ${maxRetries} attempts.`);
  }

  private async getCurrentCommit(): Promise<Commit> {
    const [owner, repo] = this.getRunRepository().split('/');
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

  private async generateSummary(): Promise<string | null> {
    const fileNames = await this.findMarkdownResults();

    if (fileNames.length < 1) {
      return null;
    }

    let summary = core.summary;

    for (const fileName of fileNames) {
      const markdown = await fs.promises.readFile(fileName, {
        encoding: 'utf8',
      });

      const title = path
        .basename(fileName, '.md')
        .replace(this.markdownResultSuffix, '');

      summary = summary.addHeading(title, 3).addEOL().addRaw(markdown).addEOL();
    }

    const result = summary.stringify();

    if (process.env['GITHUB_STEP_SUMMARY']) {
      await summary.write();
    }

    summary.emptyBuffer();

    return result;
  }

  private async processDeltas(
    deltas: Record<string, BenchmarksDelta[]>
  ): Promise<boolean> {
    const durationThreshold = this.options.failThresholdDuration ?? 2;
    const memoryThreshold = this.options.failThresholdMemory ?? 2;

    let hasRegressions = false;
    const regressions: Record<string, BenchmarkRegression[]> = {};

    for (const suiteName in deltas) {
      const suite = deltas[suiteName];
      const suiteRegressions: BenchmarkRegression[] = [];

      for (const delta of suite) {
        const current = delta.current;
        const previous = delta.previous;

        if (!previous || previous.value === 0) {
          continue;
        }

        const durationDelta = current.value - previous.value;
        const durationRatio = durationDelta / previous.value;
        const durationPercentage = durationRatio * 100;

        if (core.isDebug() && current.value !== previous.value) {
          core.debug(
            `Benchmark '${current.name}' from suite ${suiteName} changed by ${durationDelta.toFixed(2)} ns (${durationPercentage.toFixed(2)}%)`
          );
        }

        if (durationRatio > durationThreshold) {
          core.warning(
            `Benchmark '${current.name}' from suite ${suiteName} has regressed by ${durationDelta.toFixed(2)} ns (${durationPercentage.toFixed(2)}%)`
          );
          suiteRegressions.push({
            name: current.name,
            type: 'duration',
            current: current.value,
            previous: previous.value,
            percentage: durationPercentage,
            ratio: durationRatio,
          });
        }

        if (current.bytesAllocated && previous.bytesAllocated) {
          const memoryDelta = current.bytesAllocated - previous.bytesAllocated;
          const memoryRatio = memoryDelta / previous.bytesAllocated;
          const memoryPercentage = memoryRatio * 100;

          if (
            core.isDebug() &&
            current.bytesAllocated !== previous.bytesAllocated
          ) {
            core.debug(
              `Benchmark '${current.name}' from suite ${suiteName} changed by ${memoryDelta.toFixed(0)} bytes (${memoryPercentage.toFixed(2)}%)`
            );
          }

          if (memoryRatio > memoryThreshold) {
            core.warning(
              `Benchmark '${current.name}' from suite ${suiteName} has regressed by ${memoryDelta.toFixed(0)} bytes (${memoryPercentage.toFixed(2)}%)`
            );
            suiteRegressions.push({
              name: current.name,
              type: 'memory',
              current: current.bytesAllocated,
              previous: previous.bytesAllocated,
              percentage: memoryPercentage,
              ratio: memoryRatio,
            });
          }
        }
      }

      regressions[suiteName] = suiteRegressions;
      hasRegressions = hasRegressions || suiteRegressions.length > 0;
    }

    if (hasRegressions && this.options.commentOnThreshold) {
      await this.leaveComment(regressions);
    }

    return hasRegressions;
  }

  private async leaveComment(
    suiteRegressions: Record<string, BenchmarkRegression[]>
  ): Promise<void> {
    const suiteCount = Object.keys(suiteRegressions).length;
    const firstLine =
      suiteCount === 1
        ? `Performance regressions have been found in the BenchmarkDotNet benchmarks.`
        : `Performance regressions have been found in ${suiteCount} BenchmarkDotNet suite${suiteCount === 1 ? '' : 's'}.`;

    const comment = [
      '### Performance Regression :warning::chart_with_upwards_trend:',
      '',
      firstLine,
      '',
    ];

    const formatValues = (
      previous: number,
      current: number,
      type: RegressionType
    ): {
      previous: string;
      current: string;
    } => {
      let minValue = Math.min(previous, current);
      const factor = 1e-3;
      const units = type === 'memory' ? ['KB', 'MB', 'GB'] : ['µs', 'ms', 's'];
      let unit = type === 'memory' ? 'bytes' : 'ns';

      for (const nextUnit of units) {
        if (minValue < 1000) {
          break;
        }
        minValue *= factor;
        previous *= factor;
        current *= factor;
        unit = nextUnit;
      }

      const formatValue = (value: number): string => {
        if (Number.isInteger(value)) {
          return value.toFixed(0);
        }

        if (value > 0.1) {
          return value.toFixed(2);
        }

        return value.toString();
      };

      return {
        previous: `${formatValue(previous)} ${unit}`,
        current: `${formatValue(current)} ${unit}`,
      };
    };

    for (const suiteName in suiteRegressions) {
      const regressions = suiteRegressions[suiteName];

      if (regressions.length < 1) {
        continue;
      }

      comment.push(
        `#### ${suiteName}`,
        '',
        '| Benchmark | Type | Previous | Current | Ratio |',
        '|-----------|------|---------:|--------:|------:|'
      );

      for (const regression of regressions) {
        const benchmarkName = regression.name.replace(`${suiteName}.`, '');
        const type = regression.type === 'memory' ? 'Allocations' : 'Duration';
        const ratio = regression.ratio.toFixed(2);

        const { previous, current } = formatValues(
          regression.previous,
          regression.current,
          regression.type
        );

        comment.push(
          `| ${benchmarkName} | ${type} | ${previous} | ${current} | ${ratio} |`
        );
      }

      comment.push('');
    }

    comment.push(
      '',
      `<sub>:robot: This comment was generated from [this workflow](${this.getWorkflowRunUrl()}) by [benchmarkdotnet-results-publisher](https://github.com/martincostello/benchmarkdotnet-results-publisher).</sub>`,
      '',
      this.commentWatermark,
      ''
    );

    const text = comment.join('\n');
    await this.postComment(text);
  }

  private async postComment(body: string): Promise<void> {
    const [owner, repo] = this.getRunRepository().split('/');

    const octokit = github.getOctokit(this.options.accessToken, {
      baseUrl: this.options.apiUrl,
    });

    const { data: prs } =
      await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
        owner,
        repo,
        commit_sha: this.options.sha,
      });

    if (prs.length > 0 && prs[0].active_lock_reason === null) {
      const issue_number = prs[0].number;
      await this.postCommentOnPullRequest(owner, repo, issue_number, body);
    } else {
      await this.postCommentOnCommit(owner, repo, this.options.sha, body);
    }
  }

  private async postCommentOnPullRequest(
    owner: string,
    repo: string,
    issue_number: number,
    body: string
  ): Promise<void> {
    const octokit = github.getOctokit(this.options.accessToken, {
      baseUrl: this.options.apiUrl,
    });

    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number,
    });

    let comment_id: number | null = null;

    if (comments.length > 0) {
      const comment = comments.find((item) =>
        item.body?.includes(this.commentWatermark)
      );
      if (comment) {
        comment_id = comment.id;
      }
    }

    if (comment_id) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id,
        body,
      });
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number,
        body,
      });
    }
  }

  private async postCommentOnCommit(
    owner: string,
    repo: string,
    commit_sha: string,
    body: string
  ): Promise<void> {
    const octokit = github.getOctokit(this.options.accessToken, {
      baseUrl: this.options.apiUrl,
    });
    await octokit.rest.repos.createCommitComment({
      owner,
      repo,
      commit_sha,
      body,
    });
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

interface BenchmarksDelta {
  current: BenchmarkResult;
  previous: BenchmarkResult | null;
}

type RegressionType = 'duration' | 'memory';

interface BenchmarkRegression {
  name: string;
  type: RegressionType;
  current: number;
  previous: number;
  percentage: number;
  ratio: number;
}
