# Suno Player

A private, minimalist music library for audio downloaded from Suno. Requires Node.js 22 or newer. No package installation, account, internet connection, or Suno API is needed.

## Start

Double-click `Start.cmd`. It starts a local server and opens `http://127.0.0.1:47831` in the default browser. Reopening the launcher reuses the running server. Alternatively run `npm start` in this directory. The server binds only to the loopback interface.

## Use

Add audio files using the import button or drag and drop. Supported extensions: MP3, WAV, FLAC, M4A, OGG, AAC, WebM; maximum 200 MB per file. Playback codecs depend on the browser. Click a track to play it. Edit its title, lyrics and styles, then click Save or press Ctrl+S. Search covers all three fields. Playback includes seeking, volume, previous/next, shuffle and single-track repeat. Space toggles playback outside form controls.

Audio is copied into `data/audio`; originals are preserved. Titles, styles and lyrics are stored in `data/library.json`, not embedded into the audio. The previous saved metadata is retained as `data/library.backup.json`. Back up the entire `data` directory to preserve the library. Importing the same file again creates another entry. There is no automatic Suno account synchronization.

The launcher keeps the server running until Windows restarts or the corresponding Node process is closed. To stop it explicitly, find the process listening on port 47831 and stop only that process. Use a single server per library. Saved changes from another browser tab are visible after reload; avoid editing one track in multiple tabs simultaneously.

## Verification and storage

`npm test` runs isolated API/persistence tests. `npm run check` checks JavaScript syntax. Tests create a small temporary library on X and remove it afterwards. The application writes no diagnostic logs or caches. Library files are user data and are retained; one metadata backup and one temporary atomic-write file are the only metadata rotation artifacts.
