using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<MixtaDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((doc, _, _) =>
    {
        doc.Info.Title = "MixtaPR API";
        doc.Info.Description = "Associates Spotify tracks with git commits and serves them to the Chrome extension.";
        doc.Info.Version = "v1";
        return Task.CompletedTask;
    });
});

var app = builder.Build();

app.UsePathBase("/mixtapr");
app.UseCors();
app.MapOpenApi();
app.MapScalarApiReference();

// Apply migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MixtaDbContext>();
    db.Database.Migrate();
}

// ── Commits ───────────────────────────────────────────────────────────────────

app.MapPost("/commits", async (CommitRequest req, MixtaDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(req.CommitHash) || string.IsNullOrWhiteSpace(req.SpotifyTrackId))
        return Results.BadRequest("commitHash and spotifyTrackId are required.");

    var existing = await db.CommitTracks.FindAsync(req.CommitHash);
    if (existing is not null)
    {
        existing.SpotifyTrackId = req.SpotifyTrackId;
        existing.SpotifyUserId = req.SpotifyUserId;
    }
    else
    {
        db.CommitTracks.Add(new CommitTrack
        {
            CommitHash = req.CommitHash,
            SpotifyTrackId = req.SpotifyTrackId,
            SpotifyUserId = req.SpotifyUserId,
        });
    }

    await db.SaveChangesAsync();
    return Results.Created($"/commits/{req.CommitHash}", null);
})
.WithTags("Commits")
.WithSummary("Save a commit→track mapping")
.WithDescription(
    "Called by the git post-commit hook after each commit. " +
    "Associates the Spotify track currently playing with the given commit hash. " +
    "If the commit hash already exists the track is updated.")
.Produces(201)
.ProducesProblem(400);

app.MapPost("/commits/tracks", async (TracksRequest req, MixtaDbContext db) =>
{
    if (req.Hashes is null || req.Hashes.Length == 0)
        return Results.BadRequest("hashes array is required.");

    var tracks = await db.CommitTracks
        .Where(c => req.Hashes.Contains(c.CommitHash))
        .ToListAsync();

    var result = tracks.Select(t => new TrackResponse(t.CommitHash, t.SpotifyTrackId, t.SpotifyUserId));
    return Results.Ok(result);
})
.WithTags("Commits")
.WithSummary("Batch fetch tracks for commit hashes")
.WithDescription(
    "Called by the Chrome extension when a PR page loads. " +
    "Accepts an array of commit SHAs and returns the Spotify track associated with each one. " +
    "Hashes with no associated track are omitted from the response.")
.Produces<IEnumerable<TrackResponse>>()
.ProducesProblem(400);

app.Run();

// ── Records ───────────────────────────────────────────────────────────────────

record CommitRequest(string CommitHash, string SpotifyTrackId, string? SpotifyUserId);
record TracksRequest(string[] Hashes);
record TrackResponse(string CommitHash, string SpotifyTrackId, string? SpotifyUserId);
