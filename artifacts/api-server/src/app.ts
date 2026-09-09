import express, { type Express } from "express";
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

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
