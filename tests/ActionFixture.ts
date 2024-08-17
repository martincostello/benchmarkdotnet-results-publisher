// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as core from '@actions/core';
import * as fs from 'fs';
import * as io from '@actions/io';
import * as os from 'os';
import * as path from 'path';
import { jest } from '@jest/globals';
import {
  createEmptyFile,
  createGitRepo,
  createTemporaryDirectory,
  execGit,
} from './helpers';
import { run } from '../src/main';

export class ActionFixture {
  public pullNumber: string = '42';
  public repo: string = 'martincostello/benchmarkdotnet-results-publisher';
  public stepSummary: string = '';

  private tempDir: string = '';
  private outputPath: string = '';
  private outputs: Record<string, string> = {};

  constructor(private readonly fileExtensions = 'cshtml,html,razor') {}

  get path(): string {
    return this.tempDir;
  }

  async initialize(
    testFiles: { path: string; data: string }[] = []
  ): Promise<void> {
    this.tempDir = await createTemporaryDirectory();
    this.outputPath = path.join(this.tempDir, 'github-outputs');

    await createEmptyFile(this.outputPath);
    await createGitRepo(this.tempDir, testFiles);

    this.setupEnvironment();
    this.setupMocks();
  }

  async run(): Promise<void> {
    await run();

    const content = await fs.promises.readFile(this.outputPath, 'utf8');

    const lines = content.split(os.EOL);
    for (let index = 0; index < lines.length; index += 3) {
      const key = lines[index].split('<<')[0];
      const value = lines[index + 1];
      this.outputs[key] = value;
    }
  }

  async destroy(): Promise<void> {
    try {
      await io.rmRF(this.tempDir);
    } catch {
      console.log(`Failed to remove fixture directory '${this.path}'.`);
    }
  }

  getOutput(name: string): string {
    return this.outputs[name];
  }

  async checkout(branch: string): Promise<void> {
    await execGit(['checkout', branch], this.tempDir, true);
  }

  async commitHistory(count: number = 1): Promise<string[]> {
    const history = await execGit(
      ['log', (count * -1).toString(10), '--pretty=%B'],
      this.tempDir
    );
    return history.split('\n').filter((p) => p.length > 0);
  }

  async diff(
    count: number = 1,
    nameOnly: boolean = false
  ): Promise<string | string[]> {
    const args = ['diff', `HEAD~${count}`, 'HEAD'];
    if (nameOnly) {
      args.push('--name-only');
    }
    const result = await execGit(args, this.tempDir);

    if (nameOnly) {
      return result.split('\n').filter((p) => p.length > 0);
    } else {
      return result;
    }
  }

  async getContent(fileName: string): Promise<string> {
    fileName = path.join(this.tempDir, fileName);
    return await fs.promises.readFile(fileName, { encoding: 'utf8' });
  }

  private setupEnvironment(): void {
    const inputs = {
      'GITHUB_API_URL': 'https://github.local/api/v3',
      'GITHUB_OUTPUT': this.outputPath,
      'GITHUB_REPOSITORY': this.repo,
      'GITHUB_RUN_ID': '123',
      'GITHUB_SERVER_URL': 'https://github.local',
      'INPUT_FILE-EXTENSIONS': this.fileExtensions,
      'INPUT_LABELS': 'foo,bar',
      'INPUT_REPO': this.repo,
      'INPUT_REPO-PATH': this.tempDir,
      'INPUT_REPO-TOKEN': 'my-token',
      'INPUT_USER-EMAIL': 'github-actions[bot]@users.noreply.github.com',
      'INPUT_USER-NAME': 'github-actions[bot]',
    };

    for (const key in inputs) {
      process.env[key] = inputs[key as keyof typeof inputs];
    }
  }

  private setupMocks(): void {
    jest.spyOn(core, 'setFailed').mockImplementation(() => {});
    this.setupLogging();
  }

  private setupLogging(): void {
    const logger = (level: string, arg: string | Error) => {
      console.debug(`[${level}] ${arg}`);
    };

    jest.spyOn(core, 'debug').mockImplementation((arg) => {
      logger('debug', arg);
    });
    jest.spyOn(core, 'info').mockImplementation((arg) => {
      logger('info', arg);
    });
    jest.spyOn(core, 'notice').mockImplementation((arg) => {
      logger('notice', arg);
    });
    jest.spyOn(core, 'warning').mockImplementation((arg) => {
      logger('warning', arg);
    });
    jest.spyOn(core, 'error').mockImplementation((arg) => {
      logger('error', arg);
    });

    jest.spyOn(core.summary, 'addRaw').mockImplementation((text: string) => {
      this.stepSummary += text;
      return core.summary;
    });
    jest.spyOn(core.summary, 'write').mockReturnThis();
  }
}
