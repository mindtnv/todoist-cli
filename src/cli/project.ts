import type { Command } from "commander";
import chalk from "chalk";
import { getProjects, getProject, createProject, updateProject, deleteProject } from "../api/projects.ts";
import { getSections } from "../api/sections.ts";
import { getTasks } from "../api/tasks.ts";
import { resolveProjectName } from "../utils/quick-add.ts";
import { handleError } from "../utils/errors.ts";
import { cliExit } from "../utils/exit.ts";
import { ID_WIDTH } from "../utils/format.ts";

const NAME_WIDTH = 30;
const COLOR_WIDTH = 12;

async function resolveProjectArg(value: string): Promise<string> {
  const resolved = await resolveProjectName(value);
  if (resolved) return resolved;
  return value;
}

export function registerProjectCommand(program: Command): void {
  const project = program
    .command("project")
    .description("Manage projects");

  project
    .command("list")
    .description("List all projects")
    .option("--json <fields>", "Output JSON with specified fields (comma-separated)")
    .option("-q, --quiet", "Print only project IDs")
    .action(async (opts: { json?: string; quiet?: boolean }) => {
      try {
        const projects = await getProjects();

        if (opts.quiet) {
          for (const p of projects) console.log(p.id);
          return;
        }

        if (opts.json !== undefined) {
          const fields = opts.json.split(",").map((f) => f.trim());
          const data = projects.map((p) => {
            const obj: Record<string, unknown> = {};
            for (const f of fields) {
              if (f in p) obj[f] = (p as unknown as Record<string, unknown>)[f];
            }
            return obj;
          });
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        if (projects.length === 0) {
          console.log(chalk.dim("No projects found."));
          return;
        }

        const header = `${"ID".padEnd(ID_WIDTH)} ${"Name".padEnd(NAME_WIDTH)} ${"Color".padEnd(COLOR_WIDTH)} Favorite`;
        console.log(chalk.bold(header));
        console.log(chalk.dim("-".repeat(ID_WIDTH + 1 + NAME_WIDTH + 1 + COLOR_WIDTH + 1 + 8)));

        for (const p of projects) {
          const id = p.id.padEnd(ID_WIDTH);
          const name = (p.name.length > 28 ? p.name.slice(0, 27) + "..." : p.name).padEnd(NAME_WIDTH);
          const color = p.color.padEnd(COLOR_WIDTH);
          const fav = p.is_favorite ? chalk.yellow("*") : " ";
          console.log(`${id} ${name} ${color} ${fav}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  project
    .command("show")
    .description("Show project details with sections and task count")
    .argument("<name-or-id>", "Project name or ID")
    .action(async (nameOrId: string) => {
      try {
        const projectId = await resolveProjectArg(nameOrId);
        const p = await getProject(projectId);
        const sections = await getSections(projectId);
        const tasks = await getTasks({ project_id: projectId });

        console.log("");
        console.log(chalk.bold(p.name));
        console.log("");
        console.log(`  ${chalk.dim("ID:")}            ${p.id}`);
        console.log(`  ${chalk.dim("Color:")}         ${p.color}`);
        console.log(`  ${chalk.dim("View:")}          ${p.view_style}`);
        console.log(`  ${chalk.dim("Favorite:")}      ${p.is_favorite ? "Yes" : "No"}`);
        console.log(`  ${chalk.dim("Shared:")}        ${p.is_shared ? "Yes" : "No"}`);
        console.log(`  ${chalk.dim("Comments:")}      ${p.comment_count}`);
        console.log(`  ${chalk.dim("Active tasks:")} ${tasks.length}`);
        console.log(`  ${chalk.dim("URL:")}           ${p.url}`);

        if (sections.length > 0) {
          console.log("");
          console.log(chalk.bold("Sections:"));
          for (const s of sections) {
            const sectionTasks = tasks.filter((t) => t.section_id === s.id);
            console.log(`  ${chalk.dim("-")} ${s.name} ${chalk.dim(`(${sectionTasks.length} tasks)`)}`);
          }
        }

        console.log("");
      } catch (err) {
        handleError(err);
      }
    });

  project
    .command("create")
    .description("Create a new project")
    .argument("<name>", "Project name")
    .option("--color <color>", "Project color")
    .option("--parent <id>", "Parent project ID")
    .action(async (name: string, opts: { color?: string; parent?: string }) => {
      try {
        const result = await createProject({
          name,
          color: opts.color,
          parent_id: opts.parent,
        });
        console.log(chalk.green(`Project created: ${result.name} (${result.id})`));
      } catch (err) {
        handleError(err);
      }
    });

  project
    .command("update")
    .description("Update a project")
    .argument("<name-or-id>", "Project name or ID")
    .option("--name <name>", "New project name")
    .option("--color <color>", "New color")
    .option("--favorite", "Mark as favorite")
    .option("--no-favorite", "Remove from favorites")
    .option("--view <style>", "View style: list or board")
    .action(async (nameOrId: string, opts: { name?: string; color?: string; favorite?: boolean; view?: string }) => {
      try {
        const projectId = await resolveProjectArg(nameOrId);
        const params: Record<string, unknown> = {};
        if (opts.name) params.name = opts.name;
        if (opts.color) params.color = opts.color;
        if (opts.favorite !== undefined) params.is_favorite = opts.favorite;
        if (opts.view) params.view_style = opts.view;

        if (Object.keys(params).length === 0) {
          console.error(chalk.red("No update options provided. Use --name, --color, --favorite, or --view."));
          cliExit(1);
        }

        const result = await updateProject(projectId, params);
        console.log(chalk.green(`Project ${result.id} updated: ${result.name}`));
      } catch (err) {
        handleError(err);
      }
    });

  project
    .command("delete")
    .description("Delete a project")
    .argument("<id>", "Project ID")
    .action(async (id: string) => {
      try {
        await deleteProject(id);
        console.log(chalk.green(`Project ${id} deleted.`));
      } catch (err) {
        handleError(err);
      }
    });
}
