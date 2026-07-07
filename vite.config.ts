import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function routeTuningSaver() {
  return {
    name: "route-tuning-saver",
    configureServer(server) {
      server.middlewares.use("/api/save-route-tuning", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method Not Allowed");
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            const outputPath = resolve(__dirname, "src/routeTuning.generated.json");
            writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.statusCode = 400;
            res.end(error instanceof Error ? error.message : "Invalid route tuning");
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), routeTuningSaver()],
});
