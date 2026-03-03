# ProofX - Cryptographic Content Protection for VS Code

Sign, verify, and protect any file with cryptographic proof of ownership. Tamper-proof timestamps, ECDSA digital signatures, and shareable verification URLs.

## Features

- **Right-click → Sign** any file with cryptographic proof
- **Right-click → Verify** check if a file has been tampered with
- **Sign entire folders** with one click
- **Auto-sign on save** (optional)
- **Status bar** showing ProofX shield
- **Verification URLs** shareable proof anyone can check

## How It Works

1. File stays on your machine — only the SHA-256 hash is sent
2. ProofX signs the hash with ECDSA P-256 and timestamps it
3. You get a content ID and verification URL
4. Anyone can verify at proofx.co.uk/verify

## Quick Start

1. Install the extension
2. Get a free API key at [proofx.co.uk/developer](https://proofx.co.uk/developer)
3. `Cmd+Shift+P` → "ProofX: Set API Key"
4. `Cmd+Shift+P` → "ProofX: Set Creator ID"
5. Right-click any file → "ProofX: Sign This File"

## Use Cases

- **Freelancers**: Prove you wrote the code, when you wrote it
- **Agencies**: Tamper-proof deliverables for clients
- **Open Source**: Sign releases cryptographically
- **Legal**: Timestamped proof of code ownership
- **Agents**: Trust layer for AI-generated content

## Commands

| Command | Description |
|---------|-------------|
| ProofX: Sign This File | Sign the current file |
| ProofX: Verify This File | Check if file has been tampered with |
| ProofX: Sign All Files in Folder | Sign every file in a folder |
| ProofX: Set API Key | Configure your API key |
| ProofX: Set Creator ID | Configure your creator ID |

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| proofx.apiKey | Your ProofX API key | "" |
| proofx.creatorId | Your Creator ID | "" |
| proofx.autoSign | Auto-sign on save | false |

## Links

- [Get Free API Key](https://proofx.co.uk/developer)
- [ProofX Website](https://proofx.co.uk)
- [npm Package](https://www.npmjs.com/package/proofx)
- [GitHub](https://github.com/razashariff/proofx-vscode)

## License

MIT
