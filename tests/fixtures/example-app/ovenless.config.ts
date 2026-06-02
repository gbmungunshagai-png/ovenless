import { defineConfig } from "ovenless";
import router from "./src/index.ts";

export default defineConfig({
  router,
  service: "ovenless-fixture",
  title: "Fixture API",
  version: "0.0.0",
});
