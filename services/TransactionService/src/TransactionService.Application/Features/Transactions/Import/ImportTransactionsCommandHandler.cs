namespace TransactionService.Application.Features.Transactions.Import;

using MediatR;
using TransactionService.Application.DTOs.Events;
using TransactionService.Application.DTOs.Import;
using TransactionService.Application.Interfaces;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Application.Interfaces.Services;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Domain.Exceptions;

public class ImportTransactionsCommandHandler(
    ICsvParserService csvParser,
    ICategoryRepository categoryRepository,
    ITransactionRepository transactionRepository,
    IEventPublisher eventPublisher,
    IUnitOfWork unitOfWork) : IRequestHandler<ImportTransactionsCommand, CsvImportResultDto>
{
    public async Task<CsvImportResultDto> Handle(ImportTransactionsCommand request, CancellationToken cancellationToken)
    {
        var rows = await csvParser.ParseAsync(request.FileStream, cancellationToken);

        if (rows.Count == 0)
            throw new BadRequestException("CSV file contains no data rows.");

        if (rows.Count > 1000)
            throw new BadRequestException("CSV file exceeds maximum of 1000 rows.");

        // Load user's available categories once
        var categories = await categoryRepository.GetAllByUserAsync(request.UserId, cancellationToken: cancellationToken);

        var validTransactions = new List<Transaction>();
        var errors = new List<CsvRowError>();

        for (var i = 0; i < rows.Count; i++)
        {
            var rowNumber = i + 2; // +2: 1-based + header row
            var row = rows[i];
            var rowErrors = ValidateRow(row, rowNumber, categories);

            if (rowErrors.Count > 0)
            {
                errors.AddRange(rowErrors);
                continue;
            }

            var category = categories.First(c =>
                c.Name.Equals(row.CategoryName, StringComparison.OrdinalIgnoreCase));

            var transactionType = Enum.Parse<TransactionType>(row.Type, true);

            validTransactions.Add(new Transaction
            {
                Id = Guid.NewGuid(),
                UserId = request.UserId,
                CategoryId = category.Id,
                Amount = row.Amount,
                Type = transactionType,
                Description = row.Description?.Trim(),
                TransactionDate = row.TransactionDate,
                IsAnomalous = false,
                AnomalyScore = null,
                CreatedAt = DateTime.UtcNow
            });
        }

        // IK-07: If no valid rows, nothing is saved
        if (validTransactions.Count == 0 && errors.Count > 0)
            throw new BadRequestException("All rows failed validation. No transactions were imported.");

        if (validTransactions.Count > 0)
        {
            // Incremental save + publish (chronological).
            //
            // Eski davranış: önce AddRange + tek SaveChanges, sonra her event'e
            // SAME final history snapshot konuyordu. Sonuç: ML her event'i aynı
            // veriyle hesaplıyor → tüm risk skorları aynı → grafik düz çizgi.
            //
            // Yeni davranış: tx'leri tarih sırasına diz, her birini ayrı kaydet
            // ve point-in-time history ile event yayınla. ML her tx'i o ana
            // kadarki gerçek geçmişle değerlendirir → grafikte gerçek progresyon.
            //
            // Trade-off: atomicity yok. Bir tx ortada hata verirse öncekiler
            // commit'li kalır. Demo/bulk-seed kullanımı için kabul edilir;
            // production'da ihtiyaç olursa outer transaction sarmalanabilir.
            var ordered = validTransactions.OrderBy(t => t.TransactionDate).ToList();

            foreach (var transaction in ordered)
            {
                await transactionRepository.AddAsync(transaction, cancellationToken);
                await unitOfWork.SaveChangesAsync(cancellationToken);

                var userHistory = await transactionRepository.GetUserHistoryAsync(
                    request.UserId, 90, cancellationToken);
                var historyItems = userHistory.Select(t => new TransactionHistoryItem(
                    t.Amount, t.Type.ToString(), t.CategoryId, t.TransactionDate)).ToList();

                try
                {
                    // Category lookup — Create handler ile aynı pattern. Bulk
                    // import'ta her tx için ekstra DB hit ekler ama event
                    // payload'unun consistent + human-readable olması için
                    // gerekli. Kategoriler cache'lendiği için real maliyet düşük.
                    var category = await categoryRepository.GetByIdAsync(
                        transaction.CategoryId, cancellationToken);
                    var categoryName = category?.Name ?? "Unknown";

                    var @event = new TransactionCreatedEvent(
                        transaction.Id, transaction.UserId, transaction.Amount,
                        transaction.Type.ToString(), transaction.CategoryId,
                        categoryName, transaction.Description,
                        transaction.TransactionDate, historyItems);

                    await eventPublisher.PublishTransactionCreatedAsync(@event, cancellationToken);
                }
                catch (Exception)
                {
                    // Fire-and-forget: log failure but don't rollback
                }
            }
        }

        return new CsvImportResultDto(
            TotalRows: rows.Count,
            SuccessCount: validTransactions.Count,
            FailureCount: errors.Count > 0 ? rows.Count - validTransactions.Count : 0,
            Errors: errors);
    }

    private static List<CsvRowError> ValidateRow(CsvTransactionRow row, int rowNumber, List<Category> categories)
    {
        var errors = new List<CsvRowError>();

        if (row.Amount <= 0)
            errors.Add(new CsvRowError(rowNumber, "Amount", "Amount must be greater than 0."));

        if (string.IsNullOrWhiteSpace(row.Type)
            || (!row.Type.Equals("Income", StringComparison.OrdinalIgnoreCase)
                && !row.Type.Equals("Expense", StringComparison.OrdinalIgnoreCase)))
            errors.Add(new CsvRowError(rowNumber, "Type", "Type must be 'Income' or 'Expense'."));

        if (string.IsNullOrWhiteSpace(row.CategoryName))
            errors.Add(new CsvRowError(rowNumber, "CategoryName", "Category name is required."));
        else if (!categories.Any(c => c.Name.Equals(row.CategoryName, StringComparison.OrdinalIgnoreCase)))
            errors.Add(new CsvRowError(rowNumber, "CategoryName", $"Category '{row.CategoryName}' not found."));

        if (row.TransactionDate > DateTime.UtcNow.Date.AddDays(1))
            errors.Add(new CsvRowError(rowNumber, "TransactionDate", "Transaction date cannot be in the future."));

        if (row.Description?.Length > 500)
            errors.Add(new CsvRowError(rowNumber, "Description", "Description cannot exceed 500 characters."));

        return errors;
    }
}
