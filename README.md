# Bouncing Balls

A closed glass chamber full of balls: gravity, restitution, wall and ball-ball
collisions, and a drag-to-throw aim arc. One `index.html`, no build step.

Live: <https://fss-iot.github.io/bouncing-balls/>

Open `index.html` in a browser. three.js 0.170.0 loads from jsDelivr, so the
first load needs a network connection.

## Controls

| Input | Effect |
|---|---|
| Click the chamber | Drop a ball where you clicked |
| Drag and release | Throw a ball; the arc previews the path |
| Gravity | 0–24 m/s² (9.8 by default) |
| Bounce | Restitution, 0.15–1.0 (0.82 by default) |
| Balls | 0–260, added or removed immediately |
| Pause / `Space` | Freeze the physics; the camera keeps drifting |
| Reset / `R` | Re-rain the current ball count |
| Sound | Toggle the synthesized impact clicks |

The scene starts with 48 balls raining into the chamber. They settle in about
ten seconds; click or throw more to wake it up.

## What is simulated

Spheres with no spin. Each fixed 120 Hz step applies gravity and a little air
drag, resolves the floor, ceiling and four walls by position constraint, then
resolves every overlapping sphere pair with an equal-mass impulse. Restitution
sets how much normal speed survives; a small tangential friction and floor grip
bleed off the rest. Balls that come to rest on the floor stop instead of
jittering forever.

The renderer is decoupled from the physics: physics runs in fixed steps with an
accumulator, rendering runs at whatever the display allows. Balls are a single
`InstancedMesh` (plus an additive shell for the glow), so 260 of them still run
at 60 fps on the test machine.

## Check

```sh
mise exec node -- node check.mjs
```

The harness opens the page in headless Chromium and runs:

- **Physics** through `window.__selftest()`: 48 seeded balls for 15 simulated
  seconds, asserting finiteness, containment, non-increasing energy between
  0→5 s and 5→15 s, net energy dissipation, settling, no residual overlap, and
  that collision events were produced.
- **Controls**: drag-to-throw increments the count, `Space` freezes and resumes
  the clock, and the ball-count, reset, gravity and bounce controls reach the
  world.

For a visual pass:

```sh
omarchy agent look page index.html --size 1440x900 --after 2500
omarchy agent look page index.html --size 390x844 --after 2500
```

## Notes

- The camera pans out on portrait screens (`1.15 / aspect`, capped at 1.7) so
  the side walls stay in frame.
- The aim arc integrates gravity only; it deliberately ignores collisions.
- The glass box is a `MeshBasicMaterial` at 0.022 opacity. A physical material
  turned point-light speculars into two bright orbs that read as stray balls.
- `O(n²)` pair checks are fine at the 260-ball cap. A uniform grid is the next
  step if that cap grows.
- No spin or rolling: the cheap model that still reads as convincing bouncing.
