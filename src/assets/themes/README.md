# The hall's music

The hall plays one piece split into six stems, one per section of the orchestra, all started on the same sample so they stay locked together.

| File | Section | Featured when |
|---|---|---|
| `piano.mp3` | Piano | Only in the full orchestra |
| `strings.mp3` | Strings | Experience is open |
| `woodwinds.mp3` | Woodwinds | Projects is open |
| `brass.mp3` | Brass | Skills is open |
| `percussion.mp3` | Timpani, triangle, glockenspiel, bass drum | Certifications is open |
| `choir.mp3` | Choir | Education is open |

How it is mixed (`src/lib/themes.js`):

- Between sections the whole orchestra plays at a moderate level.
- Opening a section *features* it: its stem comes up to full and every other stem drops to about 17% (roughly 15 dB down), so the harmony carries on underneath. Nothing is ever soloed, so a section that rests for a few bars never leaves the hall silent.
- About (the conductor) brings everyone up.
- Every change lands on the next beat, or on the next bar line when that is less than 1.5 s away.
- All stems and the applause go through one limiter, so nothing clips at full volume.
- Going to the résumé pauses the music; coming back picks it up where it left off.
- On entering the hall: if the tuning recording was heard, it dies away, there is a short hush, the conductor gives one beat of preparation and the orchestra comes in on the downbeat.

The files here now are generated placeholders: an 8-bar phrase in D major at 80 BPM, 24 seconds long, with the downbeat at the very first sample.

## Using your own piece

Export one stem per section from your project and replace these files, keeping the names (`.m4a`, `.ogg` and `.wav` also work). Then in `src/lib/themes.js`:

1. Set `BPM` to your tempo, and `BEATS_PER_BAR` if it is not 4/4. The conductor's baton and the timing of every change follow these.
2. Set `MATCH_LOUDNESS = false`. It evens out the placeholders, which were rendered at different levels; for your own mix the balance between sections is yours.
3. Adjust `LEVEL.under` if the featured section should stand out more (lower) or less (higher).

The stems must:

- all be exactly the same length, starting together on beat 1 (no silence before the first downbeat);
- loop cleanly, so the end joins the start without a gap or click (let reverb tails from the last bar wrap into the first);
- share one tempo, with no tempo changes, or the baton will drift.

Length and tempo: the hall loops one 30-second piece. For the loop to land on a bar line, 30 s should be a whole number of bars: at 80 BPM in 4/4 that is exactly 10 bars (any tempo where `30 × BPM ÷ 240` is a whole number works, for example 64, 72, 80, 88 or 96 BPM for 8, 9, 10, 11 or 12 bars). Six 30-second stems at 96 kbps come to about 2.2 MB in all, about what the placeholders cost now.
