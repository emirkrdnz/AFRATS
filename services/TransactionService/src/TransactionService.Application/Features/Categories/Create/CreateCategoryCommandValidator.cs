namespace TransactionService.Application.Features.Categories.Create;

using FluentValidation;

public class CreateCategoryCommandValidator : AbstractValidator<CreateCategoryCommand>
{
    public CreateCategoryCommandValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Category name is required.")
            .MinimumLength(2).WithMessage("Category name must be at least 2 characters.")
            .MaximumLength(100).WithMessage("Category name cannot exceed 100 characters.");

        RuleFor(x => x.Type)
            .NotEmpty().WithMessage("Category type is required.")
            .Must(t => t.Equals("Income", StringComparison.OrdinalIgnoreCase)
                     || t.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Type must be 'Income' or 'Expense'.");

        RuleFor(x => x.IconCode)
            .MaximumLength(50).WithMessage("Icon code cannot exceed 50 characters.");
    }
}
