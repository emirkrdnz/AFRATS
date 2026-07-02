namespace AuthService.API.Controllers;

using AuthService.Application.Features.Auth.ChangePassword;
using AuthService.Application.Features.Auth.ConfirmEmail;
using AuthService.Application.Features.Auth.ForgotPassword;
using AuthService.Application.Features.Auth.Login;
using AuthService.Application.Features.Auth.Logout;
using AuthService.Application.Features.Auth.RefreshToken;
using AuthService.Application.Features.Auth.Register;
using AuthService.Application.Features.Auth.ResetPassword;
using AuthService.Application.Features.Profile.GetProfile;
using AuthService.Application.Features.Profile.UpdateProfile;
using AuthService.Application.Features.Profile.DeleteProfile;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/auth")]
public class AuthController(ISender sender) : ControllerBase
{
    /// <summary>
    /// Register a new user (FR-A01)
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register(
        [FromBody] RegisterCommand command, CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, new { success = true, data = result });
    }

    /// <summary>
    /// User login — returns JWT access token and refresh token (FR-A03)
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(
        [FromBody] LoginCommand command, CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// Refresh access token using a valid refresh token (FR-A07)
    /// </summary>
    [HttpPost("refresh-token")]
    [AllowAnonymous]
    public async Task<IActionResult> RefreshToken(
        [FromBody] RefreshTokenCommand command, CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// Logout — revokes the provided refresh token (FR-A08)
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout(
        [FromBody] LogoutCommand command, CancellationToken cancellationToken)
    {
        await sender.Send(command, cancellationToken);
        return NoContent();
    }

    /// <summary>
    /// Confirm email address via token (FR-A02)
    /// </summary>
    [HttpGet("confirm-email")]
    [AllowAnonymous]
    public async Task<IActionResult> ConfirmEmail(
        [FromQuery] string token, CancellationToken cancellationToken)
    {
        var result = await sender.Send(new ConfirmEmailCommand(token), cancellationToken);
        return Ok(new { success = true, message = result });
    }

    /// <summary>
    /// Request a password reset email (FR-A05)
    /// </summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordCommand command, CancellationToken cancellationToken)
    {
        await sender.Send(command, cancellationToken);
        return Ok(new { success = true, message = "If the email exists, a reset link has been sent." });
    }

    /// <summary>
    /// Reset password with valid token (FR-A05)
    /// </summary>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordCommand command, CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);
        return Ok(new { success = true, message = result });
    }

    /// <summary>
    /// Get current user's profile (authenticated)
    /// </summary>
    [HttpGet("profile")]
    [Authorize]
    public async Task<IActionResult> GetProfile(CancellationToken cancellationToken)
    {
        var result = await sender.Send(new GetProfileQuery(), cancellationToken);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// Update current user's profile (authenticated)
    /// </summary>
    [HttpPut("profile")]
    [Authorize]
    public async Task<IActionResult> UpdateProfile(
        [FromBody] UpdateProfileCommand command, CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);
        return Ok(new { success = true, data = result });
    }

    /// <summary>
    /// Change password for current user (authenticated)
    /// </summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordCommand command, CancellationToken cancellationToken)
    {
        var result = await sender.Send(command, cancellationToken);
        return Ok(new { success = true, message = result });
    }

    /// <summary>
    /// Soft-delete current user's account (authenticated)
    /// </summary>
    [HttpDelete("profile")]
    [Authorize]
    public async Task<IActionResult> DeleteProfile(CancellationToken cancellationToken)
    {
        await sender.Send(new DeleteProfileCommand(), cancellationToken);
        return NoContent();
    }
}
