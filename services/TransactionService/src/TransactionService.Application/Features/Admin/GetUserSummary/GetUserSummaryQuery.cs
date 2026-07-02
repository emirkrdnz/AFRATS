namespace TransactionService.Application.Features.Admin.GetUserSummary;

using MediatR;
using TransactionService.Application.DTOs.Admin;

/// <summary>
/// GET /api/transactions/admin/{userId}/summary — Admin drawer için per-user
/// lifetime özet (transaction count + income/expense + first/last activity).
/// </summary>
public record GetUserSummaryQuery(Guid TargetUserId) : IRequest<AdminUserSummaryDto>;
