// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as core from '@actions/core';
import * as fs from 'fs';
import * as io from '@actions/io';
import * as os from 'os';
import * as path from 'path';
import { jest } from '@jest/globals';
import { run } from '../src/main';

export class ActionFixture {
  public repo: string = 'martincostello/benchmark-repo';
  public stepSummary: string = '';

  private failed = false;
  private errors: (string | Error)[] = [];
  private tempDir: string = '';
  private outputPath: string = '';
  private outputs: Record<string, string> = {};

  constructor() {}

  get success(): boolean {
    return !this.failed;
  }

  get path(): string {
    return this.tempDir;
  }

  async initialize(fixture: string): Promise<void> {
    this.tempDir = await this.createTemporaryDirectory();

    const source = path.join(
      __dirname,
      'fixtures',
      fixture,
      'BenchmarkDotNet.Artifacts'
    );
    const destination = path.join(this.tempDir);
    await io.cp(source, destination, { recursive: true });

    this.outputPath = path.join(this.tempDir, 'github-outputs');
    await this.createEmptyFile(this.outputPath);

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

  getErrors(): (string | Error)[] {
    return this.errors;
  }

  getOutput(name: string): string {
    return this.outputs[name];
  }

  private async createEmptyFile(fileName: string) {
    await fs.promises.writeFile(fileName, '');
  }

  private async createTemporaryDirectory(): Promise<string> {
    return await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'benchmarkdotnet-results-publisher-')
    );
  }

  private setupEnvironment(): void {
    const inputs = {
      'GITHUB_API_URL': 'https://github.local/api/v3',
      'GITHUB_OUTPUT': this.outputPath,
      'GITHUB_REPOSITORY': this.repo,
      'GITHUB_RUN_ID': '123',
      'GITHUB_SERVER_URL': 'https://github.local',
      'GITHUB_SHA': '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
      'GITHUB_WORKSPACE': this.tempDir,
      'INPUT_COMMENT-ON-THRESHOLD': 'false',
      'INPUT_FAIL-ON-THRESHOLD': 'true',
      'INPUT_MAX-ITEMS': '1000',
      'INPUT_OUTPUT-STEP-SUMMARY': 'true',
      'INPUT_REPO': this.repo,
      'INPUT_REPO-TOKEN': 'my-token',
    };

    for (const key in inputs) {
      process.env[key] = inputs[key as keyof typeof inputs];
    }
  }

  private setupMocks(): void {
    jest.spyOn(core, 'setFailed').mockImplementation(() => {
      this.failed = true;
    });
    this.setupLogging();
  }

  private setupLogging(): void {
    const logger = (level: string, arg: string | Error) => {
      console.debug(`[${level}] ${arg}`);
    };

    jest.spyOn(core, 'isDebug').mockImplementation(() => {
      return true;
    });
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
      this.errors.push(arg);
    });

    jest.spyOn(core.summary, 'addRaw').mockImplementation((text: string) => {
      this.stepSummary += text;
      return core.summary;
    });
    jest.spyOn(core.summary, 'write').mockReturnThis();
  }
}
