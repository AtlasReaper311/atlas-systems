import { execFileSync } from "node:child_process";
import test from "node:test";

test("print static performance candidate", () => {
  try {
    execFileSync("python3", ["scripts/measure_static_performance.py", "--check-only"], { encoding: "utf8" });
  } catch (error) {
    console.log(error.stderr);
  }
});
