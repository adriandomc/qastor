# Qastor: the tool designed to get those troubling manual tests to their rest!

<p align="center">
  <img src="src-tauri/icons/Square284x284Logo.png" alt="Qastor Logo" />
</p>

[![Build](https://img.shields.io/github/actions/workflow/status/adriandomc/qastor/release.yml?label=Build)](https://github.com/adriandomc/qastor/actions/workflows/release.yml)
[![Release](https://img.shields.io/github/v/release/adriandomc/qastor?include_prereleases)](https://github.com/adriandomc/qastor/releases)
[![License: MIT](https://img.shields.io/github/license/adriandomc/qastor)](./LICENSE)

## What is this?

Qastor is a multi-platform desktop application that allows you to create manual test cases from an
easy to use interface and gather evidence with just a few clicks/keystrokes, allowing developers to
focus on the actual testing rather than copying-and-pasting screenshots or debug logs.

<table>
  <tr>
    <td>Welcome View</td>
    <td>Cases View</td>
  </tr>
  <tr>
    <td><img src="assets/img/README/welcome-screen.png" alt="Qastor welcome screen" /></td>
    <td><img src="assets/img/README/cases-screen.png" alt="Qastor cases screen" /></td>
  </tr>
  <tr>
    <td>Settings View</td>
    <td>Test Case Detail View</td>
  </tr>
  <tr>
    <td><img src="assets/img/README/settings-screen.png" alt="Qastor settings screen" /></td>
    <td><img src="assets/img/README/test-case-screen.png" alt="Qastor test case screen" /></td>
  </tr>
</table>

**WARNING: This tool is an early alpha version and hasn't been fully tested in all operating
systems. Proceed with caution.**

## Why does this exist?
Qastor was created out of the necessity to have a self-contained tool that allows to create and manage manual QA test cases, as well as their evidence. While this is not a new idea, and there are other tools that make a better job out of it, I wanted to create this tool as in my current job, we make extensive use of spreadsheet files to keep track of test cases statuses (both manual and automatic), however what I find the most time consuming is linking the evidences, that are stored on the cloud and then referenced using their URL. When working with hundreds of cases, this becomes a nightmare, and it's a considerable amount of time spent doing this repetitive work, so this is what Qastor is designed for, to reduce that repetive screenshot/upload/link motion and keep everything stored within a single place and at the reach of only a few keystrokes.

## Install
There are readily available releases
[here]([https://www.example.com](https://github.com/adriandomc/qastor/releases)) for the major
operating systems (macOS, Windows, Linux), but I recommend you to build it from source, as it is
still in development.

### Pre-requisites to build from source
If you decide to build Qastor from source, you will need the following installed on your system:
- [Rust](https://www.rust-lang.org/tools/install)
- [Deno](https://deno.com/)
- Node.js (only required for Tauri CLI compatibility)

### macOS
1. Clone the repository.
2. Run `deno install` to set up the environment.
3. Run `deno task tauri build` to generate the `.dmg` file. You can find it under `src-tauri/target/release/bundle/dmg`.
4. Ensure you grant Screen Recording permissions when prompted by the application for the screenshot functionality to work.

### Windows
1. Clone the repository.
2. Run `deno install`.
3. Run `deno task tauri build` to generate the `.msi` file.

### Linux
1. Clone the repository.
2. Run `deno install`.
3. Run `deno task tauri build` to generate the `.AppImage` file.
*Note: Depending on your Wayland/X11 setup, screenshot capture behavior might vary.*

## Features

- **Project-based Structure**: Keep your test cases organized in folders. Qastor relies on a simple JSON schema for test cases, meaning they can be version-controlled effortlessly.
- **Authoring Made Simple**: Create, edit, and organize test cases with tags, priorities, and module grouping directly from the application.
- **Session Runner**: Execute your test cases step by step. A compact runner UI and a system tray indicator will guide you through the process without getting in the way of your actual testing.
- **Automatic Evidence Capture**: Bind global hotkeys to capture screen regions, mark steps as passed or failed, and automatically attach the screenshots to your execution session.
- **Standalone HTML Reports**: Once a session is complete, export a self-contained HTML report with all the steps, statuses, and embedded screenshots, ready to be shared with your team or attached to a Jira/Linear ticket.

## Global Hotkeys (Default)

Qastor uses global hotkeys to prevent context switching while you perform your manual tests:

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Capture region & advance step | `Cmd+Shift+E` | `Ctrl+Shift+E` |
| Mark step as passed & advance | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Mark step as failed | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Mark step as blocked & advance | `Cmd+Shift+B` | `Ctrl+Shift+B` |
| Toggle Qastor window visibility | `Cmd+Shift+Q` | `Ctrl+Shift+Q` |

These hotkeys can be customized in the application settings.

## Technology Stack

- **Desktop Shell**: Tauri 2
- **Frontend**: React 18, TypeScript, Zustand, and React Router.
- **Build Tooling**: Deno 2 and Vite.
- **Validation**: JSON Schema with `ajv` (frontend) and `serde_json` (backend).

## AI Test Case Generation

Writing manual test cases from scratch can be time-consuming. Qastor includes a reference document designed to help you leverage your favorite AI agents (like ChatGPT, Claude, Gemini, or any coding assistant) to generate test cases automatically.

Simply feed the `AI-TEST-CASE-GENERATION.md` file into your AI prompt along with the description of the feature or user story you want to test. The AI will understand Qastor's JSON schema constraints and output ready-to-use `.json` files that you can drop directly into your project structure.

## Limitations

As this is an early alpha release, some features are not yet implemented or fully polished:
- Automated testing integrations (Playwright, Cypress).
- Video recording is currently not supported.
- Cloud synchronization is not built-in.
