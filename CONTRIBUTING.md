# 🦆 Contributing to MCP Rubber Duck

Welcome to the duck pond! 🏞️ We're thrilled that you want to help make our rubber duck debugging experience even better.

```
     __
   <(o )___
    ( ._> /   "Quack! Let's build something amazing together!"
     `---'
```

## 🏊 Getting Your Feet Wet

Before you can swim with the ducks, let's make sure you have everything set up properly.

### Prerequisites

- **Node.js 20+** (because even ducks need modern JavaScript)
- **npm or yarn** (for managing our duck food... er, dependencies)
- **Git** (for version control that doesn't ruffle any feathers)
- **A sense of humor** (optional but highly recommended)

### 🥚 Hatching Your Development Environment

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/nesquikm/mcp-rubber-duck.git
   cd mcp-rubber-duck
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run tests** (make sure everything floats properly)
   ```bash
   npm test
   ```

5. **Start developing!**
   ```bash
   npm run dev
   ```

## 🎯 Ways to Contribute

### 🐛 Found a Bug? Help Us Debug the Duck!

If something's not working right, don't just let it be a sitting duck! Here's how to report it:

1. **Check existing issues** first (maybe another duck already spotted it)
2. **Create a new issue** with:
   - Clear description of what went wrong
   - Steps to reproduce the quacking... er, cracking behavior
   - Your environment details (OS, Node version, etc.)
   - Any error messages (screenshots welcome!)

### 💡 Duck Tales: Suggesting New Features

Got an idea that would make our ducks even more awesome? We're all ears! (Do ducks have ears? 🤔)

1. **Open a feature request issue**
2. **Describe the problem** you're trying to solve
3. **Explain your proposed solution**
4. **Consider alternatives** (there's more than one way to float a duck)

### 🔌 Teaching Ducks New Tricks (Adding Providers)

Want to add support for a new LLM provider? Fantastic! Here's the duck-tested process:

1. **Create a new provider configuration** in `src/providers/`
2. **Add provider tests** (because untested ducks don't swim)
3. **Update documentation** (help other ducks find their way)
4. **Add environment variables** following the `PROVIDER_NAME_*` pattern

## 📏 Duck Standards (Code Guidelines)

We like to keep our code as clean as a duck's... code. Here are our standards:

### TypeScript

- **Use TypeScript** for all new code (even ducks need types)
- **Prefer interfaces over types** when possible
- **Add proper JSDoc comments** for public APIs
- **Use strict null checks** (no undefined ducks allowed)

### Code Style

- **Run the linter**: `npm run lint`
- **Use Prettier**: `npm run format`
- **Follow existing patterns** (when in duck pond, do as the ducks do)
- **Keep functions focused** (one quack per function)

### File Organization

```
src/
├── providers/     # Duck provider implementations
├── tools/         # MCP tool implementations  
├── services/      # Core services (conversations, usage, etc.)
├── config/        # Configuration management
└── utils/         # Utility functions (logging, validation, etc.)
```

## 🧪 Testing (Making Sure Ducks Float)

> "If it walks like a duck and quacks like a duck, it better pass tests like a duck!"

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for active development)
npm run test:watch

# Run with coverage (see which ducks are covered)
npm test -- --coverage
```

### Writing Tests

- **Write tests for new features** (no test, no merge - that's the duck law)
- **Use descriptive test names** (`should quack when duck is happy`)
- **Test error conditions** (what happens when ducks get grumpy?)
- **Mock external dependencies** (don't let real APIs mess with our test ducks)

## 💬 Commit Messages (Duck Communication Protocol)

We use [Conventional Commits](https://www.conventionalcommits.org/) because our automated release system speaks duck:

### Format
```
type(scope): description

[optional body]

[optional footer(s)]
```

### Types That Make Our Ducks Happy
- `feat:` - New feature (🦆 gets a new trick)
- `fix:` - Bug fix (🔧 duck repairs)
- `docs:` - Documentation changes (📚 duck education)
- `style:` - Code style changes (💄 duck grooming)
- `refactor:` - Code refactoring (🏗️ duck house renovation)
- `test:` - Adding tests (🧪 duck quality assurance)
- `chore:` - Maintenance tasks (🧹 duck pond cleaning)

### Good Examples
```bash
feat: add support for Anthropic Claude API
fix: prevent duck overflow in conversation cache
docs: update setup instructions for macOS ducks
test: add integration tests for duck council feature
```

### Version Impact
- `fix:` → Patch release (1.0.0 → 1.0.1)
- `feat:` → Minor release (1.0.0 → 1.1.0)  
- `BREAKING CHANGE:` → Major release (1.0.0 → 2.0.0)

## 🚀 Pull Request Process (Paddling Upstream)

Ready to submit your contribution? Here's how to navigate the waters:

### Before You Submit

1. **Update documentation** if needed
2. **Add tests** for your changes
3. **Run the full test suite**: `npm test`
4. **Lint your code**: `npm run lint`
5. **Build successfully**: `npm run build`
6. **Update CHANGELOG.md** if it's a notable change

### PR Guidelines

1. **Create a descriptive PR title** (following conventional commit format)
2. **Fill out the PR template** (helps us understand your duck logic)
3. **Link any related issues** (`Fixes #123`)
4. **Keep PRs focused** (one feature per duck, please)
5. **Be patient** - our duck reviewers are thorough but fair

### The Review Process

Our council of senior ducks will review your PR. They might:
- **Request changes** (suggestions to make your duck even better)
- **Ask questions** (rubber duck debugging in action!)
- **Approve and merge** (welcome to the pond! 🎉)

## 🤝 Duck Pond Etiquette

We're building a welcoming community where all ducks can thrive:

### The Golden Rules

1. **Be respectful** - No aggressive quacking
2. **Be constructive** - Help make things better
3. **Be patient** - We're all learning to swim
4. **Be inclusive** - Every duck has value
5. **Have fun** - We're building cool stuff with AI ducks!

### Getting Help

- **💬 Discussions**: Use GitHub Discussions for questions
- **🐛 Issues**: Bug reports and feature requests
- **📖 Wiki**: Additional documentation and guides

## 🏆 Recognition

Contributors who help improve our duck pond will be:
- **Listed in our README** (hall of fame!)
- **Mentioned in release notes** (when appropriate)
- **Given our eternal gratitude** (priceless!)

## 📜 Legal Stuff (The Fine Print)

By contributing, you agree that:
- Your contributions will be licensed under the same MIT license
- You have the right to contribute the code
- No ducks were harmed in the making of your contribution

---

## 🦆 Ready to Dive In?

Thanks for reading our contributing guide! Whether you're fixing bugs, adding features, or just improving documentation, every contribution makes our duck pond a better place.

Remember: **Good code is like a good rubber duck - it helps you think clearly and solves problems!**

Happy quacking! 🦆✨

---

*"The best way to debug code is to explain it to a rubber duck. The best way to improve open source is to contribute to it!"*