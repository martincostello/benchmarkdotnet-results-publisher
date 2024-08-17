// Copyright (c) Martin Costello, 2024. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

export interface PublishOptions {
  accessToken: string;
  apiUrl?: string;
  branch: string;
  commitMessage: string;
  maxItems?: number;
  outputFilePath?: string;
  repo: string;
  repoPath: string;
  resultsPath?: string;
  runId?: string;
  runRepo?: string;
  serverUrl?: string;
  userEmail: string;
  userName: string;
}
