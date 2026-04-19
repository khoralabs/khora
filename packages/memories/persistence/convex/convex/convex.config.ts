import { defineApp } from "convex/server";
import memories from "../src/component/convex.config.js";

const app = defineApp();
app.use(memories, { name: "memories" });
export default app;
