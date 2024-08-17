# BenchmarkDotNet Results Publisher

[![Build status][build-badge]][build-status]
[![codecov][coverage-badge]][coverage-report]
[![OpenSSF Scorecard][scorecard-badge]][scorecard-report]

This action publishes results from [BenchmarkDotNet][benchmarkdotnet] benchmarks to a GitHub repository.

This action was inspired by the [benchmark-action/github-action-benchmark][github-action-benchmark] action.

<!--

Documention TODO:
- Warn to not use on pull requests to commit to the same branch to avoid circular workflows
- Add a note about the GitHub token being required to be able to push to the repository if not the same repository

Features TODO:
- Comment on commits if threshold (time or memory) exceeded
- Comment on pull request source if threshold (time or memory) exceeded
- Fail the workflow if threshold exceeded
- Output GITHUB_STEP_SUMMARY of the `*-report.github.md` files

-->

## Example Usage

Below is an example of a full GitHub Actions workflow to run the benchmarks in a .NET
project and then publish the results to the `gh-pages` branch of the same GitHub repository.

```yml
name: benchmark

on:
  push:
    branches: [ main ]

permissions:
  contents: read

jobs:
  benchmark:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-dotnet@v4
    - run: dotnet run --project Benchmarks.csproj --configuration Release
    - uses: martincostello/benchmarkdotnet-results-publisher@v1
```

## Inputs

| **Name** | **Description** | **Default** |
|:--|:--|:--|
| `branch` | The optional Git branch to push the results to. | `gh-pages` |
| `commit-message` | The optional Git commit message to use. | - |
| `max-items` | The optional maximum number of results to include for each suite of benchmark results. | Unlimited |
| `name` | The optional name to use to group the benchmark results that are found into suites. | Inferred from BenchmarkDotNet results |
| `output-file-path` | The optional path of the file to write the results to. | `./data.json` |
| `repo` | The optional GitHub repository to push the results to. | [`github.repository`][github-context] |
| `repo-token` | The GitHub access token to use to push the results to a GitHub repository. | [`github.token`][github-token] |
| `results-path` | The optional path of the BenchmarkDotNet results directory to process. | `./BenchmarkDotNet.Artifacts` |

## Outputs

None.

## Feedback

Any feedback or issues can be added to the issues for this project in [GitHub][issues].

## Repository

The repository is hosted in [GitHub][repo]: <https://github.com/martincostello/benchmarkdotnet-results-publisher.git>

## License

This project is licensed under the [Apache 2.0][license] license.

[benchmarkdotnet]: https://github.com/dotnet/BenchmarkDotNet "BenchmarkDotNet on GitHub.com"
[build-badge]: https://github.com/martincostello/benchmarkdotnet-results-publisher/workflows/build.yml/badge.svg?branch=main&event=push
[build-status]: https://github.com/martincostello/benchmarkdotnet-results-publisher/actions?query=workflow%3Abuild+branch%3Amain+event%3Apush "Continuous Integration for this project"
[coverage-badge]: https://codecov.io/gh/martincostello/benchmarkdotnet-results-publisher/branch/main/graph/badge.svg
[coverage-report]: https://codecov.io/gh/martincostello/benchmarkdotnet-results-publisher "Code coverage report for this project"
[github-action-benchmark]: https://github.com/benchmark-action/github-action-benchmark "The benchmark-action/github-action-benchmark repository on GitHub.com"
[github-context]: https://docs.github.com/actions/learn-github-actions/contexts#github-context "Accessing contextual information about workflow runs"
[github-token]: https://docs.github.com/actions/security-for-github-actions/security-guides/automatic-token-authentication "Automatic token authentication"
[issues]: https://github.com/martincostello/benchmarkdotnet-results-publisher/issues "Issues for this project on GitHub.com"
[license]: https://www.apache.org/licenses/LICENSE-2.0.txt "The Apache 2.0 license"
[repo]: https://github.com/martincostello/benchmarkdotnet-results-publisher "This project on GitHub.com"
[scorecard-badge]: https://api.securityscorecards.dev/projects/github.com/martincostello/benchmarkdotnet-results-publisher/badge
[scorecard-report]: https://securityscorecards.dev/viewer/?uri=github.com/martincostello/benchmarkdotnet-results-publisher "OpenSSF Scorecard for this project"
