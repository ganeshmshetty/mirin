# Contributing to Gemini CLI

We welcome contributions to Gemini CLI. This guide describes the local
development setup, code style requirements, and submission processes you must
follow to get your changes merged.

Following these guidelines ensures that the codebase remains clean, reliable,
and easy to maintain.

## Development environment setup

You must install the required dependencies on your computer before building the
project. This setup lets you run the application in development mode and test
changes locally.

To configure your repository and run the application, follow these sequential
steps:

1. Clone the repository to your local machine.
2. In the root directory, run `npm install` to install the frontend
   dependencies.
3. If you do not have Rust installed on your computer, install it using the
   standard rustup toolchain.
4. Run `npm run dev` to start the development server.

## Code style and standards

You must write code that complies with the project standards to ensure
readability and stability. This project enforces rules for type safety and style
formatting.

### Type safety bridge

We maintain strict type correspondence between Rust backend models and React
frontend components. You must keep the TypeScript type definitions in
`src/types/tauri-commands.ts` in sync with the corresponding Rust structs in the
`mirin-core` crate.

If you modify any Rust struct that passes data over Inter-Process
Communication (IPC), you must update the corresponding TypeScript type in the
same commit.

### Service layer pattern

You must avoid executing Tauri IPC commands directly from React frontend views.
Instead, we recommend calling the wrappers defined in `src/services/` to manage
communication with the backend.

Adhering to this pattern keeps the view components clean and isolates API
changes to the service directory.

### Formatting and testing

We require formatting all source files before submitting a pull request to keep
the codebase clean. You must check that the project compiles without warnings
before committing changes.

To format and check your code, use the following commands:

- Run `npm run check` to check both TypeScript types and Rust compilation.
- Run `npm run format` to run Prettier and cargo fmt to format the codebase.
