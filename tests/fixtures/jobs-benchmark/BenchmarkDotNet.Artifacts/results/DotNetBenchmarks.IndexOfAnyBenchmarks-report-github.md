```

BenchmarkDotNet v0.15.2, Windows 11 (10.0.26100.6584/24H2/2024Update/HudsonValley)
13th Gen Intel Core i7-13700H 2.90GHz, 1 CPU, 20 logical and 14 physical cores
.NET SDK 10.0.100-rc.1.25451.107
  [Host]   : .NET 10.0.0 (10.0.25.45207), X64 RyuJIT AVX2
  .NET 8.0 : .NET 8.0.20 (8.0.2025.41914), X64 RyuJIT AVX2
  .NET 9.0 : .NET 9.0.9 (9.0.925.41916), X64 RyuJIT AVX2


```
| Method                    | Job      | Runtime  | Mean     | Error     | StdDev    | Ratio | RatioSD | Allocated | Alloc Ratio |
|-------------------------- |--------- |--------- |---------:|----------:|----------:|------:|--------:|----------:|------------:|
| IndexOfAny_String         | .NET 8.0 | .NET 8.0 | 3.021 ns | 0.0903 ns | 0.1352 ns |  1.00 |    0.06 |         - |          NA |
| IndexOfAny_Span_Array     | .NET 8.0 | .NET 8.0 | 2.519 ns | 0.0796 ns | 0.1166 ns |  0.84 |    0.05 |         - |          NA |
| IndexOfAny_Span_Two_Chars | .NET 8.0 | .NET 8.0 | 1.526 ns | 0.0610 ns | 0.0875 ns |  0.51 |    0.04 |         - |          NA |
|                           |          |          |          |           |           |       |         |           |             |
| IndexOfAny_String         | .NET 9.0 | .NET 9.0 | 2.967 ns | 0.0602 ns | 0.0563 ns |  1.00 |    0.03 |         - |          NA |
| IndexOfAny_Span_Array     | .NET 9.0 | .NET 9.0 | 1.960 ns | 0.0681 ns | 0.0885 ns |  0.66 |    0.03 |         - |          NA |
| IndexOfAny_Span_Two_Chars | .NET 9.0 | .NET 9.0 | 1.437 ns | 0.0428 ns | 0.0379 ns |  0.48 |    0.02 |         - |          NA |
