```

BenchmarkDotNet v0.14.1-nightly.20250107.205, Linux Ubuntu 24.04.2 LTS (Noble Numbat)
AMD EPYC 7763, 1 CPU, 4 logical and 2 physical cores
.NET SDK 10.0.100-preview.2.25164.34
  [Host]     : .NET 10.0.0 (10.0.25.16302), X64 RyuJIT AVX2
  DefaultJob : .NET 10.0.0 (10.0.25.16302), X64 RyuJIT AVX2


```
| Method      | Mean     | Error     | StdDev    | Gen0    | Gen1    | Allocated  |
|------------ |---------:|----------:|----------:|--------:|--------:|-----------:|
| AspNetCore  | 1.546 ms | 0.0308 ms | 0.0650 ms | 23.4375 |       - |  489.79 KB |
| NSwag       | 4.799 ms | 0.0943 ms | 0.1627 ms | 93.7500 | 15.6250 | 1580.56 KB |
| Swashbuckle |       NA |        NA |        NA |      NA |      NA |         NA |

Benchmarks with issues:
  OpenApiBenchmarks.Swashbuckle: DefaultJob
