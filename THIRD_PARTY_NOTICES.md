# Third-party notices — NoseView 0.1

The application source is private (`UNLICENSED` in package.json). Open-source dependencies retain their respective licenses. Version pins and integrity records are in `package-lock.json`.

| Component | Version | License / source |
|---|---|---|
| Electron | 44.2.0 | MIT; `licenses/electron-LICENSE.txt`; https://github.com/electron/electron |
| Chromium and Electron bundled components | See Electron distribution | `licenses/LICENSES.chromium.html`, also included by Electron's packaging |
| React / React DOM | 19.2.8 | MIT; `licenses/react-LICENSE.txt`, `licenses/react-dom-LICENSE.txt`; https://github.com/facebook/react |
| React Scheduler | See package-lock.json | MIT; `licenses/scheduler-LICENSE.txt` |
| Three.js | 0.185.1 | MIT; `licenses/three-LICENSE.txt`; https://github.com/mrdoob/three.js |
| MediaPipe Tasks Vision | 1.0.1 | Apache-2.0; `licenses/mediapipe-LICENSE.txt`; https://github.com/google-ai-edge/mediapipe |
| Face Landmarker model bundle | float16 / version 1 | Google MediaPipe model asset, source below; facial mesh model card included in `licenses/MediaPipe-Face-Mesh-V2-Model-Card.pdf` |

Model download: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`

Model card source: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf

The Face Landmarker task bundle contains multiple models; the facial mesh card is not a substitute for a complete model/component redistribution review before commercial release. This delivery is a development prototype. No research-only DECA or FLAME assets are included.

The source repository's test-only portrait is an AI-generated fictional adult, generated for this project on 2026-09-09 using OpenAI's image generation tool. It is not a patient photograph or medical outcome and is excluded from the application and ZIP distribution. See `docs/demo-asset.md` in the source repository. The SVG application mark was drawn for this project.

All renderer dependencies are build-time dependencies in package.json because their code is bundled into dist. This classification does not mean they are absent at runtime. Electron and the bundled renderer are included in the packaged app; npm/node_modules/build tools are excluded.

Build tooling uses @electron/packager 20.3.0, Vite, TypeScript, Vitest and Playwright; these are not shipped in the app. Electron Forge 7 was evaluated, but its older archive dependencies and incompatibility with Packager 20 led to using the official Packager directly. macOS ZIP creation uses built-in ditto; Windows ZIP creation uses built-in PowerShell Compress-Archive. There are no dependency overrides.
