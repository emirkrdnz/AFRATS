namespace TransactionService.Domain.Exceptions;

public class BadRequestException(string message) : DomainException(message);
