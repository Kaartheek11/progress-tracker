import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const githubRepository = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
  base: githubRepository ? `/${githubRepository}/` : "/",
  plugins: [react()]
});
