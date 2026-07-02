namespace TransactionService.Application.Features.Categories.Create;

using AutoMapper;
using MediatR;
using TransactionService.Application.DTOs.Category;
using TransactionService.Application.Interfaces;
using TransactionService.Application.Interfaces.Repositories;
using TransactionService.Domain.Entities;
using TransactionService.Domain.Enums;
using TransactionService.Domain.Exceptions;

public class CreateCategoryCommandHandler(
    ICategoryRepository categoryRepository,
    IUnitOfWork unitOfWork,
    IMapper mapper) : IRequestHandler<CreateCategoryCommand, CategoryDto>
{
    public async Task<CategoryDto> Handle(CreateCategoryCommand request, CancellationToken cancellationToken)
    {
        if (!Enum.TryParse<TransactionType>(request.Type, true, out var categoryType))
            throw new BadRequestException($"Invalid category type: '{request.Type}'. Must be 'Income' or 'Expense'.");

        // IK-02: Category name must be unique per user + type
        var nameExists = await categoryRepository.NameExistsAsync(
            request.UserId, request.Name.Trim(), categoryType, cancellationToken);

        if (nameExists)
            throw new ConflictException($"A category named '{request.Name.Trim()}' already exists for type '{request.Type}'.");

        var category = new Category
        {
            Id = Guid.NewGuid(),
            UserId = request.UserId,
            Name = request.Name.Trim(),
            Type = categoryType,
            IconCode = request.IconCode?.Trim(),
            IsSystem = false,
            CreatedAt = DateTime.UtcNow
        };

        await categoryRepository.AddAsync(category, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return mapper.Map<CategoryDto>(category);
    }
}
