import type { Command } from "commander";
import chalk from "chalk";
import { setToken } from "../config/index.ts";
import { cliExit } from "../utils/exit.ts";
import { getProjects } from "../api/projects.ts";
import { createInterface } from "readline";

export function registerAuthCommand(program: Command): void {
  program
    .command("auth")
    .description("Authenticate with your Todoist API token")
    .action(async () => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const token = await new Promise<string>((resolve) => {
        rl.question("Enter your Todoist API token: ", (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      if (!token) {
        console.error(chalk.red("Token cannot be empty."));
        cliExit(1);
      }

      setToken(token);

      try {
        const projects = await getProjects();
        console.log(chalk.green(`Authenticated successfully. Found ${projects.length} project(s).`));
      } catch {
        console.error(chalk.red("Authentication failed. The token may be invalid."));
        cliExit(1);
      }
    });
}
