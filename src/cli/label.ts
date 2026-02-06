import type { Command } from "commander";
import chalk from "chalk";
import { getLabels, createLabel, updateLabel, deleteLabel } from "../api/labels.ts";
import { handleError } from "../utils/errors.ts";
import { cliExit } from "../utils/exit.ts";
import { ID_WIDTH } from "../utils/format.ts";

const NAME_WIDTH = 25;
const COLOR_WIDTH = 12;

export function registerLabelCommand(program: Command): void {
  const label = program
    .command("label")
    .description("Manage labels");

  label
    .command("list")
    .description("List all labels")
    .option("--json <fields>", "Output JSON with specified fields (comma-separated)")
    .option("-q, --quiet", "Print only label IDs")
    .action(async (opts: { json?: string; quiet?: boolean }) => {
      try {
        const labels = await getLabels();

        if (opts.quiet) {
          for (const l of labels) console.log(l.id);
          return;
        }

        if (opts.json !== undefined) {
          const fields = opts.json.split(",").map((f) => f.trim());
          const data = labels.map((l) => {
            const obj: Record<string, unknown> = {};
            for (const f of fields) {
              if (f in l) obj[f] = (l as unknown as Record<string, unknown>)[f];
            }
            return obj;
          });
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        if (labels.length === 0) {
          console.log(chalk.dim("No labels found."));
          return;
        }

        const header = `${"ID".padEnd(ID_WIDTH)} ${"Name".padEnd(NAME_WIDTH)} ${"Color".padEnd(COLOR_WIDTH)} Favorite`;
        console.log(chalk.bold(header));
        console.log(chalk.dim("-".repeat(ID_WIDTH + 1 + NAME_WIDTH + 1 + COLOR_WIDTH + 1 + 8)));

        for (const l of labels) {
          const id = l.id.padEnd(ID_WIDTH);
          const name = l.name.padEnd(NAME_WIDTH);
          const color = l.color.padEnd(COLOR_WIDTH);
          const fav = l.is_favorite ? chalk.yellow("*") : " ";
          console.log(`${id} ${name} ${color} ${fav}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  label
    .command("create")
    .description("Create a new label")
    .argument("<name>", "Label name")
    .action(async (name: string) => {
      try {
        const result = await createLabel({ name });
        console.log(chalk.green(`Label created: ${result.name} (${result.id})`));
      } catch (err) {
        handleError(err);
      }
    });

  label
    .command("update")
    .description("Update a label")
    .argument("<id>", "Label ID")
    .option("--name <name>", "New label name")
    .option("--color <color>", "New color")
    .action(async (id: string, opts: { name?: string; color?: string }) => {
      try {
        const params: Record<string, unknown> = {};
        if (opts.name) params.name = opts.name;
        if (opts.color) params.color = opts.color;

        if (Object.keys(params).length === 0) {
          console.error(chalk.red("No update options provided. Use --name or --color."));
          cliExit(1);
        }

        const result = await updateLabel(id, params);
        console.log(chalk.green(`Label ${result.id} updated: ${result.name}`));
      } catch (err) {
        handleError(err);
      }
    });

  label
    .command("delete")
    .description("Delete a label")
    .argument("<id>", "Label ID")
    .action(async (id: string) => {
      try {
        await deleteLabel(id);
        console.log(chalk.green(`Label ${id} deleted.`));
      } catch (err) {
        handleError(err);
      }
    });
}
