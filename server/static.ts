import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Get the directory of the currently running script
  const scriptDir = path.dirname(path.resolve(process.argv[1]));
  
  // Try multiple strategies to find the public folder
  const candidates = [
    // Strategy 1: Relative to the resolved script path (most reliable)
    path.join(scriptDir, "public"),
    // Strategy 2: Relative to current working directory  
    path.resolve(process.cwd(), "dist", "public"),
    // Strategy 3: __dirname (works in development)
    path.resolve(__dirname, "public"),
  ];
  
  console.log(`[static] Script location: ${process.argv[1]}`);
  console.log(`[static] Script directory: ${scriptDir}`);
  console.log(`[static] Current working directory: ${process.cwd()}`);
  console.log(`[static] __dirname: ${__dirname}`);
  
  let distPath: string | null = null;
  
  for (const candidate of candidates) {
    console.log(`[static] Checking: ${candidate}`);
    if (fs.existsSync(candidate)) {
      distPath = candidate;
      console.log(`[static] Found public folder at: ${candidate}`);
      break;
    } else {
      console.log(`[static] Not found: ${candidate}`);
    }
  }
  
  if (!distPath) {
    console.error(`[static] WARNING: Could not find public folder. API routes will still work.`);
    console.error(`[static] Tried: ${JSON.stringify(candidates)}`);
    // Don't throw - just skip static file serving so API routes still work
    app.use("*", (_req, res) => {
      res.status(404).json({ error: "Static files not found", message: "The server is running but static files are not available." });
    });
    return;
  }

  console.log(`[static] Serving static files from: ${distPath}`);
  
  // List files in the directory to verify
  try {
    const files = fs.readdirSync(distPath);
    console.log(`[static] Files in public folder: ${files.join(', ')}`);
  } catch (e) {
    console.error(`[static] Error reading directory: ${e}`);
  }
  
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath!, "index.html"));
  });
}
