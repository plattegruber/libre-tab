# Tab Platform — Data Model Spec
> Version 0.1 — Working Draft

---

## Core Philosophy

- **Presentation is a rendering concern.** The model captures musical truth; how it's displayed (tab staff, standard notation, chord chart, ASCII) is derived.
- **Pitch is derived, never stored.** Pitch = `string + fret + tuning + capo`. The model stays tab-native.
- **Standoff annotation.** Annotations (techniques, phrasing, structure) live in independent layers that reference the base note layer by stable ID. Layers never embed in each other.
- **Discriminated unions over optionals.** Every technique type has its own schema. No optional fields papering over semantic differences.
- **More correct always, even at the cost of complexity.**

---

## Layers

```
song
├── metadata        — title, artist, album, year
├── tracks          — instrument, tuning, capo per track
├── measures        — ordered sequence, timing grid
├── base            — notes (string, fret, duration, voice, articulation)
├── context         — scope events: tempo, time sig, key sig changes
├── techniques      — spans: bends, slides, hammer-ons, etc.
├── phrasing        — spans: slurs, ties, dynamics, phrase marks
├── harmony         — chord symbols floating above the staff
├── tuplets         — rhythmic grouping spans
├── lyrics          — syllables anchored to positions
├── fingering       — left/right hand fingering annotations per note
└── structure       — sections, repeats, jumps
```

Each layer is independently versionable and diffable.

---

## Primitives

### Position
A precise location in musical time. Used everywhere a position is needed.

```typescript
type Position = {
  measureId: string;
  beat: Rational;       // e.g. { n: 1, d: 4 } = beat 1, { n: 3, d: 8 } = the "and" of beat 1
};

type Rational = {
  n: number;            // numerator
  d: number;            // denominator (always a power of 2 or tuplet-adjusted)
};
```

Using rationals (not floats) for beat positions avoids all floating-point drift issues. `1/4` is exactly beat 1, `3/8` is exactly the eighth-note subdivision. This is the same approach MusicXML's `divisions` concept approximates, but cleaner.

### Duration

```typescript
type Duration = {
  base: "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "thirtysecond" | "sixtyfourth";
  dots: 0 | 1 | 2;     // dotted, double-dotted
  tupletId?: string;    // reference to a Tuplet span if inside one
};
```

---

## Metadata

```typescript
type SongMetadata = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genre?: string[];
  license?: string;     // e.g. "CC-BY-4.0" for original works
};
```

---

## Tracks

One song can have multiple tracks (lead guitar, rhythm, bass, etc.). Each track has its own tuning and capo.

```typescript
type Track = {
  id: string;
  name: string;         // "Lead Guitar", "Bass", etc.
  instrument: "guitar" | "bass" | "ukulele" | "banjo" | "mandolin";
  stringCount: number;
  tuning: MidiPitch[];  // length === stringCount, low to high. Standard = [40,45,50,55,59,64]
  capo: number;         // fret offset applied to all strings. 0 = no capo
};

type MidiPitch = number; // 0–127, middle C = 60
```

Pitch for any note is fully derived: `tuning[string - 1] + capo + fret`

---

## Measures

Measures form the timing grid everything else references.

```typescript
type Measure = {
  id: string;
  index: number;        // 0-based, determines order
  trackId: string;
  // Time signature and tempo are NOT stored here.
  // They live in the context layer as scope events.
  // To get the time sig for a measure, look up the most recent
  // context event at or before this measure's position.
};
```

---

## Base Layer — Notes

The stable foundation. Notes are immutable facts about what fingers do.

```typescript
type Note = {
  id: string;
  trackId: string;
  measureId: string;
  beat: Rational;       // position within the measure
  voice: 1 | 2;         // guitars support two independent voices per staff
  duration: Duration;
  content: NoteContent;
  articulation: Articulation;
};

type NoteContent =
  | { type: "fretted"; string: StringNumber; fret: number }
  | { type: "open";    string: StringNumber }
  | { type: "muted";   string: StringNumber }  // X — deadened string
  | { type: "rest" };

type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;  // 1 = highest (e), 6 = lowest (E)

type Articulation = {
  palmMute:      boolean;
  staccato:      boolean;
  accent:        boolean;
  ghostNote:     boolean;   // parenthesized note — implied, not fully struck
  pickDirection: "up" | "down" | null;  // null = unspecified
  letRing:       boolean;
};
```

**Why muted is a NoteContent type, not an Articulation flag:** A muted note is a different physical action (string killed before/during pick) from a staccato note (struck then immediately dampened). They look different in notation. They're different techniques.

---

## Context Layer — Scope Events

Ambient state that applies from a position forward until changed.

```typescript
type ContextEvent =
  | { id: string; position: Position; type: "tempo";         bpm: number }
  | { id: string; position: Position; type: "timeSignature"; numerator: number; denominator: number }
  | { id: string; position: Position; type: "keySignature";  key: string; mode: "major" | "minor" }
  | { id: string; position: Position; type: "tuning";        trackId: string; tuning: MidiPitch[] }
  | { id: string; position: Position; type: "capo";          trackId: string; fret: number };
```

To resolve context at any position: find the most recent event of each type at or before that position. This is exactly how OTel resolves inherited span attributes.

---

## Technique Layer — Spans

This is where guitar lives. All spans reference note IDs from the base layer.

```typescript
// Discriminated union — every type has its own schema
type TechniqueSpan =
  | BendSpan
  | SlideSpan
  | HammerOnSpan
  | PullOffSpan
  | TapSpan
  | VibratoSpan
  | TremoloPickingSpan
  | WhamBarSpan
  | HarmonicSpan
  | RakeSpan;
```

### Bend
A single-note technique with a pitch curve.

```typescript
type BendSpan = {
  id: string;
  type: "bend";
  noteId: string;
  curve: BendPoint[];   // must start at t=0, semitones=0
  style: "standard" | "preBend" | "preBendRelease" | "bendRelease" | "bendReleaseBend";
};

type BendPoint = {
  t: number;            // 0.0–1.0, normalized time across the note's duration
  semitones: number;    // 0.0–4.0, fractional semitones allowed (quarter-tone bends)
};
```

### Slide
Can span multiple notes. Direction is derived from fret values but stored explicitly for shift slides that return to origin.

```typescript
type SlideSpan = {
  id: string;
  type: "slide";
  noteIds: string[];    // ordered, must be on same string
  style: "legato" | "shift" | "slideInFromBelow" | "slideInFromAbove" | "slideOutDown" | "slideOutUp";
};
```

### Hammer-On / Pull-Off
Chain of two or more notes — no re-pick between them.

```typescript
type HammerOnSpan = {
  id: string;
  type: "hammerOn";
  noteIds: string[];    // ordered chain, min length 2
};

type PullOffSpan = {
  id: string;
  type: "pullOff";
  noteIds: string[];    // ordered chain, min length 2
};
```

### Tap

```typescript
type TapSpan = {
  id: string;
  type: "tap";
  noteIds: string[];
  hand: "right" | "left"; // two-hand tapping vs. left-hand tap
};
```

### Vibrato

```typescript
type VibratoSpan = {
  id: string;
  type: "vibrato";
  noteIds: string[];    // can span multiple tied notes
  rate:  "slow" | "medium" | "fast";
  depth: "narrow" | "wide";
  style: "standard" | "whamBar";
};
```

### Tremolo Picking

```typescript
type TremoloPickingSpan = {
  id: string;
  type: "tremoloPicking";
  noteIds: string[];
  rate: "eighth" | "sixteenth" | "thirtysecond";
};
```

### Whammy Bar

```typescript
type WhamBarSpan = {
  id: string;
  type: "whamBar";
  noteIds: string[];
  curve: BendPoint[];   // reuses BendPoint — same shape, negative values = dip
};
```

### Harmonic
Natural and artificial are structurally distinct.

```typescript
type HarmonicSpan =
  | { id: string; type: "harmonic"; noteId: string; style: "natural" | "pinch" }
  | { id: string; type: "harmonic"; noteId: string; style: "artificial"; touchFret: number };
  // touchFret: the fret lightly touched to produce the harmonic, typically nodeFret + 12
```

### Rake

```typescript
type RakeSpan = {
  id: string;
  type: "rake";
  noteIds: string[];    // strings raked through, in pick-direction order
  direction: "up" | "down";
};
```

---

## Phrasing Layer

Musical expression above individual note articulation.

```typescript
type PhrasingSpan =
  | { id: string; type: "slur";        noteIds: string[] }
  | { id: string; type: "crescendo";   noteIds: string[] }
  | { id: string; type: "diminuendo";  noteIds: string[] }
  | { id: string; type: "dynamic";     position: Position; value: "ppp"|"pp"|"p"|"mp"|"mf"|"f"|"ff"|"fff" }
  | { id: string; type: "phraseSlur";  noteIds: string[] };
```

---

## Tuplet Layer

Rhythmic groupings that override the implied beat subdivision.

```typescript
type TupletSpan = {
  id: string;
  type: "tuplet";
  noteIds: string[];    // the notes inside the tuplet
  actual: number;       // how many notes are played...
  normal: number;       // ...in the space of this many (same duration)
  // e.g. triplet: actual=3, normal=2
  // e.g. quintuplet: actual=5, normal=4
};
```

Notes inside a tuplet carry `tupletId` in their Duration. The tuplet span is the source of truth for the grouping.

---

## Harmony Layer

Chord symbols live independently of notes — they float above the staff at a position.

```typescript
type ChordSymbol = {
  id: string;
  position: Position;
  trackId: string;
  symbol: string;       // "Am7", "Gmaj9/B", "F#dim7" — human-readable
  voicing?: {           // optional explicit voicing
    frets: (number | null)[];  // null = muted string, length === track.stringCount
    fingering?: number[];      // finger numbers 1–4
    barre?: { fret: number; fromString: number; toString: number };
  };
};
```

`symbol` is the display string. Rendering engines parse it for display; search/filter systems query it. Voicing is optional — many chord symbols won't have one.

---

## Structure Layer

Sections and navigation marks.

```typescript
type Section = {
  id: string;
  name: string;               // "Intro", "Verse 1", "Chorus", "Solo"
  startMeasureId: string;
  endMeasureId: string;
};

type RepeatMarker =
  | { id: string; type: "repeatStart"; measureId: string }
  | { id: string; type: "repeatEnd";   measureId: string; times: number }
  | { id: string; type: "volta";       measureId: string; endings: number[] };  // 1st/2nd ending

type JumpMarker =
  | { id: string; type: "segno";   measureId: string }
  | { id: string; type: "coda";    measureId: string }
  | { id: string; type: "dsAlCoda";   measureId: string }
  | { id: string; type: "dcAlCoda";   measureId: string }
  | { id: string; type: "dsAlFine";   measureId: string }
  | { id: string; type: "fine";       measureId: string };
```

---

## Full Song Document

All layers composed.

```typescript
type Song = {
  metadata:   SongMetadata;
  tracks:     Track[];
  measures:   Measure[];

  // Layers
  base:       Note[];
  context:    ContextEvent[];
  techniques: TechniqueSpan[];
  phrasing:   PhrasingSpan[];
  tuplets:    TupletSpan[];
  harmony:    ChordSymbol[];
  lyrics:     LyricSyllable[];
  fingering:  FingeringAnnotation[];
  structure: {
    sections:  Section[];
    repeats:   RepeatMarker[];
    jumps:     JumpMarker[];
  };
};
```

---

## Edit / Versioning Model

Each edit targets a specific layer and is stored as a discrete operation:

```typescript
type Edit = {
  id: string;
  timestamp: string;       // ISO 8601
  authorId: string;
  layer: "base" | "context" | "techniques" | "phrasing" | "tuplets" | "harmony" | "lyrics" | "fingering" | "structure";
  op: EditOp;
  message?: string;        // optional commit-style message
};

type EditOp =
  | { type: "insert"; entity: unknown }
  | { type: "delete"; entityId: string }
  | { type: "update"; entityId: string; before: unknown; after: unknown };
```

**Semantic diffs are the unit of history**, not text line diffs. "Measure 4, beat 2: bend curve updated" is a meaningful, human-readable change. The `before`/`after` on an update op gives you rollback for free.

Edits cluster heavily in `techniques` and `phrasing`. The `base` layer is nearly append-only once a tab is established — most community debate will be about technique interpretation, not note placement.

---

## Lyrics Layer

Lyrics are a standoff layer over positions, not over notes. A lyric syllable floats at a beat position and the rendering engine aligns it visually — it has no structural dependency on the note layer.

```typescript
type LyricSyllable = {
  id: string;
  trackId: string;
  position: Position;
  text: string;
  syllable: "single" | "begin" | "middle" | "end";
  // "begin"/"middle"/"end" handle melisma — one syllable spread across multiple notes
  // rendering draws a continuation line from "begin" through "middle" to "end"
};
```

Lyrics are DMCA-reactive content. The data model makes no distinction — they're stored the same as any other layer and removed via the same edit mechanism if a takedown applies.

---

## Fingering Layer

Fingering is interpretive, not a musical fact. Multiple valid fingerings exist for the same passage and players disagree. It belongs in its own layer so it can be edited and voted on independently from the notes themselves.

```typescript
type FingeringAnnotation = {
  id: string;
  noteId: string;
  left?: LeftFinger;    // fretting hand
  right?: RightFinger;  // picking hand — relevant for fingerstyle
};

type LeftFinger  = 1 | 2 | 3 | 4;                // index through pinky
type RightFinger = "p" | "i" | "m" | "a" | "c";  // classical notation: thumb through little finger
```

---

## Design Decisions

Decisions that were non-obvious, with rationale.

**Tied notes live in the phrasing layer as spans.**
A tie is relational — it connects two notes and says "don't re-attack the second one." The note itself doesn't know it's tied; the relationship is what matters. Yes, ties affect playback differently than slurs, but that's a rendering and playback concern. The model stays clean. `type: "tie"` in phrasing spans, referencing exactly two noteIds.

```typescript
// Added to PhrasingSpan union:
| { id: string; type: "tie"; noteIds: [string, string] }
```

**Grace notes are full notes in the base layer.**
Grace notes have string, fret, articulation, and can have technique spans applied to them (a grace note can be a hammer-on). Excluding them from the base layer would make the technique layer unable to reference them. They carry an optional `grace` field; their duration is `"grace"` which the rendering engine interprets as stealing time from the principal note — a display concern, not a model concern.

```typescript
// Added to Note:
grace?: {
  style: "acciaccatura" | "appoggiatura";
  principalNoteId: string;
};

// Added to Duration.base:
base: "whole" | "half" | "quarter" | "eighth" | "sixteenth" | "thirtysecond" | "sixtyfourth" | "grace";
```

**Spans are single-track by definition, always.**
A unison bend across two guitars is two separate bend spans. Adding cross-track references would require every span consumer to handle track resolution, complicating the entire layer for a marginal expressive gain. If the rendering layer wants to display coincident same-type spans with a shared visual marking, it can detect that at render time without the model knowing about it.

**Fingering is its own layer, not part of the note.**
Fingering is interpretive. Storing it on the note would conflate musical fact with editorial opinion. Two contributors can disagree on fingering without either being wrong about the notes. The layer separation means fingering can be voted on and versioned independently.
