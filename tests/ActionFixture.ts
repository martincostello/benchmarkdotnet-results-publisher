// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { vi } from 'vitest';

vi.mock('@actions/core', async () => {
  const actual =
    await vi.importActual<typeof import('@actions/core')>('@actions/core');

  const mockSummary = {
    ...actual.summary,
    addRaw: vi.fn(function (this: any) {
      return this;
    }),
    addHeading: vi.fn(function (this: any) {
      return this;
    }),
    addEOL: vi.fn(function (this: any) {
      return this;
    }),
    emptyBuffer: vi.fn(function (this: any) {
      return this;
    }),
    stringify: vi.fn(() => ''),
    write: vi.fn(function (this: any) {
      return this;
    }),
  };

  Object.keys(mockSummary).forEach((key) => {
    const fn = mockSummary[key as keyof typeof mockSummary];
    if (typeof fn === 'function' && fn.mockReturnThis) {
      (fn as any).mockReturnValue(mockSummary);
    }
  });

  return {
    ...actual,
    setFailed: vi.fn(),
    isDebug: vi.fn(() => true),
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    notice: vi.fn(),
    error: vi.fn(),
    summary: mockSummary,
  };
});

vi.mock('@actions/github', async () => {
  const actual =
    await vi.importActual<typeof import('@actions/github')>('@actions/github');

  const ContextConstructor = actual.context.constructor;

  return {
    ...actual,
    get context() {
      return new ContextConstructor();
    },
  };
});

import * as core from '@actions/core';
import * as fs from 'fs';
import * as io from '@actions/io';
import * as os from 'os';
import * as path from 'path';
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
      'INPUT_COMMENT-ON-THRESHOLD': 'true',
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
    vi.mocked(core.setFailed).mockImplementation(() => {
      this.failed = true;
    });
    this.setupLogging();
  }

  private setupLogging(): void {
    const logger = (level: string, arg: string | Error) => {
      console.debug(`[${level}] ${arg}`);
    };

    vi.mocked(core.isDebug).mockImplementation(() => {
      return true;
    });
    vi.mocked(core.debug).mockImplementation((arg) => {
      logger('debug', arg);
    });
    vi.mocked(core.info).mockImplementation((arg) => {
      logger('info', arg);
    });
    vi.mocked(core.notice).mockImplementation((arg) => {
      logger('notice', arg);
    });
    vi.mocked(core.warning).mockImplementation((arg) => {
      logger('warning', arg);
    });
    vi.mocked(core.error).mockImplementation((arg) => {
      logger('error', arg);
      this.errors.push(arg);
    });

    vi.mocked(core.summary.addRaw).mockImplementation((text: string) => {
      this.stepSummary += text;
      return core.summary;
    });
    vi.mocked(core.summary.addHeading).mockImplementation(
      (text: string, level?: string | number) => {
        const headingLevel = level || 1;
        this.stepSummary += `<h${headingLevel}>${text}</h${headingLevel}>\n\n`;
        return core.summary;
      }
    );
    vi.mocked(core.summary.addEOL).mockImplementation(() => {
      return core.summary;
    });
    vi.mocked(core.summary.write).mockReturnThis();
  }
}
