namespace AuthService.Infrastructure.Persistence.Seed;

public static class SeedConstants
{
    public static readonly Guid UserRoleId = new("A1B2C3D4-E5F6-7890-ABCD-EF1234567890");
    public static readonly Guid AdminRoleId = new("B2C3D4E5-F6A7-8901-BCDE-F12345678901");
    public static readonly Guid AdminUserId = new("C3D4E5F6-A7B8-9012-CDEF-123456789012");
    public static readonly DateTime SeedDate = new(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);
}
