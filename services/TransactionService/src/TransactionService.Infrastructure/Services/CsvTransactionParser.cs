namespace TransactionService.Infrastructure.Services;

using System.Globalization;
using CsvHelper;
using CsvHelper.Configuration;
using Microsoft.Extensions.Logging;
using TransactionService.Application.DTOs.Import;
using TransactionService.Application.Interfaces.Services;
using TransactionService.Domain.Exceptions;

public class CsvTransactionParser(ILogger<CsvTransactionParser> logger) : ICsvParserService
{
    public async Task<List<CsvTransactionRow>> ParseAsync(Stream stream, CancellationToken cancellationToken)
    {
        var rows = new List<CsvTransactionRow>();

        using var reader = new StreamReader(stream);
        using var csv = new CsvReader(reader, new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HasHeaderRecord = true,
            MissingFieldFound = null,
            HeaderValidated = null,
            TrimOptions = TrimOptions.Trim
        });

        // Validate header
        await csv.ReadAsync();
        csv.ReadHeader();

        var headers = csv.HeaderRecord;
        if (headers is null || headers.Length == 0)
            throw new BadRequestException("CSV file has no header row.");

        var requiredHeaders = new[] { "Amount", "Type", "CategoryName", "TransactionDate" };
        var missingHeaders = requiredHeaders
            .Where(h => !headers.Any(header => header.Equals(h, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        if (missingHeaders.Count > 0)
            throw new BadRequestException($"Missing required CSV headers: {string.Join(", ", missingHeaders)}");

        while (await csv.ReadAsync())
        {
            try
            {
                var amount = csv.GetField<decimal>("Amount");
                var type = csv.GetField<string>("Type") ?? string.Empty;
                var categoryName = csv.GetField<string>("CategoryName") ?? string.Empty;
                var transactionDate = csv.GetField<DateTime>("TransactionDate");
                var description = csv.GetField<string>("Description");

                rows.Add(new CsvTransactionRow(amount, type.Trim(), categoryName.Trim(), transactionDate, description?.Trim()));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to parse CSV row {Row}.", csv.Parser.Row);
                throw new BadRequestException($"Invalid data format at row {csv.Parser.Row}. Please check the CSV format.");
            }
        }

        return rows;
    }
}
