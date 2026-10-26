import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api", router);

// Return API errors (e.g. oversized request bodies) as JSON instead of Express's HTML error page
app.use("/api", (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  logger.error({ err }, "API request failed");
  const status = err.status || err.statusCode || 500;
  const message = err.type === "entity.too.large" ? "Upload is too large. Please split the file and try again." : err.message || "Internal server error";
  res.status(status).json({ error: message });
});

// Serve static frontend assets in production / Dokploy standalone deployment
const possibleStaticDirs = [
  process.env["STATIC_DIR"],
  path.resolve(process.cwd(), "artifacts/diagnostic-center/dist/public"),
  path.resolve(process.cwd(), "public"),
  path.resolve(import.meta.dirname, "../../diagnostic-center/dist/public"),
].filter(Boolean) as string[];

const staticDir = possibleStaticDirs.find((dir) => fs.existsSync(dir));

if (staticDir) {
  logger.info({ staticDir }, "Serving static frontend assets");
  app.use(express.static(staticDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
