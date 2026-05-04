using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MixtaPRService.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CommitTracks",
                columns: table => new
                {
                    CommitHash = table.Column<string>(type: "text", nullable: false),
                    SpotifyTrackId = table.Column<string>(type: "text", nullable: false),
                    SpotifyUserId = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CommitTracks", x => x.CommitHash);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CommitTracks");
        }
    }
}
