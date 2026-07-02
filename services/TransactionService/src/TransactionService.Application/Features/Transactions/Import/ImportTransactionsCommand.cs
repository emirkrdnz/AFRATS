namespace TransactionService.Application.Features.Transactions.Import;

using MediatR;
using TransactionService.Application.DTOs.Import;

public record ImportTransactionsCommand(
    Stream FileStream,
    Guid UserId) : IRequest<CsvImportResultDto>;
