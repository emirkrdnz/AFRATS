namespace TransactionService.Application.Interfaces.Services;

using TransactionService.Application.DTOs.Import;

public interface ICsvParserService
{
    Task<List<CsvTransactionRow>> ParseAsync(Stream stream, CancellationToken cancellationToken = default);
}
