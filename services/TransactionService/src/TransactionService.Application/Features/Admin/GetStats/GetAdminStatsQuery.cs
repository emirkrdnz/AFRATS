namespace TransactionService.Application.Features.Admin.GetStats;

using MediatR;
using TransactionService.Application.DTOs.Admin;

public record GetAdminStatsQuery(
    DateTime? StartDate = null,
    DateTime? EndDate = null) : IRequest<AdminStatsDto>;
