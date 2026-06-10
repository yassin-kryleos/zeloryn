# QA Script Runbook

This runbook outlines the scripts and execution workflows to run the entire verification pipeline.

---

## Prerequisite
Ensure you are located inside the `Desktop-app` workspace directory:
```bash
cd Desktop-app
```

---

## 1. Run Linter
Runs ESLint styling checks across all TypeScript files:
```bash
npm run lint
```

---

## 2. Run Test Suite
Runs all Vitest unit and integration suites synchronously:
```bash
npm run test
```

---

## 3. Run Backend Server in QA Mode
Launches the backend server on `http://localhost:3001` loaded with the isolated settings:
```bash
# Load QA environment variables
$env:PORT="3001"
$env:NODE_ENV="test"
$env:KRYLEOS_DB_PATH="chat_history.test.json"
$env:KRYLEOS_DATA_DIR="qa-db"

# Start the node server
npm run server
```
