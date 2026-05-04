using Microsoft.EntityFrameworkCore;

public class CommitTrack
{
    public required string CommitHash { get; set; }
    public required string SpotifyTrackId { get; set; }
    public string? SpotifyUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class MixtaDbContext(DbContextOptions<MixtaDbContext> options) : DbContext(options)
{
    public DbSet<CommitTrack> CommitTracks => Set<CommitTrack>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<CommitTrack>()
            .HasKey(c => c.CommitHash);
    }
}
