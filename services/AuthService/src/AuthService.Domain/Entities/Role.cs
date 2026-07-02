namespace AuthService.Domain.Entities;

using AuthService.Domain.Common;

public class Role : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    // Navigation property
    public ICollection<User> Users { get; set; } = [];
}
