namespace TransactionService.Application.Features.Admin.GetTimeseries;

using MediatR;
using TransactionService.Application.DTOs.Admin;
using TransactionService.Application.Interfaces.Repositories;

/// <summary>
/// Repository'den ham günlük gruplama alır, eksik günleri 0-pad ile doldurup
/// frontend'in stabil bir 30-noktalı dizisi alacağını garanti eder.
/// </summary>
public class GetAdminTimeseriesQueryHandler(
    ITransactionRepository transactionRepository
) : IRequestHandler<GetAdminTimeseriesQuery, List<AdminTimeseriesPointDto>>
{
    public async Task<List<AdminTimeseriesPointDto>> Handle(
        GetAdminTimeseriesQuery request,
        CancellationToken cancellationToken)
    {
        var days = Math.Clamp(request.Days, 1, 365);

        // UTC midnight bazlı pencere — repo aynı convention ile date filter eder.
        var endDate   = DateTime.UtcNow.Date.AddDays(1); // bugün dahil → yarın 00:00
        var startDate = endDate.AddDays(-days);

        var raw = await transactionRepository.GetTimeseriesAsync(
            startDate, endDate, cancellationToken);

        // Eksik günleri 0 ile doldur — UI bug'siz line/bar çizmek için.
        var byDate = raw.ToDictionary(p => p.Date, p => p);
        var result = new List<AdminTimeseriesPointDto>(days);
        for (var i = 0; i < days; i++)
        {
            var d = startDate.AddDays(i);
            result.Add(byDate.TryGetValue(d, out var found)
                ? found
                : new AdminTimeseriesPointDto(d, 0, 0, 0m, 0m));
        }
        return result;
    }
}
