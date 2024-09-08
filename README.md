# BenchmarkDotNet Results Publisher

[![Build status][build-badge]][build-status]
[![codecov][coverage-badge]][coverage-report]
[![OpenSSF Scorecard][scorecard-badge]][scorecard-report]

This action publishes results from [BenchmarkDotNet][benchmarkdotnet] benchmarks to a GitHub repository.

This action was inspired by the [benchmark-action/github-action-benchmark][github-action-benchmark] action.

The action generates summarised results from BenchmarkDotNet's [JSON output files][benchmarkdotnet-json]
(such as output with `--exporters json`) and writes a summary of them to a JSON file. The results are then
pushed to a Git branch in the specified repository.

From there, you can then use the results as you please, such as to generate a dasboard to track the performance
of your code over time. An easy way to achieve this is with a static GitHub Pages site and some JavaScript to
render the results.

A repository that demonstrates this approach can be found here: [martincostello/benchmarks-demo][benchmarks-demo].

> [!WARNING]
> Do not use this action with pull requests that come from untrusted sources, such as from public forks or
> Dependabot. A malicious user could craft a pull request that hijacks the permissions of the configured
> GitHub token. See this [GitHub Security blog post][github-token-security] for more information.

## Example Usage

Below is an example of a full GitHub Actions workflow to run the benchmarks in a .NET
project and then publish the results to the `gh-pages` branch of the same GitHub repository.

> [!IMPORTANT]
> If pushing to the same repository, ensure that you do not create a circular workflow
> that triggers itself when the results are pushed to the repository.

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

If you wish to publish the results to a different repository, you can specify the repository
and access token to use as shown in the example below.

> [!IMPORTANT]
> `GITHUB_TOKEN` cannot be used to push results to a different repository.
> You must use a [personal access token][github-pat] or a token for a [GitHub App][github-apps] instead.

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
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-dotnet@v4
    - run: dotnet run --project Benchmarks.csproj --configuration Release
    - uses: martincostello/benchmarkdotnet-results-publisher@v1
      with:
        repo: '${{ github.repository_owner }}/benchmarks' # Publish to a different repository
        repo-token: ${{ secrets.BENCHMARKS_TOKEN }}       # Use a secret for the access token
```

## Use case

This action is useful for projects that use [BenchmarkDotNet][benchmarkdotnet] to run benchmarks
and want to publish the results to a GitHub repository.

For example, I use this action in various repositories of my own, which [publish the results][benchmarks-source]
of their benchmarks to my [benchmarks repository][benchmarks-repo]. That data from that repository is then
consumed by [a GitHub Pages site][benchmarks-site] to display the results using static HTML pages and [Plotly][plotly].

## Features

- Publishes the results of [BenchmarkDotNet][benchmarkdotnet] benchmarks to a Git branch in a GitHub repository.
- Write the Markdown summary of the BenchmarkDotNet results to the workflow run summary.
- Optionally fail the workflow if the duration or memory threshold is exceeded for any benchmark using.
- Optionally posts a comment to a commit or pull request if the duration or memory threshold is exceeded for any benchmark ([example][comment-example]).
- Optionally truncate the number of results for each suite of benchmark results to a fixed sliding window.

> [!TIP]
> This action is only intended to be used to track the _relative_ performance of your benchmarks over time
> when using [GitHub-hosted runners][github-hosted-runners]. For more stable results or for tracking absolute
> performance, consider using a [self-hosted runner][github-self-hosted-runners] to run your benchmarks.

## Inputs

| **Name** | **Description** | **Default** |
|:--|:--|:--|
| `branch` | The optional Git branch to push the results to. | `gh-pages` |
| `comment-on-threshold` | Whether to post a comment if either the duration or memory threshold is exceeded for any benchmark. | `false` |
| `commit-message` | The optional Git commit message to use. | - |
| `commit-message-prefix` | The optional prefix to use when generating Git commit messages if a custom commit message is not used. | - |
| `fail-on-threshold` | Whether to cause the workflow to fail if either the duration or memory threshold is exceeded for any benchmark. | `false` |
| `fail-threshold-duration` | The optional threshold, as a ratio, which determines if the current workflow fails based on the previous result for a duration metric. | `2` (i.e. 200%) |
| `fail-threshold-memory` | The optional threshold, as a ratio, which determines if the current workflow fails based on the previous result for a memory usage metric. | `2` (i.e. 200%) |
| `max-items` | The optional maximum number of results to include for each suite of benchmark results. | Unlimited |
| `name` | The optional name to use to group the benchmark results that are found into suites. | Inferred from BenchmarkDotNet results |
| `output-file-path` | The optional path of the file to write the results to. | `./data.json` |
| `output-step-summary` | Whether to output the Markdown results from BenchmarkDotNet to [`GITHUB_STEP_SUMMARY`][github-step-summary]. | `true` |
| `repo` | The optional GitHub repository to push the results to. | [`github.repository`][github-context] |
| `repo-token` | The GitHub access token to use to push the results to a GitHub repository. | [`github.token`][github-token] |
| `results-path` | The optional path of the BenchmarkDotNet results directory to process. | `./BenchmarkDotNet.Artifacts` |

## Outputs

None.

## Permissions

This action requires the following permissions, depending on the features used:

- `contents: write` - Required to read and write the results to the target repository.
- `issues: write` - Required to post comments if `comment-on-threshold` is enabled.

## Feedback

Any feedback or issues can be added to the issues for this project in [GitHub][issues].

## Repository

The repository is hosted in [GitHub][repo]: <https://github.com/martincostello/benchmarkdotnet-results-publisher.git>

## License

This project is licensed under the [Apache 2.0][license] license.

[benchmarkdotnet]: https://github.com/dotnet/BenchmarkDotNet "BenchmarkDotNet on GitHub.com"
[benchmarkdotnet-json]: https://benchmarkdotnet.org/articles/configs/exporters.html?q=export#sample-introexportjson "BenchmarkDotNet exporters documentation"
[benchmarks-demo]: https://github.com/martincostello/benchmarks-demo "The martincostello/benchmarks-demo repository on GitHub.com"
[benchmarks-repo]: https://github.com/martincostello/benchmarks "The martincostello/benchmarks repository on GitHub.com"
[benchmarks-site]: https://benchmarks.martincostello.com "My benchmarks tracking website"
[benchmarks-source]: https://github.com/martincostello/project-euler/blob/3cc5b07f1f609457813f9045c689058c0b679a6c/.github/workflows/benchmark-ci.yml#L38-L66 "Example usage of the action in a GitHub Actions workflow"
[build-badge]: https://github.com/martincostello/benchmarkdotnet-results-publisher/actions/workflows/build.yml/badge.svg?branch=main&event=push
[build-status]: https://github.com/martincostello/benchmarkdotnet-results-publisher/actions?query=workflow%3Abuild+branch%3Amain+event%3Apush "Continuous Integration for this project"
[comment-example]: https://github.com/martincostello/project-euler/pull/335#issuecomment-2302688319 "An example comment for a performance regression"
[coverage-badge]: https://codecov.io/gh/martincostello/benchmarkdotnet-results-publisher/branch/main/graph/badge.svg
[coverage-report]: https://codecov.io/gh/martincostello/benchmarkdotnet-results-publisher "Code coverage report for this project"
[github-action-benchmark]: https://github.com/benchmark-action/github-action-benchmark "The benchmark-action/github-action-benchmark repository on GitHub.com"
[github-apps]: https://docs.github.com/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps "About creating GitHub Apps"
[github-context]: https://docs.github.com/actions/learn-github-actions/contexts#github-context "Accessing contextual information about workflow runs"
[github-hosted-runners]: https://docs.github.com/actions/using-github-hosted-runners/using-github-hosted-runners/about-github-hosted-runners "About GitHub-hosted runners"
[github-pat]: https://docs.github.com/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens "Managing your personal access tokens"
[github-self-hosted-runners]: https://docs.github.com/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners "About self-hosted runners"
[github-step-summary]: https://docs.github.com/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#adding-a-job-summary "Adding a job summary"
[github-token]: https://docs.github.com/actions/security-for-github-actions/security-guides/automatic-token-authentication "Automatic token authentication"
[github-token-security]: https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/ "Keeping your GitHub Actions and workflows secure Part 1: Preventing pwn requests"
[issues]: https://github.com/martincostello/benchmarkdotnet-results-publisher/issues "Issues for this project on GitHub.com"
[license]: https://www.apache.org/licenses/LICENSE-2.0.txt "The Apache 2.0 license"
[plotly]: https://plotly.com/javascript/ "Plotly"
[repo]: https://github.com/martincostello/benchmarkdotnet-results-publisher "This project on GitHub.com"
[scorecard-badge]: https://api.securityscorecards.dev/projects/github.com/martincostello/benchmarkdotnet-results-publisher/badge
[scorecard-report]: https://securityscorecards.dev/viewer/?uri=github.com/martincostello/benchmarkdotnet-results-publisher "OpenSSF Scorecard for this project"
