namespace TransactionService.Domain.Exceptions;

public class UnauthorizedException(string message) : DomainException(message);
