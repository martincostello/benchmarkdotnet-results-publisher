// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as exec from '@actions/exec';
import * as fs from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export async function createEmptyFile(fileName: string) {
  await fs.promises.writeFile(fileName, '');
}

export async function createTemporaryDirectory(): Promise<string> {
  return await fs.promises.mkdtemp(
    join(tmpdir(), 'benchmarkdotnet-results-publisher-')
  );
}

export async function createGitRepo(
  repository: string,
  files: { path: string; data: string }[]
): Promise<void> {
  const cwd = repository;
  const ignoreReturnCode = true;

  for (const { path, data } of files) {
    await fs.promises.writeFile(join(cwd, path), data);
  }

  const git = async (...args: string[]): Promise<void> => {
    await execGit(args, cwd, ignoreReturnCode);
  };

  await git('init', '--initial-branch=main');
  await git('config', 'core.safecrlf', 'false');
  await git('config', 'user.email', 'test@test.local');
  await git('config', 'user.name', 'test');
  await git(
    'remote',
    'add',
    'origin',
    'https://github.local/martincostello/benchmarkdotnet-results-publisher.git'
  );
  await git('add', '.');
  await git('commit', '-m', 'Initial commit');
}

export async function execGit(
  args: string[],
  cwd: string,
  ignoreReturnCode: boolean = false
): Promise<string> {
  let commandOutput = '';
  let commandError = '';

  const options = {
    cwd,
    ignoreReturnCode,
    silent: ignoreReturnCode,
    listeners: {
      stdout: (data: Buffer) => {
        commandOutput += data.toString();
      },
      stderr: (data: Buffer) => {
        commandError += data.toString();
      },
    },
  };

  try {
    await exec.exec('git', args, options);
  } catch (error: any) {
    throw new Error(`The command 'git ${args.join(' ')}' failed: ${error}`);
  }

  if (commandError && !ignoreReturnCode) {
    throw new Error(commandError);
  }

  return commandOutput.trimEnd();
}
