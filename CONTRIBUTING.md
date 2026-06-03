# Contributing to Tradicted Journal

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/tradicted-journal.git`
3. Install dependencies: `npm install`
4. Start the dev server: `npm run dev`

## Development Guidelines

- Follow the existing code style (TypeScript, React hooks, Tailwind CSS)
- Keep components small and focused
- All database operations go through IPC handlers in `src/main/index.ts`
- No inline styles — use Tailwind utility classes
- Test your changes before submitting a PR

## Submitting a Pull Request

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Commit with a clear message
4. Push and open a pull request against `main`

## Reporting Issues

Open an issue on GitHub with:
- Your OS and version
- Steps to reproduce
- Expected vs actual behavior
