import { $, Command } from "../src/command.ts";
import { assertEquals, assertInstanceOf, assertObjectMatch, describe, it } from "./deps.ts";

describe("Command", () => {
  it("uses the correct default options", () => {
    const command = new Command("echo");

    assertObjectMatch(command, {
      cmd: "echo",
      options: {
        name: "echo",
        padStart: 0,
        quiet: false,
        printCommand: false,
        logFile: undefined,
        killSignal: "SIGTERM",
        expectedExitCodes: [0],
      },
    });
  });

  describe("output", () => {
    it("returns the output of the command", async () => {
      const command = new Command("echo", { args: ["Hello World"] });
      const output = await command.output();
      assertEquals(output, "Hello World");
    });
  });
});

describe("$", () => {
  it("creates the expected the Command", () => {
    const command = $`echo "Hello World"`;

    assertInstanceOf(command, Command);
    assertObjectMatch(command, {
      cmd: "echo",
      options: {
        args: ["Hello World"],
      },
    });
  });
});
