import type { Command } from "commander";
import chalk from "chalk";
import { getSections, createSection, updateSection, deleteSection } from "../api/sections.ts";
import { resolveProjectName } from "../utils/quick-add.ts";
import { handleError } from "../utils/errors.ts";
import { cliExit } from "../utils/exit.ts";
import { ID_WIDTH } from "../utils/format.ts";

const NAME_WIDTH = 30;

async function resolveProjectOpt(value: string): Promise<string> {
  const resolved = await resolveProjectName(value);
  if (resolved) return resolved;
  return value;
}

export function registerSectionCommand(program: Command): void {
  const section = program
    .command("section")
    .description("Manage sections");

  section
    .command("list")
    .description("List sections")
    .requiredOption("-P, --project <name-or-id>", "Project name or ID")
    .action(async (opts: { project: string }) => {
      try {
        const projectId = await resolveProjectOpt(opts.project);
        const sections = await getSections(projectId);
        if (sections.length === 0) {
          console.log(chalk.dim("No sections found."));
          return;
        }

        const header = `${"ID".padEnd(ID_WIDTH)} ${"Name".padEnd(NAME_WIDTH)} Order`;
        console.log(chalk.bold(header));
        console.log(chalk.dim("-".repeat(ID_WIDTH + 1 + NAME_WIDTH + 1 + 5)));

        for (const s of sections) {
          const id = s.id.padEnd(ID_WIDTH);
          const name = (s.name.length > 28 ? s.name.slice(0, 27) + "..." : s.name).padEnd(NAME_WIDTH);
          console.log(`${id} ${name} ${s.order}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  section
    .command("create")
    .description("Create a new section")
    .argument("<name>", "Section name")
    .requiredOption("-P, --project <name-or-id>", "Project name or ID")
    .action(async (name: string, opts: { project: string }) => {
      try {
        const projectId = await resolveProjectOpt(opts.project);
        const result = await createSection({
          name,
          project_id: projectId,
        });
        console.log(chalk.green(`Section created: ${result.name} (${result.id})`));
      } catch (err) {
        handleError(err);
      }
    });

  section
    .command("update")
    .description("Update a section")
    .argument("<id>", "Section ID")
    .option("--name <name>", "New section name")
    .action(async (id: string, opts: { name?: string }) => {
      try {
        if (!opts.name) {
          console.error(chalk.red("No update options provided. Use --name."));
          cliExit(1);
        }

        const result = await updateSection(id, { name: opts.name });
        console.log(chalk.green(`Section ${result.id} updated: ${result.name}`));
      } catch (err) {
        handleError(err);
      }
    });

  section
    .command("delete")
    .description("Delete a section")
    .argument("<id>", "Section ID")
    .action(async (id: string) => {
      try {
        await deleteSection(id);
        console.log(chalk.green(`Section ${id} deleted.`));
      } catch (err) {
        handleError(err);
      }
    });
}
