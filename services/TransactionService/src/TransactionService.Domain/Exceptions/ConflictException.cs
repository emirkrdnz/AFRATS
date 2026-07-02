namespace TransactionService.Domain.Exceptions;

public class ConflictException(string message) : DomainException(message);
