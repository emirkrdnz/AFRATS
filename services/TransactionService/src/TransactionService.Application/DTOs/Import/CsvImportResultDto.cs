namespace TransactionService.Application.DTOs.Import;

public record CsvImportResultDto(
    int TotalRows,
    int SuccessCount,
    int FailureCount,
    List<CsvRowError> Errors);

public record CsvRowError(
    int Row,
    string Field,
    string Message);
