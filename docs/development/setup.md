# Development setup

Install Node.js/npm and Rust/Cargo, then run:

```sh
git clone https://github.com/ganeshmshetty/mirin.git
cd mirin
npm install
npm run tauri dev
```

Validate static checks with `npm run check`. Focused Rust tests live in
`src-tauri/crates/mirin-core/tests/` and `src-tauri/crates/mirin-mcp/tests/`.
`npm run format` formats frontend files, Markdown, and Rust; review its diff
before using it in a scoped change.
