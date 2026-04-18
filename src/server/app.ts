/**
 * Express server for the TP automation web UI.
 * Default port: 3001. Vite dev server proxies /api → here.
 *
 * Usage: tsx src/server/app.ts
 */
import express from "express";
import cors from "cors";
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
const PORT = CONFIG.SERVER_PORT;

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

app.listen(PORT, () => {
  log.info(`Server in ascolto su http://localhost:${PORT}`);
});

export default app;
