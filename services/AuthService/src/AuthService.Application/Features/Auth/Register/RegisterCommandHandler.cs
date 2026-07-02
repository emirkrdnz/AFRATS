namespace AuthService.Application.Features.Auth.Register;

using AuthService.Application.DTOs.Auth;
using AuthService.Application.Interfaces;
using AuthService.Application.Interfaces.Repositories;
using AuthService.Application.Interfaces.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Enums;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Logging;

public class RegisterCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    IPasswordHasher passwordHasher,
    ITokenService tokenService,
    IEmailService emailService,
    IUnitOfWork unitOfWork,
    ILogger<RegisterCommandHandler> logger) : IRequestHandler<RegisterCommand, RegisterResponse>
{
    public async Task<RegisterResponse> Handle(RegisterCommand request, CancellationToken cancellationToken)
    {
        // IK-01: Email must be unique
        if (await userRepository.ExistsByEmailAsync(request.Email, cancellationToken))
            throw new ConflictException("A user with this email address already exists.");

        // IK-04: Assign default 'User' role
        var userRole = await roleRepository.GetByNameAsync(RoleType.User.ToString(), cancellationToken)
            ?? throw new NotFoundException("Default user role not found.");

        // IK-03: Hash password with BCrypt
        var user = new User
        {
            Email = request.Email.Trim().ToLowerInvariant(),
            PasswordHash = passwordHasher.HashPassword(request.Password),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            PhoneNumber = request.PhoneNumber?.Trim(),
            RoleId = userRole.Id,
            IsActive = true,         // IK-07
            EmailConfirmed = false,   // IK-05
            IsDeleted = false,        // IK-08
            CreatedAt = DateTime.UtcNow
        };

        await userRepository.AddAsync(user, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        // IK-06: Send email confirmation (fire-and-forget, don't block registration)
        try
        {
            var confirmationToken = tokenService.GenerateEmailConfirmationToken(user.Id);
            await emailService.SendEmailConfirmationAsync(user.Email, confirmationToken, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send confirmation email to {Email}", user.Email);
        }

        logger.LogInformation("User registered successfully: {UserId}, {Email}", user.Id, user.Email);

        return new RegisterResponse(
            user.Id,
            user.Email,
            user.FirstName,
            user.LastName,
            "Registration successful. Please verify your email.");
    }
}
