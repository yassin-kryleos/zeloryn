# Packaged Runtime QA

Measured June 15, 2026 on Windows using `dist-desktop/win-unpacked/Kryleos Forge.exe`.

- Fresh packaged Electron driver: **pass**. It reset first-run state, opened the packaged renderer, clicked **Run no-key demo**, and observed the success notification.
- Cold renderer readiness: **2,434 ms** to visible no-key demo button.
- Process-tree working set after three seconds idle: **648.1 MB**.
- Packaged driver duration through green demo trace: **26.0 seconds**.
- Installer generation remains environment-limited on this machine: Windows denied symlink creation while electron-builder extracted the cross-platform `winCodeSign` cache. `--dir --config.win.signAndEditExecutable=false` produced and tested the unpacked application successfully.
- A packaged-runtime defect was found and fixed during this test: Vite used absolute `/assets/...` paths under `file://`, producing a black renderer. Desktop Vite now uses `base: './'`.
- A second packaged-only race was found and fixed: global active-project state could change between demo task persistence and trace lookup. The demo now pins its own FLOW session, and `KRYLEOS_DATA_DIR` isolates project, chat, and credential data during packaged QA.

The memory result is above the desired beta comfort range and should be profiled before broad public release.
