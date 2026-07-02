namespace AuthService.Domain.Exceptions;

public class UnauthorizedException(string message) : DomainException(message);
