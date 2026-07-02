using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NotificationService.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddDedupKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DedupKey",
                schema: "afrats_notif",
                table: "Notifications",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_UserId_DedupKey_CreatedAt",
                schema: "afrats_notif",
                table: "Notifications",
                columns: new[] { "UserId", "DedupKey", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Notifications_UserId_DedupKey_CreatedAt",
                schema: "afrats_notif",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "DedupKey",
                schema: "afrats_notif",
                table: "Notifications");
        }
    }
}
