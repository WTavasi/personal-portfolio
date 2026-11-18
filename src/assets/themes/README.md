# The hall's music

The hall plays one piece split into six stems, one per section of the orchestra. Between sections all six play quietly together. Opening a section fades the others out so only that section is heard; About (the conductor) brings the whole orchestra up.

| File | Section | Heard alone when |
|---|---|---|
| `piano.mp3` | Piano | Only in the full orchestra |
| `strings.mp3` | Strings | Experience is open |
| `woodwinds.mp3` | Woodwinds | Projects is open |
| `brass.mp3` | Brass | Skills is open |
| `percussion.mp3` | Timpani, triangle, glockenspiel, bass drum | Certifications is open |
| `choir.mp3` | Choir | Education is open |

The files here now are generated placeholders: an 8-bar phrase in D major at 80 BPM, 24 seconds long.

To use your own piece, export one stem per section and replace these files, keeping the names (`.m4a`, `.ogg` and `.wav` also work). The stems must:

- all be exactly the same length, starting together on beat 1;
- loop cleanly, so the end joins the start without a gap or click;
- share one tempo. Set `BPM` in `src/lib/themes.js` to that tempo so the conductor's baton keeps time.

If a stem is missing, the others still play. Keep each file small: about 30 to 60 seconds at 96 to 128 kbps.
