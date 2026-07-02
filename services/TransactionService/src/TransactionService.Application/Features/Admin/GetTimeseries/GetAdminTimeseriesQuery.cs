namespace TransactionService.Application.Features.Admin.GetTimeseries;

using MediatR;
using TransactionService.Application.DTOs.Admin;

/// <summary>
/// GET /api/transactions/admin/timeseries?days=30
/// Son N günü kapsayan günlük admin istatistik dizisi.
/// </summary>
public record GetAdminTimeseriesQuery(int Days) : IRequest<List<AdminTimeseriesPointDto>>;
