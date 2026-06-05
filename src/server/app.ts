/**
 * Express server for the TP automation web UI.
 * Default port: 3001. Vite dev server proxies /api → here.
 *
 * Usage: tsx src/server/app.ts
 */
import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { getISOTimestamp } from "@shared/dates";
import { log } from "../logger";

import { proposalsRouter } from "./routes/proposals";
import { submitRouter } from "./routes/submit";
import { hooksRouter } from "./routes/hooks";
import { weekRouter } from "./routes/week";
import { zucchettiRouter } from "./routes/zucchetti";
import { analyseRouter as analyseRouter } from "./routes/analyse";
import { signalsRouter } from "./routes/signals";
import { syncRouter } from "./routes/sync";
import { CONFIG } from "@shared/env-config";


const app = express();
const PORT = CONFIG.SERVER_PORT ?? 3001;

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIST = resolve(__dirname, "../../web/dist");

app.use(cors());
app.use(express.json());

app.use("/api/proposals", proposalsRouter);
app.use("/api/submit", submitRouter);
app.use("/api/hooks", hooksRouter);
app.use("/api/week", weekRouter);
app.use("/api/zucchetti", zucchettiRouter);
app.use("/api/analyse", analyseRouter);
app.use("/api/day", signalsRouter);
app.use("/api/sync", syncRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", ts: getISOTimestamp() });
});

// --- Frontend statico (build di produzione) ---
// Serve web/dist se presente; fallback SPA su index.html per ogni rotta non-/api.
if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(resolve(WEB_DIST, "index.html"));
  });
} else {
  log.warn(`web/dist non trovato (${WEB_DIST}). Esegui 'npm run web:build'.`);
}

app.listen(PORT, () => {
  log.info(`Server in ascolto su http://localhost:${PORT}`);
  if (existsSync(WEB_DIST)) {
    log.info(`UI disponibile su http://localhost:${PORT}`);
  }
});

export default app;
