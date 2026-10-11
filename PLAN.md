# Luxury Dreamhouse: plan

Turn the brick build photographed on 2026-10-11 (IMG_7105 to IMG_7123) into a desktop browser open-world game at **webgpu-demos.github.io/luxury-dreamhouse/**.
- Hugo (the dad) and Dada (the son) explore it together, along with the other figures.
- They walk around the house, go through the front door, sit, open things, drive the kart and ride the dinosaurs.
- The house sits on **Dreamhouse Island**, an invented world built from bricks.
- The look should be photoreal: macro toy photography.

Status (2026-10-11): **phases 1–2 and a first pass of 3–5 are built** from the 19 existing photos, three.js only (no Gaussian splat, per Jason). The orthophoto is a 47 x 32 stud grid. The house is LOD 200+ with 37 registry elements; there are four rigged minifigs with the companion mode; the kart, doors, seats and riding all work; Dreamhouse Island v1 has all seven zones and nine chests; there are day/night and quality tiers. A scripted playtest passes 22 checks. Waiting on: the `webgpu-demos/luxury-dreamhouse` repo (to deploy) and the full photo capture (§2, for LOD 300). Decisions recorded in §11.

## 0. Approach

Treat it as **scan-to-BIM, with LDraw as the element library**.

```
photos ─► SfM (poses, sparse cloud) ─► metric frame from the baseplate ─► orthophoto                     "scan"
        ─► parts model: real LDraw parts snapped to the stud lattice, with an element registry          "BIM"
        ─► deviation QA: render the model from every SfM camera and diff it against the photo           "scan vs model"
        ─► compile: house GLB + island tiles + elements.json ─► three.js WebGPU game on GitHub Pages     "client"
```

Bricks make this tractable:
- Every part already exists as exact CAD in the LDraw library. That library plays the role of the BIM family library.
- Every part sits on a fixed lattice: 8 mm stud pitch horizontally, 3.2 mm plate height vertically. The lattice plays the role of the grid and levels.

So fitting the model is **snapping to the lattice, not free-form modelling**.

The parts model is what makes things interactive: a door is a hinged door, not a blob of pixels. The photos and their solved camera poses are the reference that the QA checks against.

It follows the same pattern as procedural-sanjuan and garita: an offline compiler turns raw captures and procedural rules into static assets, and the client streams them.

## 1. The build (inventory from the 19 photos)

| Zone | Elements | Gameplay |
|---|---|---|
| Entrance | yellow door in a white frame, two tiki torches on top | open/close the door; torches lit |
| Dining room (magenta walls, its own plate) | blue table, burger, ketchup, **Hugo** (the dad, dark hair), **Dada** (the son, blond), green lamp, go-kart | sit, eat, get into the kart |
| Throne | yellow throne, blocky-headed figure | sit |
| Chicken | large Minecraft-style chicken, hinged head | head opens; chicken wanders |
| Cell | black frame with bars, dark-grey floor, yellow helmet, grille tile | open/lock; wear the helmet |
| Centre | rainbow tower with a barrel on top, palm tree, princess in lavender | climb the tower; NPC |
| Bed | rainbow bed, lime headboard | sleep (skips to night) |
| Animals | triceratops, ankylosaur, raptor, fox | wander, ride |
| Front edge | grey stone wall with 3 lanterns, tall grey spire, white horn sculpture | collision; lights |
| Patio | campfire, tan bench, flower | light the fire, sit |
| Props | treasure chest, flower box, clear "champagne" lamps, dartboard, computer, white fence | open the chest, play darts, carry things |

Facts that shape the design:
- **Open-top, dollhouse style.** There's no roof and no upstairs, and neither will be added (Q1). "Inside" means going through the front door and into the walled dining room.
- **Scale.** The main plate looks like a standard 32×32 (255 mm square); confirm at capture. A minifig is about 40 mm tall, so scaling it to a 1.75 m person makes everything about 44× larger. At that scale one baseplate is about 11 m square: a yard. The island (§7) is the world.
- **Extensions.** These are additions to the build, at ground level only and in the same parts and colours. Each is flagged `extension` in the registry, and an **As built** toggle hides them all.
  - **Kart wheels** (Q3): four wheel-and-tyre assemblies from LDraw.
  - **A driveway** from the front door off the plate to the island road.
  - **A garage bay** for the kart beside the dining room.

## 2. Capture (what Jason provides, in place of LiDAR)

**LiDAR won't help here, for two reasons:**
- The iPhone 15 doesn't have a LiDAR sensor; only the Pro models do.
- Even on a Pro, phone LiDAR depth is about 1 cm coarse. A plate is 3.2 mm tall and a stud is 8 mm wide, so photogrammetry beats LiDAR at this scale.

**Don't take the build apart until the capture is done.**

1. **Orbit set (about 120 stills).** Leave the build on the rug; the rug's texture helps the photos match up.
   - Shoot three rings of 36 photos, one every 10°: low (lens about 10 cm above the rug, minifig eye height), mid (about 45°) and high (about 70°).
   - Add about 6 straight-down shots.
   - Use the 1× lens only, not 0.5×.
   - Long-press to lock exposure and focus.
   - Use even indirect daylight, with nothing moving.
2. **Zone close-ups.** 10–15 per zone in §1.
3. **Hidden parts.** The chicken's head open; inside the chest; the kart from four sides and from underneath; the top of the tower barrel; the seam where the dining-room plate meets the main plate.
4. **Minifigs.** Each figure on white paper, front, back, left and right: Hugo, Dada, the princess, the blocky figure. These become the torso and face textures.
5. **Narrated tour video by the builder (1–3 minutes).** What each thing is and what it does. This is the program of requirements: it fills the `affordances` field in the registry (§4).
6. **Optional.** Set numbers for any official sets used (the chicken, the dinosaurs). Rebrickable inventories for those sets give exact part IDs.

The house is outdoors on the island, so it needs no room light probe and no room scan.

## 3. Reconstruction ("scan")

| Step | Tool | Runs on | Output |
|---|---|---|---|
| Structure from motion | COLMAP (CPU) | an Actions runner (free on a public repo) or the Mac | camera poses, sparse cloud |
| Metric frame | the 4 baseplate corners as ground control points (255.2 mm, plate top at y = 0) | script | scaled, levelled frame; RMS reported |
| Orthophoto | top-down mosaic rectified to the plate plane, with a stud-grid overlay at 0.1 stud per pixel | script | plan raster for fitting footprints |

**QA gate** (results published as stills):
- reprojection error under 1 px;
- the second plate's measured size within 0.5 mm of nominal.

## 4. Parts model ("BIM")

**Lattice.** Positions use LDraw units: 1 stud = 20 LDU (8 mm), 1 brick = 24 LDU (9.6 mm), 1 plate = 8 LDU (3.2 mm).
- x and z snap to 10 LDU (half a stud, which covers jumper offsets); y snaps to 8 LDU.
- Rotations are multiples of 90° unless a part is hinged.

**Library.** The LDraw parts library, with LEGO colour IDs from LDConfig. An Actions runner fetches it, because the dev container has no route to ldraw.org.

**Detail levels (LOD):**
- **LOD 200:** every element is a stud-snapped box (footprint × courses × colour) taken from the orthophoto and the oblique photos. This alone is playable.
- **LOD 300:** the exact LDraw part for each element: slopes, door and frame, bars, tiles, palm leaves, barrel, flame elements, fence.
- **LOD 350:** printed tiles plus minifig torso and face prints from capture item 4. Moulded pieces that aren't in LDraw (baby dinosaurs, Minecraft heads, hair) come from image-to-3D (Hunyuan3D or TRELLIS), cleaned up and scaled. Low-poly stand-ins are the fallback.

**Fitting loop.** Claude drafts, and the photos judge:
1. Draft a `.ldr` file per zone.
2. Render it from every SfM camera.
3. Diff the render against the photo: silhouette IoU, edge distance and colour ΔE.
4. Produce a deviation heatmap per element.
5. Fix and repeat until each element passes.

Occluded elements get plausible standard bricks and are flagged `inferred`, never silently guessed.

**Element registry, `elements.json`** (garita-style ontology). Each element records:
- `id`, `zone`, `class`. Class is one of Door, Wall, Seat, Vehicle, Light, Creature, Container, Prop, Plant or Figure.
- `parts[]` and `transform`.
- `affordances`: open, sit, drive, ride, ignite, contain, climb, carry.
- `hinge` and `sockets`: seat anchor, hand grip.
- `provenance`: `as-built`, `inferred` or `extension`.
- `sources`: which photos show it.
- `deviation` and `confidence`.

**Outputs:**
- `dreamhouse.ldr`, which opens in BrickLink Studio and Mecabricks for hand edits;
- the house GLB;
- `elements.json`.

## 5. Engine

| Layer | Choice | Why |
|---|---|---|
| Renderer | three.js `WebGPURenderer` + TSL, which falls back to WebGL2 automatically | fits the org; same three.js line as garita and procedural-sanjuan (0.186) |
| Build | Vite, `base: './'`, ES2022 | the existing pattern |
| Parts to mesh | LDrawLoader **at compile time**: merge by material, instance studs (BatchedMesh), stud logo as a normal map, meshopt + KTX2 | a few draw calls; house GLB around 10 MB |
| Physics | Rapier (`rapier3d-compat`, single-threaded WASM) | GitHub Pages can't send COOP/COEP headers, so there's no SharedArrayBuffer; single-threaded is enough |
| Characters | minifig built from LDraw parts as a 7-joint rig (neck, shoulders, wrists, hips, legs); procedural walk with the classic stiff-leg swing; Rapier kinematic character controller | true to how minifigs actually move; no motion capture needed |
| Vehicle | the kart (with its new wheels) on a Rapier raycast vehicle; reuse procedural-sanjuan's driving controls | |
| Navigation | recast-navigation-js navmesh per island tile, for the animals and companions | |
| Camera | third-person with collision, first-person at minifig eye height, photo mode (macro focus pull) | |
| Input | keyboard and mouse, gamepad. Desktop only (Q5) | |
| UI | Preact + signals, as in garita | |

**Interactions come from the registry, not from code.** Each affordance maps to a component (Hinge, Seat, Drivable, Rideable, Ignitable, Container, Climbable, Carryable).
- Press E when in range.
- Switch between Hugo (dad), Dada (son), the princess and the blocky figure.
- **Hugo and Dada are a family.** Whichever of the two you aren't playing follows you as a companion: he rides along in the kart, sits with you at the table and walks beside you, rather than wandering off. The other figures idle and wander.
- Adding a new interactive thing means a registry entry, not code.

**"Do whatever they want"** in v1 means: walk, run, jump, climb, sit, open, drive, ride, light fires, carry or drop small items, and explore the island. **Build mode** comes later (§9): place bricks on studs from the same library. That is the brick-native version of "anything".

## 6. Look ("true to life")

The target is macro photography of real toys outdoors; not a cartoon.

- **Plastic (ABS).**
  - Base colours come from the LEGO colour table, checked against the photos.
  - Roughness around 0.2–0.3 with variation, plus clearcoat and a slight sheen on light colours.
  - Edge bevels are added at compile time, since LDraw has none; also mould seams and faint wear.
- **Transparent parts.**
  - Transmission at index of refraction 1.58 for the flames, the clear lamps, the transparent green pieces and the island's water.
  - The flames also glow, flicker and cast small lights, with bloom.
- **Sky and sun.**
  - A physical atmosphere with time of day: takram atmosphere if its WebGPU/TSL build is ready, otherwise the sky lookup table from Vieques, ported.
  - Cascaded sun shadows.
  - Day and night: torches, lanterns, the campfire and the volcano carry the night.
- **Shading.**
  - GTAO, because contact shadows between bricks carry most of the realism.
  - Screen-space reflections on glossy plastic.
- **Lens.** Macro depth of field (a shallow focus range is the cue for scale), light vignette, Khronos PBR-Neutral tone mapping as in Vieques.
- **Performance.**
  - Adapt resolution from GPU timestamps, stepping through render scale × effect tier as clear-Vieques does.
  - Target 60 fps on an M-series Mac or a mid-range desktop GPU.

## 7. Open world: Dreamhouse Island (invented, Q2)

The whole island is built from bricks, and its themes come from the build itself: tiki torches and palms, dinosaurs, the chicken, flames, lanterns.

**Unit: the baseplate.** The world is a grid of 32×32-stud tiles, each about 11 m at minifig scale, exactly like the real build's plates. v1 is **32 × 24 plates (about 350 × 260 m)**, big enough for a kart loop. The client streams tiles around the camera, as procedural-sanjuan does.

**Zones** (seeded procedural fill on hand-placed zone masks):

| Zone | What's there | Draws on |
|---|---|---|
| Dreamhouse Estate | the scanned house on a raised plateau at the centre; driveway down to the ring road | the build |
| Tiki Beach & Lagoon | palms, tiki torches, a dock; water of transparent light-blue plates with Vieques caustics refracting through the plastic | torches, palm |
| Dino Jungle | dense palms, ruins with lanterns, a herd of the build's dinosaurs (triceratops, ankylosaur, raptor) | dinos, front-wall lanterns |
| The Volcano | the island's peak; flame elements, transparent-orange lava, a glow you can see at night | the flame pieces |
| Chicken Farm | a blocky farm with more of the chicken, crops, a barn | the chicken |
| Ring Road & Kart Loop | a road around the island linking every zone; jumps and a lap timer | the kart |
| Lookout Point | a sentry-box lookout (a garita) on the headland | a nod to Puerto Rico |

**Loose goals, no required quests:** find the island's treasure chests (the build has one), lap times on the kart loop, ride every dinosaur, light every torch. Free roaming stays the main mode.

**How it's built:**
- **Offline compiler** (`tools/pipeline/island.mjs`):
  - A heightfield quantised to 1 stud × 1 plate gives the terrain.
  - Zone masks set where each kind of prop goes.
  - Props come from a small prefab library in `.ldr`: palms, rocks, huts, ruins, fences. They reuse the house's own elements and style.
  - Output is binary tiles plus per-tile navmesh and colliders.
- **Rendering at distance.**
  - Terrain is greedy-meshed into brick columns.
  - Real stud geometry is instanced only near the camera; beyond that, studs become a normal map; far tiles are a low-poly heightfield with aerial perspective.
- **Seeded**, so the island is the same for everyone. A different seed gives a new island.

## 8. Hosting

- **Site.** Repo `webgpu-demos/luxury-dreamhouse` (public), deployed by the same `tools/deploy.sh` force-push to `gh-pages`. That puts the site at https://webgpu-demos.github.io/luxury-dreamhouse/.
- **Where the work runs.** Compile, QA and structure from motion run on Actions (free on public repos). The optional splat trains on the Mac.
- **Public assets.** Names and minifig likenesses are cleared for publishing (Q4). Capture photos can live in the repo or a release.
- **GitHub Pages limits.**
  - The site can be at most 1 GB, and each file under 100 MB.
  - Git LFS files aren't served, so assets live in the build.
  - First-load target is under 30 MB: house GLB about 10 MB, textures about 5 MB, the starting island tiles. The rest streams in.
- **WebGPU coverage (desktop).** Chrome and Edge; Safari 26 on macOS; Firefox 141+ on Windows. Everything else gets WebGL2.
- **QA.** Each round publishes Playwright stills, as garita does.
- **Branding.** Keep "LEGO" and "Minecraft" out of the title and branding, and leave the stud logo text off the published build. It's a fan project.

## 9. Phases

| # | Deliverable | Done when |
|---|---|---|
| 0 | Capture (§2) | checklist complete; build can be taken apart (**pending**) |
| 1 | Scan: SfM, metric frame, orthophoto | §3 QA gate passes; stills published (**orthophoto done from IMG_7109; SfM waits on capture**) |
| 2 | LOD 200 greybox + registry, deployed | Hugo walks through the front door into the dining room with Dada following, live on Pages (**built; deploy waits on the repo**) |
| 3 | LOD 300 parts model + deviation report; kart wheels, driveway, garage | every element passes or is flagged; doors, seats and kart work |
| 4 | Look pass + minifig rigs with Hugo's and Dada's prints; sky and day/night | side-by-side stills against the photos |
| 5 | Dreamhouse Island v1: compiler, streaming, zones, ring road, animal AI | drive from the house around the island and back |
| 6 | Build mode | place and remove bricks on studs; save to URL or local storage |

## 10. Risks

- **Hidden interiors** (the tower core, under the chicken). Filled with inferred standard bricks; no effect on gameplay.
- **Moulded figures that aren't in LDraw.** Image-to-3D or low-poly stand-ins; the registry records which.
- **Brick-world draw cost.** An island made of bricks means millions of studs, so the stud level of detail (§7) is essential, not polish. Prove it at phase 5 start with a 32×24 stress tile set.
- **WebGPU readiness of the takram atmosphere.** The fallback is the Vieques sky lookup table.
- **The 19 photos already taken are thin for structure from motion:** about 12 are sharp. They're enough to start the LOD 200 greybox from 7109 (top-down) and 7105/7122, but the full capture in §2 is the critical path.

## 11. Decisions (2026-10-11)

| # | Question | Decision |
|---|---|---|
| Q1 | Faithful or extended | **Extended at ground level only.** No roof, no upstairs. Extensions flagged; "As built" toggle |
| Q2 | Open world | **Invented:** Dreamhouse Island (§7) |
| Q3 | Kart | **Add wheels** (extension) |
| Q4 | What's public | **All OK.** Names and likenesses are bricks |
| Q5 | Devices | **Desktop only**: keyboard, mouse and gamepad |
