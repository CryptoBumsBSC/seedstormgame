import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function serveStatic(app: Express) {
  // In production build, __dirname points to the dist folder
  // Try multiple paths to find the public folder
  let distPath = path.resolve(__dirname, "public");
  
  // Fallback: check if we're in the dist folder directly
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(process.cwd(), "dist", "public");
  }
  
  // Another fallback for different execution contexts
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(path.dirname(process.argv[1]), "public");
  }
  
  if (!fs.existsSync(distPath)) {
    console.error(`Could not find the build directory. Tried paths:
      - ${path.resolve(__dirname, "public")}
      - ${path.resolve(process.cwd(), "dist", "public")}
      - ${path.resolve(path.dirname(process.argv[1]), "public")}`);
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  console.log(`[static] Serving static files from: ${distPath}`);
  
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
