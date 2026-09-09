<div align="center">

# HAND CANNON

**A browser shooter you aim with your finger and fire with your thumb. No controller, no mouse — just your hand and a webcam.**

[![Play now](https://img.shields.io/badge/▶_Play_in_browser-16A34A?style=for-the-badge&logo=googlechrome&logoColor=white)](https://bouwles.github.io/3D-Finger-Tracking-Shooter-Game/)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands-0097A7?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![License](https://img.shields.io/github/license/Bouwles/3D-Finger-Tracking-Shooter-Game?style=for-the-badge&color=16a34a)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/Bouwles/3D-Finger-Tracking-Shooter-Game?style=for-the-badge&color=16a34a)](https://github.com/Bouwles/3D-Finger-Tracking-Shooter-Game/commits)

</div>

---

Point your index finger at the screen and a crosshair tracks it. Snap your thumb
down like pulling a trigger and the cannon fires. Everything runs client-side on
21 hand landmarks from your webcam — no install, no backend, nothing leaves your
machine.

## How to play

| Action | Gesture |
| --- | --- |
| **Aim** | Point your index finger. The crosshair is projected forward along the knuckle→tip vector, so you aim *where the finger points*, not where the fingertip sits. |
| **Shoot** | Snap your thumb down past its base joint — a trigger pull. Detected on the state transition, so holding the thumb down doesn't spray. |
| **Combo** | Chain hits without missing. The multiplier climbs and the floating score popups grow with it. |

Targets drift in from all four screen edges. The spawn interval starts at 1.6s
and tightens as your score climbs, so the difficulty scales with how well you
are actually doing.

## Run it

Play in the browser: **https://bouwles.github.io/3D-Finger-Tracking-Shooter-Game/**

Or locally — stdlib Python only, nothing to install:

```bash
git clone https://github.com/Bouwles/3D-Finger-Tracking-Shooter-Game
cd 3D-Finger-Tracking-Shooter-Game
python3 server.py     # serves on http://localhost:8080 and opens your browser
```

A plain static server works too; the local one just sets the cross-origin headers
and opens the tab for you. Webcam access needs `localhost` or HTTPS — opening
`index.html` as a `file://` URL will not get camera permission.

## How the tracking works

MediaPipe Hands returns 21 landmarks per frame. On top of that:

- **Landmark smoothing** — exponential smoothing (α = 0.55) on every landmark, because raw per-frame output jitters enough to make aiming feel broken.
- **Directional aiming** — the crosshair extends the index MCP (landmark 5) → tip (landmark 8) vector 1.8× beyond the fingertip and remaps it through a margin so the screen edges stay reachable.
- **Sticky extension state** — the "index extended" check needs several consecutive frames to flip on *or* off, so a brief wobble doesn't drop your aim mid-shot.
- **Edge-triggered firing** — the thumb-down check fires once per transition rather than every frame it is held.

## Layout

```
index.html          canvas, HUD, picture-in-picture camera view
js/handTracking.js  MediaPipe wiring, smoothing, gesture detection
js/game.js          targets, hit detection, scoring, spawn pacing
js/particles.js     hit and muzzle particle effects
js/audio.js         procedural WebAudio sound
server.py           zero-dependency local static server
```

## Requirements

A webcam and a modern browser. Chrome gives the most reliable MediaPipe
performance. Decent lighting helps a lot — hand tracking degrades fast in the
dark.

## License

MIT — see [LICENSE](LICENSE).
