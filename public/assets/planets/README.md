# public/assets/planets

The maps of the two planets drawn from real images (see `src/world/landmarks.ts`, loaded by `src/assets.ts`). Each map is cylindrical: longitude across, latitude from the north pole at the top to the south pole at the bottom. The page loads the `-1k` maps; the `-2k` ones only once the picture's quality asks for them (see `Landmarks.setDetail`).

| File | What it is | Source and license | Changed |
|---|---|---|---|
| `saturn-2k.jpg` | Saturn, 2048 × 1024 | `8k_saturn.jpg` (4096 × 2048) of [Solar System Scope](https://www.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), attribution "Solar System Scope" | scaled down, JPEG quality 82 |
| `saturn-1k.jpg` | Saturn, 1024 × 512 | the same | scaled down, JPEG quality 82 |
| `saturn-ring.png` | Saturn's ring, 2048 × 1 (color and opacity from the inner to the outer edge) | `8k_saturn_ring_alpha.png` (8192 × 500) of [Solar System Scope](https://www.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), attribution "Solar System Scope" | averaged over its 500 rows (color weighed by opacity), cropped to the ring (columns 455 to 7800), resampled to 2048 columns, its color drawn 60 % towards a warm grey of the same brightness and brightened by 1.6 |
| `giant-2k.jpg` | The gas giant: Jupiter, 2048 × 1024 | ["Cassini's Best Maps of Jupiter (Cylindrical Map)"](https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map), PIA07782 (3601 × 1801 TIFF), credit NASA/JPL/Space Science Institute, [JPL Image Use Policy](https://www.jpl.nasa.gov/jpl-image-use-policy/) (any purpose, with credit, no endorsement by NASA, JPL or Caltech claimed or implied) | scaled down, JPEG quality 80, colors unchanged |
| `giant-1k.jpg` | The same, 1024 × 512 | the same | scaled down, JPEG quality 80 |

The maps were scaled and compressed with macOS `sips`; the ring strip was made with a short Node script using only its built-in zlib.
