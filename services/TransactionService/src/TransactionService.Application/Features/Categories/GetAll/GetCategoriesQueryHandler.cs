namespace TransactionService.Application.Features.Categories.GetAll;

using AutoMapper;
using MediatR;
using TransactionService.Application.DTOs.Category;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Domain.Enums;

public class GetCategoriesQueryHandler(
    ICategoryRepository categoryRepository,
    IMapper mapper) : IRequestHandler<GetCategoriesQuery, List<CategoryDto>>
{
    public async Task<List<CategoryDto>> Handle(GetCategoriesQuery request, CancellationToken cancellationToken)
    {
        TransactionType? typeFilter = null;

        if (!string.IsNullOrWhiteSpace(request.Type)
            && Enum.TryParse<TransactionType>(request.Type, true, out var parsed))
        {
            typeFilter = parsed;
        }

        var categories = await categoryRepository.GetAllByUserAsync(
            request.UserId, typeFilter, cancellationToken);

        return mapper.Map<List<CategoryDto>>(categories);
    }
}
