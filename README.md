# MixtaPR

Show the music you were listening to when you made each commit, right on GitHub pull requests.

## How it works

MixtaPR has two parts that work together:

- **Git hook** — runs after every commit, checks what you're playing on Spotify, and sends the track to the MixtaPR service
- **Chrome extension** — reads the commits in a GitHub PR and shows the associated tracks in a panel, with a button to queue them all in Spotify

Because the Chrome extension needs to talk to Spotify on your behalf (to queue tracks), and the git hook needs to read what you're currently playing, both pieces require a Spotify OAuth token scoped to your account. Spotify requires each user to authorize through a registered Developer app. Rather than routing everyone through a shared app (which caps out at 25 users in development mode), each user creates their own free Spotify Developer app in under two minutes — the install script walks you through it and wires up the credentials automatically.

## Installation

Run this single command:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/JustinKozlowski/mixtaPR/main/install.sh)"
```

The script will:

1. Walk you through creating a free Spotify Developer app and collecting your Client ID
2. Install a global git hook at `~/.git-hooks/post-commit`
3. Install the Chrome extension files at `~/.mixtapr/extension/`

After running the script, load the extension in Chrome:

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `~/.mixtapr/extension`

Your next git commit will open Spotify in your browser to authorize. After that, every commit you make while music is playing will be recorded — and when you open a pull request on GitHub, the extension will show the tracks and let you queue them.

test
