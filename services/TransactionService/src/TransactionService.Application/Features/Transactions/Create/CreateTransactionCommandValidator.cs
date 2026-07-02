namespace TransactionService.Application.Features.Transactions.Create;

using FluentValidation;

public class CreateTransactionCommandValidator : AbstractValidator<CreateTransactionCommand>
{
    public CreateTransactionCommandValidator()
    {
        RuleFor(x => x.Amount)
            .GreaterThan(0).WithMessage("Amount must be greater than 0.")
            .PrecisionScale(18, 2, false).WithMessage("Amount must have at most 18 digits and 2 decimal places.");

        RuleFor(x => x.Type)
            .NotEmpty().WithMessage("Transaction type is required.")
            .Must(t => t.Equals("Income", StringComparison.OrdinalIgnoreCase)
                     || t.Equals("Expense", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Type must be 'Income' or 'Expense'.");

        RuleFor(x => x.CategoryId)
            .NotEmpty().WithMessage("Category is required.");

        RuleFor(x => x.TransactionDate)
            .NotEmpty().WithMessage("Transaction date is required.")
            .LessThanOrEqualTo(DateTime.UtcNow.Date.AddDays(1)).WithMessage("Transaction date cannot be in the future.");

        RuleFor(x => x.Description)
            .MaximumLength(500).WithMessage("Description cannot exceed 500 characters.");
    }
}
