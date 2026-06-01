# Contributing to Qastor

First, thank you for taking the time to contribute to Qastor! :D 

This project is completely open-source, so you are welcome to contribute to it, even fork it to adapt it to your own needs. If you desire to contribute to Qastor, please read these contribution guidelines.

## Code of Conduct

By participating in this project, you are expected to uphold a welcoming and professional environment. Please be respectful to others in issues and pull requests.

## Development Environment Setup

Qastor is a desktop application built with Tauri, React, and Deno. To set up your local development environment, you will need:

1. **Rust**: Required for the Tauri backend. Install via [rustup](https://rustup.rs/).
2. **Deno**: Used as the primary toolchain for the frontend. Install from [deno.com](https://deno.com/).
3. **Node.js**: Required solely for Tauri CLI compatibility.

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/adriandomc/qastor.git
   cd qastor
   ```
2. Install dependencies:
   ```bash
   deno install
   ```
3. Start the development server:
   ```bash
   deno task tauri dev
   ```

## Project Structure

- `src/`: The React 18 frontend code. State is managed via Zustand and routing via React Router.
- `src-tauri/`: The Rust backend code handling file system operations, global hotkeys, and screenshot capture.
- `design-system/`: Contains the UI tokens and components (ADC-UI). Please adhere to the existing design system when building new views.
- `schema/`: Contains the JSON Schema `test-case.schema.json` used for validating test cases.

## Development Guidelines

1. **Keep it simple**: We prefer straightforward solutions over complex abstractions.
2. **TypeScript**: The frontend uses strict TypeScript. Avoid using `any` and ensure your types are properly defined.
3. **Rust**: Use standard Rust formatting (`rustfmt`). Errors should be returned as strings to the frontend using the `Result<T, String>` pattern. Do not use panics for expected errors.
4. **UI Changes**: Do not hardcode colors or typography. Use the CSS variables provided by the design system (e.g., `var(--color-moss-text)`).

## Submitting Pull Requests

1. Fork the repository and create your branch from `main`.
2. If you've added new features, ensure they work across platforms (macOS, Windows, Linux) if possible, or note any platform-specific limitations.
3. Update the documentation (README or internal guides) if you change any core behavior.
4. Open a Pull Request with a clear description of the problem you are solving and how you solved it.

## Reporting Issues

If you find a bug or have a feature request, please open an issue in the GitHub repository. Include as much detail as possible, such as:
- Operating System version
- Steps to reproduce the bug
- Expected behavior vs actual behavior
