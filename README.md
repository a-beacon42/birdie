# Birdie

A cross-platform mobile application built with **Expo** and **React Native** using **TypeScript**. Birdie helps you learn bird identification through flashcard decks powered by a **FastAPI** backend and **Azure Cosmos DB**.

## Architecture

| Layer              | Stack                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Frontend**       | React Native 0.81 · Expo SDK 54 · expo-router · Zustand · TypeScript |
| **Backend**        | FastAPI · Python 3.13 · Azure Cosmos DB · Azure OpenAI               |
| **Infrastructure** | Docker multi-stage · Azure Container Apps · GitHub Actions CI/CD     |

## Prerequisites

- Node.js ≥ 18 and npm
- Python ≥ 3.12
- Docker (for containerised builds)
- Expo CLI (`npx expo`)
- Xcode (iOS) or Android Studio (Android)

## Getting Started

1. Clone the repo:

   ```bash
   git clone https://github.com/a-beacon42/birdie.git && cd birdie
   ```

2. Install frontend dependencies:

   ```bash
   npm install
   ```

3. Set up the backend:

   ```bash
   cd backend
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   cp ../.env.example .env   # then fill in your secrets
   ```

4. Start the backend:

   ```bash
   uvicorn app.main:app --reload
   ```

5. Start the frontend:
   ```bash
   # From the repo root
   npx expo start
   ```

## Environment Variables

Copy `.env.example` to `.env` and set:

| Variable                  | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `COSMOS_ENDPOINT`         | Azure Cosmos DB endpoint                               |
| `COSMOS_KEY`              | Cosmos DB key (omit for managed identity)              |
| `COSMOS_DATABASE`         | Database name                                          |
| `EBIRD_API_KEY`           | eBird API token                                        |
| `API_KEY`                 | Shared secret (signs JWTs, min 32 chars in production) |
| `AZURE_OPENAI_ENDPOINT`   | Azure OpenAI endpoint                                  |
| `AZURE_OPENAI_API_KEY`    | Azure OpenAI key                                       |
| `AZURE_OPENAI_DEPLOYMENT` | Deployment name                                        |

## Running Tests

```bash
cd backend
source .venv/bin/activate
pytest -v
```

## Project Structure

```
birdie/
├─ app/                 # Expo Router screens (index, game)
├─ src/
│  ├─ api/              # Axios API client
│  ├─ components/       # Reusable UI (FlashCard, modals)
│  ├─ hooks/            # Custom React hooks (useApi)
│  ├─ stores/           # Zustand stores (game, preferences)
│  ├─ types/            # TypeScript type definitions
│  └─ theme.ts          # Design tokens (colors, spacing, typography)
├─ backend/
│  ├─ app/
│  │  ├─ main.py        # FastAPI entry point with health checks
│  │  ├─ config.py      # Pydantic settings
│  │  ├─ models/        # Pydantic models (Bird, ChatMessage, etc.)
│  │  ├─ routers/       # API routes (birds, chat, regions, auth)
│  │  └─ services/      # Business logic (Cosmos, eBird proxy, difficulty)
│  └─ tests/            # pytest test suite
├─ tools/etl/           # Data pipeline scripts (eBird → Cosmos DB)
├─ docs/                # Architecture diagrams & privacy policy
├─ Dockerfile           # Multi-stage build (web + API)
└─ .github/workflows/   # CI/CD pipelines
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Run tests and linting before committing
4. Open a Pull Request
