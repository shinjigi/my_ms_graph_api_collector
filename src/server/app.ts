/**
 * Express server for the TP automation web UI.
 * Default port: 3001. Vite dev server proxies /api → here.
 *
 * Usage: tsx src/server/app.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { getISOTimestamp } from "@shared/dates";
import { log } from "../logger";

import { proposalsRouter } from "./routes/proposals";
import { submitRouter } from "./routes/submit";
import { hooksRouter } from "./routes/hooks";
import { weekRouter } from "./routes/week";
import { zucchettiRouter } from "./routes/zucchetti";
import { analyzeRouter } from "./routes/analyze";
import { signalsRouter } from "./routes/signals";
import { syncRouter } from "./routes/sync";


const app = express();
const PORT = Number(process.env["SERVER_PORT"] ?? 3001);

app.use(cors());
app.use(express.json());

app.use("/api/proposals", proposalsRouter);
app.use("/api/submit", submitRouter);
app.use("/api/hooks", hooksRouter);
app.use("/api/week", weekRouter);
app.use("/api/zucchetti", zucchettiRouter);
app.use("/api/analyze", analyzeRouter);
app.use("/api/day", signalsRouter);
app.use("/api/sync", syncRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", ts: getISOTimestamp() });
});

app.listen(PORT, () => {
  log.info(`Server in ascolto su http://localhost:${PORT}`);
});

export default app;
