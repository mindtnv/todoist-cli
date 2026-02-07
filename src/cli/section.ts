import type { Command } from "commander";
import chalk from "chalk";
import { getSections, createSection, updateSection, deleteSection } from "../api/sections.ts";
import { handleError } from "../utils/errors.ts";
import { cliExit } from "../utils/exit.ts";
import { ID_WIDTH } from "../utils/format.ts";
import { saveLastList, resolveProjectArg, resolveSectionArg } from "../utils/resolve.ts";

const NAME_WIDTH = 30;

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
        const projectId = await resolveProjectArg(opts.project);
        const sections = await getSections(projectId);
        if (sections.length === 0) {
          console.log(chalk.dim("No sections found."));
          return;
        }

        const header = `${"#".padStart(3)} ${"ID".padEnd(ID_WIDTH)} ${"Name".padEnd(NAME_WIDTH)} Order`;
        console.log(chalk.bold(header));
        console.log(chalk.dim("-".repeat(3 + 1 + ID_WIDTH + 1 + NAME_WIDTH + 1 + 5)));

        for (let i = 0; i < sections.length; i++) {
          const s = sections[i]!;
          const num = chalk.dim(String(i + 1).padStart(3));
          const id = s.id.padEnd(ID_WIDTH);
          const name = (s.name.length > 28 ? s.name.slice(0, 27) + "..." : s.name).padEnd(NAME_WIDTH);
          console.log(`${num} ${id} ${name} ${s.order}`);
        }

        saveLastList("section", sections.map(s => ({ id: s.id, label: s.name })));
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
        const projectId = await resolveProjectArg(opts.project);
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
    .action(async (rawId: string, opts: { name?: string }) => {
      try {
        const id = await resolveSectionArg(rawId);
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
    .action(async (rawId: string) => {
      try {
        const id = await resolveSectionArg(rawId);
        await deleteSection(id);
        console.log(chalk.green(`Section ${id} deleted.`));
      } catch (err) {
        handleError(err);
      }
    });
}
