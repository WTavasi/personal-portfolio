# The Conductor's Podium: design brief (v0.2.1)

Portfolio for Wyclef (Tavasi Wyclef Wasike). The home screen is a 3D concert hall. The camera drifts in a slow arc and the room pulses at the chosen tempo. A plain-HTML résumé (the recruiter view) is one click, or one URL (`/#/resume`), from every screen. Old `/#/program` links redirect there. The rhythm game arrives movement by movement.

## Decisions so far
- Hall style: low-poly shapes with rich lighting (soft shadows, fog, light shafts, glowing lamps), built in code. No model files, so no licensing questions.
- Home: "Click anywhere to begin" (any key also works). After that, a menu: View résumé, Start the concert (disabled until the game ships), tempo, sound.
- Labels use plain words a non-musician understands: "Skip to résumé", "View résumé".
- Boot: short. The log is the real loading progress of the hall, not a script.
- Privacy: no cookies, no analytics, no forms, email link only. Tempo and sound are saved in localStorage on the device.
- Desktop first. The résumé view works on phones.

## Flow
Boot -> Home (hall, click to begin) -> menu -> Résumé, or the game when it exists. The résumé is reachable from every screen.

## The hall (from Wyclef's reference photos)
- Warm wood: honey maple wall panelling and stage planks, darker wood on gallery fronts and stage edge.
- Crimson theatre seats in curved, raked rows. Each seat has two side standards with armrests, a cushion and a reclined back.
- Side galleries on two levels wrap from beside the choir to the back of the stalls, with lamps on the parapets.
- Choir terrace of six rows behind the orchestra, red-carpeted stairs at each side, organ pipes above.
- Orchestra on three semicircular risers, laid out like a standard seating chart: strings in front, woodwinds in the middle, brass and timpani at the back, harp at the back left, grand piano at the front left in concerto position. Black four-legged chairs, tripod music stands with sheet music.
- Conductor's podium with a brass rail and the score (the score later becomes the boss).
- Ceiling: stepped soffits with downlights, a ring of acoustic reflectors over the orchestra, a lighting truss with spotlights and light shafts.
- Small realistic touches: green exit signs, aisle step lights.
- Lighting: house lights at half, stage fully lit. A blue stage wash is kept in reserve for the boss fight.

## Performance budget
- About 23 draw calls and 120k triangles for the whole hall. Static scenery is merged; seats, chairs, stands and pipes are instanced.
- Lambert materials with vertex colours; four lights (hemisphere, key spot with shadows, organ wash, house fill).
- The shadow map is drawn once, since nothing that casts a shadow moves.
- No post-processing. Lamp glow uses additive sprites.
- Pixel ratio capped at 1.25, frame rate capped at 60, and resolution steps down automatically (1.0, then 0.8) if the machine cannot keep up.
- With reduced motion, frames are only drawn when something changes.
- Measured in a software renderer at Retina density: v0.2 took 6.7 s per frame, this version 1.3 s. Real GPUs are far faster; the ratio is the point.

## Game plan (unchanged)
Movements: Overture (About), Pipeline (Cloud and DevOps), Balancer (Distributed systems), Encore boss (iOS). Each cleared movement fades in another orchestra section (stem) and seats more of the audience. The boss: the conductor's score builds note by note, the staff lines fold into a phone frame, and the notes become app UI you shoot on the beat.
Tempo: Andante 80, Moderato 120 (default), Vivace 160. Beat maps are authored in beats, so any tempo and any replacement track at a matching BPM works.

## Design system (src/styles/tokens.css)
- Colour: warm near-black surfaces, one accent (brass #e3b552) used for the primary action, selected states and links. Crimson appears only inside the 3D hall.
- Spacing: 4px base (4, 8, 12, 16, 24, 32, 48, 64, 96). Related things sit close, groups are separated by the larger steps. No dividers, borders or coloured-edge cards for grouping.
- Type: Fraunces (display and section headings, upright only), Figtree (UI and body), Space Mono (boot log only). Numerals use tabular figures. Headings use balanced wrapping.
- Radii: panel 12px, padding 8px, so inner controls are 4px (inner = outer minus padding).
- Feedback: state changes are instant. Movement is the feedback (press shifts 1px, menu slides in 240ms, the room's pulse changes the moment the tempo changes). Nothing fades on hover.
- Icons: none. Labels do the work.

## Contrast (computed by scripts/contrast.py)
```
PASS 17.37:1 (need 7) body text: text on bg
PASS 11.08:1 (need 7) secondary text: text2 on bg
PASS  7.29:1 (need 4.5) tertiary text, 14px+: muted on bg
PASS 16.28:1 (need 7) text on panel: text on surface
PASS 10.39:1 (need 7) secondary on panel: text2 on surface
PASS  6.83:1 (need 4.5) tertiary on panel: muted on surface
PASS  9.63:1 (need 7) CTA label: onAccent on accent
PASS 10.49:1 (need 4.5) accent text/link on bg: accent on bg
PASS  9.83:1 (need 4.5) accent on panel: accent on surface
PASS 14.70:1 (need 7) text on selected tempo: text on surface2
PASS  4.49:1 (need 3) borders and focus (UI components): line on bg
PASS  8.88:1 (need 3) accent focus ring on panel: accent on surface2
PASS 18.88:1 (need 7) print: ink on paper
```

## Accessibility
- Every action works by keyboard; any key (except Tab) begins; arrow keys move through tempo; one visible focus style.
- The canvas has a text alternative. A live region announces tempo changes.
- prefers-reduced-motion stops the camera drift and the beat pulse and the notes rain.
- Beat flashing stays under 3 per second at the fastest tempo (160 BPM = 2.7 per second) and at low amplitude.
- If WebGL is unavailable the site says so and the menu and résumé still work (tested).

## Sound
- On the first click the hall plays a 24-second orchestra tuning recording (`src/assets/audio/orchestra-tuning.mp3`), downloaded while the hall loads. It skips the leading silence, fades out at the end, and fades out early if the person opens the résumé or turns sound off. If it cannot load, a synthesised A plays instead.
- The résumé page never downloads it. Sound is on by default and the choice is remembered.
- Credit is shown on the résumé page. The recording's licence must be confirmed before the site is public.

## Privacy, third parties, legal
- No cookies, no tracking, no forms, no third-party requests (fonts are self-hosted). Verified: opening the résumé makes zero external requests.
- No fake reviews, no terms page needed. No images yet. When project screenshots are added they must be Wyclef's own, with alt text.
- Fonts: Fraunces, Figtree, Space Mono, all SIL OFL. Music: royalty-free tracks need a licence check before shipping (not a lawyer, so confirm the terms of whichever source is used).
- Only add contact details Wyclef wants public (`src/content.js`).

## Content rule
Only claims that can be backed up: a repo, a date, a number, a named employer. No buzzwords.

## Roadmap
| Version | Ships |
|---------|-------|
| v0.2 | 3D hall home, real-progress boot, click to begin, tempo and sound, rewritten résumé |
| v0.2.1 (this) | Hall rebuilt from reference photos, realistic seats, galleries, choir, orchestra layout; about 5x faster; résumé naming |
| v0.3 | Web Audio clock, beat-map engine, calibration screen, Pipeline movement playable |
| v0.4 | Unlocks and saved progress, hall fills (players and audience), stems |
| v0.5 | Balancer movement, Encore boss, curtain call |
| v1.0 | Polish, prerendered résumé for SEO, project screenshots |
