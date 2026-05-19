# Repository Guidelines

## Project Structure & Module Organization
This is a standalone web-based management system for plumbing tools, designed to run entirely offline. The core application logic resides in a monolithic `app.js` file, which manages state, UI rendering, and synchronization across browser tabs.

- **Frontend**: `index.html`, `app.js`, and `styles.css`.
- **Persistence**: Data is stored locally using `localStorage`.
- **Sync**: Tab synchronization is handled via the `BroadcastChannel` API.
- **Launcher**: A C# wrapper (`SingleFileLauncher.cs`) allows the app to run as a dedicated Windows executable using Microsoft Edge in `--app` mode.
- **Build**: The `build_final.ps1` script automates asset embedding and compilation.

## Build, Test, and Development Commands
The project does not use a JavaScript package manager (npm/yarn). All development and build tasks are handled via PowerShell.

- **Build Executable**: `./build_final.ps1` (Requires .NET Framework 4.0+ `csc.exe` in path).
- **Development**: Open `index.html` directly in any modern web browser.
- **Manual Extraction**: The build script embeds `index.html`, `app.js`, and `styles.css` as Base64 strings into the C# source before compilation.

## Coding Style & Naming Conventions
- **Vanilla JS**: Avoid external frameworks; use native DOM APIs.
- **State Management**: The global `app` object in `app.js` serves as the single source of truth.
- **Naming**: Functions follow a `bind[Feature]` or `render[Feature]` naming convention for UI initialization and updates.
- **Arabic UI**: The user interface and `README.md` are in Arabic. Coding identifiers (variables/functions) are in English.

## Testing Guidelines
There are no automated test suites. Verification must be performed manually by:
1. Opening the application in a browser.
2. Checking data persistence after page refresh.
3. Verifying tab sync functionality.

## Deployment Guidelines
The `Final_Output/` directory contains the production-ready executable and supporting assets. The `Kero_System_Setup.exe` is the primary distribution file.
