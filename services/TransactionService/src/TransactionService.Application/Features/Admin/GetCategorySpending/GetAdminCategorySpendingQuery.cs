namespace TransactionService.Application.Features.Admin.GetCategorySpending;

using MediatR;
using TransactionService.Application.DTOs.Admin;

/// <summary>
/// GET /api/transactions/admin/by-category?days=30&type=Expense
/// Son N gün için kategori bazlı toplam — type opsiyonel (Income / Expense / null = both).
/// </summary>
public record GetAdminCategorySpendingQuery(int Days, string? Type) : IRequest<List<AdminCategorySpendingDto>>;
