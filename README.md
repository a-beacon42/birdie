# Birdie

A cross-platform mobile application built with **Expo** and **React Native** using **TypeScript**. Birdie helps you learn bird identification by building custom flashcard decks.

## Prerequisites

- Node.js (v14 or higher)
- npm or Yarn
- Expo CLI (`npm install -g expo-cli`)
- XCode & iOS simulator

## Getting Started

1. Clone the repo:
   ```bash
   git clone https://github.com/a-beacon42/birdie.git
   ```
2. Change into the project directory:
   ```bash
   cd birdie
   ```
3. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

## Running the App

- Start the development server:
  ```bash
  npm run start
  # or
  yarn start
  ```

- Open on Android emulator/device:
  ```bash
  npm run android
  ```

- Open on iOS simulator/device:
  ```bash
  npm run ios
  ```

- Open in web browser:
  ```bash
  npm run web
  ```

## Project Structure

```
/ birdie
├─ app.json            # Expo configuration
├─ index.ts            # App entry point
├─ package.json        # Dependencies & scripts
├─ tsconfig.json       # TypeScript config
├─ eslint.config.js    # ESLint rules
├─ assets/             # Images and icons
├─ docs/               # Documentation & diagrams
└─ src/                # Application source code
   ├─ App.tsx          # Root component
   ├─ @types           # Type definitions
   ├─ api              # External API connectors
   ├─ components/      # Reusable UI components
   ├─ data/            # Mock or static data
   ├─ hooks/           # Custom React hooks
   ├─ services/        # Business logic and data services (e.g., API calls, storage, authentication)
   └─ screens/         # Screen components
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m "Add feature"`).
4. Push to your branch (`git push origin feature/your-feature`).
5. Open a Pull Request.