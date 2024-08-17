// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as fs from 'fs';
import * as path from 'path';

import { glob } from 'glob';
import { Writable } from 'stream';

import * as core from '@actions/core';
import * as exec from '@actions/exec';

import { PublishOptions } from './PublishOptions';

export class BenchmarksPublisher {
  private readonly options: PublishOptions;

  constructor(options: PublishOptions) {
    this.options = options;
  }

  public static generateCommitMessage(results: BenchmarkResult[]): string {
    // TODO Fix up the message
    const name =
      results.length > 1 ? `${results.length} benchmarks` : results[0].name;
    const messageLines = [
      `Publish results for ${name}`,
      '',
      `Publish BenchmarkDotNet results for ${results.length} benchmarks.`,
      '',
      '---',
      'benchmarks:',
      `- name: ${name}`,
      '...',
      '',
      '',
    ];
    return messageLines.join('\n');
  }

  public async publishResults(): Promise<void> {
    const benchmarks = await this.getBenchmarks();
    if (benchmarks.keys.length > 0) {
      await this.updateResults(benchmarks);
    } else {
      core.info('No benchmarks found to publish.');
    }
  }

  private async findFiles(): Promise<string[]> {
    return await glob(['**/*-report-full-compressed.json'], {
      absolute: true,
      cwd:
        this.options.resultsPath ??
        path.join(this.options.repoPath, 'BenchmarkDotNet.Artifacts'),
      nodir: true,
      realpath: true,
    });
  }

  async getBenchmarks(): Promise<Record<string, BenchmarkResult[]>> {
    const paths = await this.findFiles();

    core.debug(`Found ${paths.length} BenchmarkDotNet JSON result files.`);
    for (const file of paths) {
      core.debug(`  - ${file}`);
    }

    const benchmarks: Record<string, BenchmarkResult[]> = {};

    for (const fileName of paths) {
      const results = await this.parseResults(fileName);
      if (results.length > 0) {
        benchmarks[fileName] = results;
      }
    }

    core.debug(`Found ${Object.keys(benchmarks).length} sets of benchmarks.`);
    for (const file in benchmarks) {
      core.debug(`  - '${file}':`);
      for (const result of benchmarks[file]) {
        core.debug(`  - ${result.name}`);
      }
    }

    return benchmarks;
  }

  private async parseResults(fileName: string): Promise<BenchmarkResult[]> {
    try {
      const json = await fs.promises.readFile(fileName, { encoding: 'utf8' });
      const data: BenchmarkDotNetResults = JSON.parse(json);

      return data.Benchmarks.map((benchmark) => {
        const name = benchmark.FullName;
        const value = benchmark.Statistics.Mean;
        const stdDev = benchmark.Statistics.StandardDeviation;
        const range = `± ${stdDev}`;
        return { name, value, unit: 'ns', range };
      });
    } catch (error) {
      core.debug(`Failed to parse '${fileName}': ${error}`);
      throw new Error(
        `Failed to parse '${fileName}' as BenchmarkDotNet JSON output. Results must be a JSON file generated with the '--exporters json' option: ${error}`
      );
    }
  }

  private async execGit(
    args: string[],
    ignoreErrors: Boolean = false
  ): Promise<string> {
    let commandOutput = '';
    let commandError = '';

    const options = {
      cwd: this.options.repoPath,
      errStream: new NullWritable(),
      outStream: new NullWritable(),
      ignoreReturnCode: ignoreErrors as boolean | undefined,
      silent: ignoreErrors as boolean | undefined,
      listeners: {
        stdout: (data: Buffer) => {
          commandOutput += data.toString();
        },
        stderr: (data: Buffer) => {
          commandError += data.toString();
        },
      },
    };

    const userName = this.options.userEmail ?? 'github-actions[bot]';
    const userEmail =
      this.options.userEmail ?? 'github-actions[bot]@users.noreply.github.com';
    const serverUrl = new URL(
      this.options.serverUrl ??
        process.env.GITHUB_SERVER_URL ??
        'https://github.com'
    ).origin;

    const argsWithConfig = [
      ...args,
      '-c',
      `user.name=${userName}`,
      '-c',
      `user.email=${userEmail}`,
      '-c',
      `http.${serverUrl}/.extraheader=`, // This is necessary to support actions/checkout@v2
    ];

    try {
      await exec.exec('git', argsWithConfig, options);
    } catch (error: any) {
      throw new Error(`The command 'git ${args.join(' ')}' failed: ${error}`);
    }

    if (commandError && !ignoreErrors) {
      throw new Error(commandError);
    }

    core.debug(`git std-out: ${commandOutput}`);

    if (commandError) {
      core.debug(`git std-err: ${commandError}`);
    }

    return commandOutput.trimEnd();
  }

  private async updateResults(
    benchmarks: Record<string, BenchmarkResult[]>
  ): Promise<string | null> {
    let filesUpdated = 0;

    // Apply the updates to the file system
    for (const file in benchmarks) {
      let results: BenchmarkResult[] = [];

      if (fs.existsSync(file)) {
        const json = await fs.promises.readFile(file, { encoding: 'utf8' });
        results = JSON.parse(json);
      } else {
        await fs.promises.writeFile(file, '[]', { encoding: 'utf8' });
      }

      let dirty = false;
      const added = benchmarks[file];

      if (added.length > 0) {
        results = results.concat(added);

        if (this.options.maxItems && results.length > this.options.maxItems) {
          results = results.slice(results.length - this.options.maxItems);
        }

        dirty = true;
      }

      if (dirty) {
        const content = JSON.stringify(results, null, 2);
        await fs.promises.writeFile(file, content, { encoding: 'utf8' });
        filesUpdated++;
      }
    }

    if (filesUpdated < 1) {
      return null;
    }

    // Configure Git
    let branch = this.options.branch;

    if (!branch) {
      branch = 'gh-pages';
    }

    let commitMessage = this.options.commitMessage;

    if (!commitMessage) {
      commitMessage = BenchmarksPublisher.generateCommitMessage(
        benchmarks.entries
      );
    }

    // TODO Need to clone the repo into another directory if it is not this repo
    if (this.options.repo) {
      await this.execGit([
        'remote',
        'set-url',
        'origin',
        `${this.options.serverUrl}/${this.options.repo}.git`,
      ]);
      await this.execGit(['fetch', 'origin'], true);
    }

    core.debug(`Branch: ${branch}`);
    core.debug(`Commit message: ${commitMessage}`);
    core.debug(`User name: ${this.options.userName}`);
    core.debug(`User email: ${this.options.userEmail}`);

    const branchExists = await this.execGit(
      ['rev-parse', '--verify', '--quiet', `remotes/origin/${branch}`],
      true
    );

    if (!branchExists) {
      throw new Error(`The ${branch} branch does not exist.`);
    }

    await this.execGit(['checkout', branch], true);
    core.info(`Checked out git branch ${branch}`);

    // Stage all the file system changes
    await this.execGit(['add', '.']);
    core.info('Staged git commit for benchmarks update');

    await this.execGit(['commit', '-m', commitMessage, '-s']);

    const sha1 = await this.execGit(['log', "--format='%H'", '-n', '1']);
    const shortSha1 = sha1.replace(/'/g, '').substring(0, 7);

    core.info(`Committed benchmarks update update to git (${shortSha1})`);

    if (this.options.repo) {
      await this.execGit(['push', '-u', 'origin', branch], true);
      core.info(`Pushed changes to repository (${this.options.repo})`);
    }

    return branch;
  }
}

class NullWritable extends Writable {
  _write(
    _chunk: any,
    _encoding: string,
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
  _writev(
    _chunks: { chunk: any; encoding: string }[],
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
}

interface BenchmarkResult {
  name: string;
}

interface BenchmarkDotnetBenchmark {
  FullName: string;
  Statistics: {
    StandardDeviation: number;
    Mean: number;
  };
}

interface BenchmarkDotNetResults {
  Benchmarks: BenchmarkDotnetBenchmark[];
}
