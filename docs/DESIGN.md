# The Conductor's Podium: design brief (v0.5)

Portfolio for Wyclef Tavasi. The site opens on a terminal that builds a 3D concert hall, then lets the visitor into an open rehearsal: the orchestra is seated, a quiet theme plays, and each part of the stage holds one part of the résumé. Nothing has to be played or won. A plain-HTML résumé is one click, or one URL (`/#/resume`), from every screen.

## Decisions so far
- Interactive, not a game. Earlier rhythm-game versions were dropped; there is no score, tempo or timing.
- One name on screen: Wyclef Tavasi, as on the master résumé.
- Music is the setting, not the subject: the résumé content leads, and music appears only as a one-line interest on the résumé page.
- Hall style: low-poly shapes with rich, steady lighting, built in code. No model files, so no licensing questions. (The TurboSquid reference model is licensed for editorial use only, so it could not be used on the site.)
- Privacy: no cookies, no analytics, nothing sent to a server. The résumé page's Mail option builds a `mailto:` link in the browser, so the visitor's own mail app sends it and the address they type is never stored or transmitted. Sound on or off and volume are saved in localStorage on the device.
- Desktop first. The hall and the résumé both work on phones.

## Flow
Terminal (builds the hall, sound and volume, Enter the hall) -> lights come up -> the hall (explore sections) <-> résumé. Old `#/program` and `#/home` links still work.

## The terminal
- A terminal window runs `npm run build:hall`. Every line is a real loading step with its real duration; behind the window the hall goes up as a brass wireframe, step by step, and slowly turns.
- When it finishes it waits for the visitor: Sound on or off, a volume slider and Enter the hall (the Enter key works too). Skip to résumé stays in the corner throughout.
- Entering: the window drops away, the wireframe fades, the house lights come up over about 2.5 seconds, and the orchestra tuning recording plays. The hall theme comes in as the tuning fades.
- No WebGL: the log says so plainly and the hall opens as a list of sections.

## The sections
| On stage | Section | Content |
|---|---|---|
| The conductor on the podium | About | Headline, summary, availability, contact |
| Strings | Experience | Webmasters KE, Delta Creative Solutions |
| Woodwinds | Projects | All ten projects with stack, year and GitHub links |
| Brass (horns, trumpets, trombones, tuba) | Skills | The eight skill groups |
| Percussion (timpani, xylophone, glockenspiel, triangle, bass drum) | Certifications | Certifications and training, honors |
| The choir, holding open scores | Education | Degree and coursework |

- Indicators: a brass ring and label floats over each section and breathes slowly; hovering a section lights it with a follow spot and turns the cursor into a pointer; a hint line at the bottom explains what to do until the first section is opened.
- The section buttons at the bottom carry only the section names. They are the keyboard and screen-reader route (the markers are a pointer affordance only). Esc closes a panel and returns focus to where it came from.
- Opening a section glides the camera to it, opens the panel on the right, and the music narrows to that section alone. The panel title carries a subtitle naming the section of the orchestra ("Projects, with the woodwinds") and ends with a fun fact about it. Both appear only in the zoomed-in panel.
- Players sway gently while their section is playing and go still when another section is soloed. String players bow, the timpanist and mallet players strike, roughly once a beat. The conductor beats a 4/4 pattern in time with the music. All motion stops with reduced motion.
- Each section explored seats more of the audience. With all six explored the hall applauds once.
- Buttons: the hall's top right holds only Sound and View résumé. The résumé page holds Back to the hall, Print, Mail and Download. Print and Download use the one-page PDF in `src/assets/resume/`; Mail opens the visitor's mail app with a ready-written message linking to the PDF (a `mailto:` link cannot attach files).

## The hall (from Wyclef's reference photos)
- Warm wood: honey maple wall panelling and stage planks, darker wood on gallery fronts and stage edge.
- Crimson theatre seats in curved, raked rows. Each seat has two side standards with armrests, a cushion and a reclined back.
- Side galleries on two levels wrap from beside the choir to the back of the stalls, with lamps on the parapets.
- Choir terrace of six rows behind the orchestra, red-carpeted stairs at each side, organ pipes above.
- Orchestra on three semicircular risers, laid out like a standard seating chart. Strings on the floor: first violins front left, second violins behind them, violas centre right, cellos on the right, four double basses standing right beside the cellos. Woodwinds in the centre: 2 flutes and 2 oboes in front, 2 clarinets and 2 bassoons behind. Four horns left of the woodwinds; 3 trumpets, 3 trombones and a tuba at the back. Percussion at the back right: four timpani set close around the timpanist (32, 29, 26 and 23 inch), a xylophone with resonators, a glockenspiel, a triangle and a bass drum. Harp at the back left, grand piano at the front left in concerto position. Black four-legged chairs, tripod music stands shared by each pair.
- Conductor's podium with a brass rail and the score.
- Ceiling: stepped soffits with downlights, a ring of acoustic reflectors over the orchestra, a lighting truss with spotlights and light shafts.
- Small realistic touches: green exit signs, aisle step lights.
- Musicians in concert black, each modelled with a real-proportioned instrument held the way it is played: violin-family bodies with waists, f-holes, bridge, fingerboard, scroll and strings, and a bow whose hair rests on the strings between bridge and fingerboard. Arms are solved from shoulder to hand so every hand lands on its instrument. Plus the pianist, a conductor with the baton in the right hand, and a choir with open scores.
- Lighting: house lights at half, stage fully lit, steady. No beat-synced pulsing.

## Performance budget
- About 29 draw calls and 217k triangles with a full house. Static scenery is merged; seats, chairs, stands, audience and pipes are instanced; the orchestra is one merged mesh (about 92k triangles).
- The whole orchestra (players, instruments, bows, percussion) is one merged mesh and one draw call. Motion runs in the vertex shader: each vertex knows the point its player sways around, and moving parts know the elbow they turn around, so the CPU updates six numbers a frame. Draw calls went from 40 to 29.
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
- The orchestra tuning recording (`src/assets/audio/orchestra-tuning.mp3`) plays once, as the visitor enters the hall; then the theme comes in.
- The theme is six stems (piano, strings, woodwinds, brass, percussion, choir) that start on the same sample and loop together. Between sections all play quietly; a section brings its stem up and fades the rest; About brings everything up.
- The current stems are generated placeholders (8 bars, D major, 80 BPM). Wyclef replaces them with his own stems under the same names; see `src/assets/themes/README.md`. `BPM` in `src/lib/themes.js` keeps the conductor in time.
- Stems download and decode while the hall builds. One master volume covers everything. Sound pauses when the tab is hidden. The résumé page plays nothing and downloads no audio.
- The tuning recording is credited on the résumé page. Its licence must be confirmed.

## Privacy, third parties, legal
- No cookies, no tracking, no form that sends data anywhere (the Mail box only builds a link on the visitor's device), no third-party requests (fonts are self-hosted). Verified: opening the résumé makes zero external requests.
- No fake reviews, no terms page needed. No images yet. When project screenshots are added they must be Wyclef's own, with alt text.
- Fonts: Fraunces, Figtree, Space Mono, all SIL OFL. Music: royalty-free tracks need a licence check before shipping (not a lawyer, so confirm the terms of whichever source is used).
- Only add contact details Wyclef wants public (`src/content.js`).

## Content rule
Only claims that can be backed up: a repo, a date, a number, a named employer. No buzzwords.

## Roadmap
| Version | Ships |
|---------|-------|
| v0.3 | Rhythm-game prototype (retired) |
| v0.4 | Interactive hall: terminal build, wireframe reveal, five clickable sections, swappable themes, PDF download, seated orchestra |
| v0.5 (this) | Sound fix, simpler buttons, Mail, percussion section, accurate orchestra with bowing and striking, subtitles and fun facts |
| Next | Wyclef's own section themes, project screenshots in the Projects panel |
| v1.0 | Polish, prerendered résumé for SEO |
