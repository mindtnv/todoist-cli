import type { Command } from "commander";
import chalk from "chalk";
import { getProjects, getProject, createProject, updateProject, deleteProject } from "../api/projects.ts";
import { getSections } from "../api/sections.ts";
import { getTasks } from "../api/tasks.ts";
import { handleError } from "../utils/errors.ts";
import { cliExit } from "../utils/exit.ts";
import { ID_WIDTH } from "../utils/format.ts";
import { saveLastList, resolveProjectArg } from "../utils/resolve.ts";
import { printJsonFields } from "../utils/json-output.ts";

const NAME_WIDTH = 30;
const COLOR_WIDTH = 12;

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
          printJsonFields(projects as unknown as Record<string, unknown>[], opts.json);
          return;
        }

        if (projects.length === 0) {
          console.log(chalk.dim("No projects found."));
          return;
        }

        const header = `${"#".padStart(3)} ${"ID".padEnd(ID_WIDTH)} ${"Name".padEnd(NAME_WIDTH)} ${"Color".padEnd(COLOR_WIDTH)} Favorite`;
        console.log(chalk.bold(header));
        console.log(chalk.dim("-".repeat(3 + 1 + ID_WIDTH + 1 + NAME_WIDTH + 1 + COLOR_WIDTH + 1 + 8)));

        for (let i = 0; i < projects.length; i++) {
          const p = projects[i]!;
          const num = chalk.dim(String(i + 1).padStart(3));
          const id = p.id.padEnd(ID_WIDTH);
          const name = (p.name.length > 28 ? p.name.slice(0, 27) + "..." : p.name).padEnd(NAME_WIDTH);
          const color = p.color.padEnd(COLOR_WIDTH);
          const fav = p.is_favorite ? chalk.yellow("*") : " ";
          console.log(`${num} ${id} ${name} ${color} ${fav}`);
        }

        saveLastList("project", projects.map(p => ({ id: p.id, label: p.name })));
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
        const parentId = opts.parent ? await resolveProjectArg(opts.parent) : undefined;
        const result = await createProject({
          name,
          color: opts.color,
          parent_id: parentId,
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
    .action(async (rawId: string) => {
      try {
        const id = await resolveProjectArg(rawId);
        await deleteProject(id);
        console.log(chalk.green(`Project ${id} deleted.`));
      } catch (err) {
        handleError(err);
      }
    });
}
