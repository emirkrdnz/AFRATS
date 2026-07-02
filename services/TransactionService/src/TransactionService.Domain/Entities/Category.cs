namespace TransactionService.Domain.Entities;

using System.Transactions;
using TransactionService.Domain.Common;
using TransactionService.Domain.Enums;

public class Category : BaseEntity
{
    public Guid? UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public TransactionType Type { get; set; }
    public string? IconCode { get; set; }
    public bool IsSystem { get; set; }

    // Navigation
    public ICollection<Transaction> Transactions { get; set; } = [];
}