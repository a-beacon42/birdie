# Maestro E2E Tests for Birdie

Maestro is used for critical user flow testing across iOS and Android.

## Prerequisites

```bash
# Install Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version
```

## Running Tests

```bash
# Run all flows
maestro test .maestro/

# Run a specific flow
maestro test .maestro/game-flow.yaml

# Record a test run
maestro record .maestro/game-flow.yaml
```

## Test Flows

| Flow             | Description                                    |
| ---------------- | ---------------------------------------------- |
| `game-flow.yaml` | Create game → play through deck → view results |

## Writing New Flows

See [Maestro docs](https://maestro.mobile.dev/getting-started/writing-your-first-flow) for syntax reference.

Flows use `accessibilityLabel` selectors for stability. Ensure all interactive elements have proper labels before writing E2E tests.
