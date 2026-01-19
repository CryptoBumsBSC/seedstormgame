import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Try multiple strategies to find the public folder
  const candidates = [
    // Strategy 1: Relative to the script being executed (most reliable for bundled code)
    path.resolve(path.dirname(process.argv[1]), "public"),
    // Strategy 2: Relative to current working directory
    path.resolve(process.cwd(), "dist", "public"),
    // Strategy 3: __dirname (works in development)
    path.resolve(__dirname, "public"),
    // Strategy 4: Absolute path from repo root
    "/home/runner/workspace/dist/public",
  ];
  
  let distPath: string | null = null;
  
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      distPath = candidate;
      console.log(`[static] Found public folder at: ${candidate}`);
      break;
    } else {
      console.log(`[static] Not found: ${candidate}`);
    }
  }
  
  if (!distPath) {
    console.error(`[static] Could not find public folder. Tried: ${JSON.stringify(candidates)}`);
    throw new Error(`Could not find the build directory, make sure to build the client first`);
  }

  console.log(`[static] Serving static files from: ${distPath}`);
  
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath!, "index.html"));
  });
}
