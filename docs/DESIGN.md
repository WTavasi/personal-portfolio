# The Conductor's Podium: design brief (v0.4)

Portfolio for Wyclef Tavasi. The site opens on a terminal that builds a 3D concert hall, then lets the visitor into an open rehearsal: the orchestra is seated, a quiet theme plays, and each part of the stage holds one part of the résumé. Nothing has to be played or won. A plain-HTML résumé is one click, or one URL (`/#/resume`), from every screen.

## Decisions so far
- Interactive, not a game. Earlier rhythm-game versions were dropped; there is no score, tempo or timing.
- One name on screen: Wyclef Tavasi, as on the master résumé.
- Music is the setting, not the subject: the résumé content leads, and music appears only as a one-line interest on the résumé page.
- Hall style: low-poly shapes with rich, steady lighting, built in code. No model files, so no licensing questions. (The TurboSquid reference model is licensed for editorial use only, so it could not be used on the site.)
- Privacy: no cookies, no analytics, no forms, email link only. Sound on or off and volume are saved in localStorage on the device.
- Desktop first. The hall and the résumé both work on phones.

## Flow
Terminal (builds the hall, sound and volume, Enter the hall) -> lights come up -> the hall (explore sections) <-> résumé. Old `#/program` and `#/home` links still work.

## The terminal
- A terminal window runs `npm run build:hall`. Every line is a real loading step with its real duration; behind the window the hall goes up as a brass wireframe, step by step, and slowly turns.
- When it finishes it waits for the visitor: Sound on or off, a volume slider, Enter the hall (the Enter key works too) and View résumé.
- Entering: the window drops away, the wireframe fades, the house lights come up over about 2.5 seconds, and the orchestra tuning recording plays. The hall theme comes in as the tuning fades.
- No WebGL: the log says so plainly and the hall opens as a list of sections.

## The sections
| On stage | Section | Content |
|---|---|---|
| Conductor's podium | About | Headline, summary, availability, contact, PDF download |
| Strings | Experience | Webmasters KE, Delta Creative Solutions |
| Woodwinds | Projects | All ten projects with stack, year and GitHub links |
| Brass and timpani | Skills | The eight skill groups |
| Organ | Education | Degree and coursework, certifications, honors |

- Indicators: a brass ring and label floats over each section and breathes slowly; hovering a section lights it with a follow spot and turns the cursor into a pointer; a hint line at the bottom explains what to do until the first section is opened.
- The section list at the bottom is the keyboard and screen-reader route (the markers are a pointer affordance only). Esc closes a panel and returns focus to where it came from.
- Opening a section glides the camera to it, opens the panel on the right, and crossfades to that section's theme.
- Each section explored seats more of the audience. With all five explored the full orchestra plays and the hall applauds once.
- Downloadable PDF: any PDF placed in `src/assets/resume/` becomes the download on the hall, the About panel and the résumé page. No PDF, no buttons.

## The hall (from Wyclef's reference photos)
- Warm wood: honey maple wall panelling and stage planks, darker wood on gallery fronts and stage edge.
- Crimson theatre seats in curved, raked rows. Each seat has two side standards with armrests, a cushion and a reclined back.
- Side galleries on two levels wrap from beside the choir to the back of the stalls, with lamps on the parapets.
- Choir terrace of six rows behind the orchestra, red-carpeted stairs at each side, organ pipes above.
- Orchestra on three semicircular risers, laid out like a standard seating chart: strings in front, woodwinds in the middle, brass and timpani at the back, harp at the back left, grand piano at the front left in concerto position. Black four-legged chairs, tripod music stands with sheet music.
- Conductor's podium with a brass rail and the score.
- Ceiling: stepped soffits with downlights, a ring of acoustic reflectors over the orchestra, a lighting truss with spotlights and light shafts.
- Small realistic touches: green exit signs, aisle step lights.
- Musicians in concert black, each posed with an instrument for their section: violins, cellos, clarinets, trumpets, plus the pianist.
- Lighting: house lights at half, stage fully lit, steady. No beat-synced pulsing.

## Performance budget
- About 35 draw calls and 160k triangles with a full house. Static scenery is merged; seats, chairs, stands, musicians, audience and pipes are instanced.
- Lambert materials with vertex colours; five lights (hemisphere, key spot with shadows, organ wash, house fill, follow spot).
- The shadow map is drawn once, since nothing that casts a shadow moves.
- No post-processing. Lamp glow uses additive sprites.
- Pixel ratio capped at 1.25, frame rate capped at 60, and resolution steps down automatically (1.0, then 0.8) if the machine cannot keep up.
- With reduced motion, frames are only drawn when something changes.
- Measured in a software renderer at Retina density: v0.2 took 6.7 s per frame, v0.2.1 1.3 s, this version 1.5 s with the orchestra and audience seated. Real GPUs are far faster; the ratio is the point.

## Design system (src/styles/tokens.css)
- Colour: warm near-black surfaces, one accent (brass #e3b552) used for the primary action, selected states and links. Crimson appears only inside the 3D hall.
- Spacing: 4px base (4, 8, 12, 16, 24, 32, 48, 64, 96). Related things sit close, groups are separated by the larger steps. No dividers, borders or coloured-edge cards for grouping.
- Type: Fraunces (display and section headings, upright only), Figtree (UI and body), Space Mono (boot log only). Numerals use tabular figures. Headings use balanced wrapping.
- Radii: panel 12px, padding 8px, so inner controls are 4px (inner = outer minus padding).
- Feedback: state changes are instant. Movement is the feedback (press shifts 1px, panels slide in, the camera glides to what was chosen). Nothing fades on hover.
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
PASS 14.70:1 (need 7) text on surface2 (section buttons)
PASS  4.49:1 (need 3) borders and focus (UI components): line on bg
PASS  8.88:1 (need 3) accent focus ring on panel: accent on surface2
PASS 18.88:1 (need 7) print: ink on paper
```

## Accessibility
- Every action works by keyboard: Enter opens the hall, the section list opens each panel, Esc closes it and returns focus. One visible focus style.
- The canvas has a text alternative. A live region announces each section as it opens and the loading steps as they run.
- prefers-reduced-motion stops the camera drift, cuts camera moves instead of gliding, stops the marker breathing, and only redraws when something changes.
- Nothing flashes.
- If WebGL is unavailable the site says so and the menu and résumé still work (tested).

## Sound
- The orchestra tuning recording (`src/assets/audio/orchestra-tuning.mp3`) plays once, as the visitor enters the hall.
- Each section has its own looping theme: hall, about, experience, projects, skills, education and finale. Placeholders are synthesised in the browser (`src/lib/themes.js`).
- To use Wyclef's own compositions, drop a file named after the section into `src/assets/themes/` (for example `experience.mp3`). It replaces the placeholder with no code change. See the README in that folder.
- One master volume covers everything. Sound pauses when the tab is hidden. The résumé page plays nothing and downloads no audio.
- The tuning recording is credited on the résumé page. Its licence must be confirmed.

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
| v0.3 | Rhythm-game prototype (retired) |
| v0.4 (this) | Interactive hall: terminal build, wireframe reveal, five clickable sections, swappable themes, PDF download, seated orchestra |
| Next | Wyclef's one-page PDF, his own section themes, project screenshots in the Projects panel |
| v1.0 | Polish, prerendered résumé for SEO |
