# Contributing to todoist-cli

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.2 or later
- A [Todoist](https://todoist.com/) account and API token

### Setup

```sh
git clone https://github.com/your-username/todoist-cli.git
cd todoist-cli
bun install
```

Create a `.env` file with your Todoist API token:

```
TODOIST_API_TOKEN=your_token_here
```

Run the CLI in development mode:

```sh
bun run dev
```

## Development

Run a specific CLI command during development:

```sh
bun run dev -- <command> [options]
```

Run the test suite:

```sh
bun test
```

Type-check the project without emitting files:

```sh
bunx tsc --noEmit
```

## Pull Requests

- Describe your changes clearly in the PR description.
- Link the related issue if applicable (e.g. `Closes #42`).
- Make sure tests pass and types check before submitting.

## Bug Reports

Found a bug? Please [open an issue](../../issues/new?template=bug_report.yml) using the bug report template.
