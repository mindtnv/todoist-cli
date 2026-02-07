import type { Command } from "commander";
import chalk from "chalk";
import { getTask, getTasks } from "../../../api/tasks.ts";
import { getProjects } from "../../../api/projects.ts";
import { getSections } from "../../../api/sections.ts";
import { getComments } from "../../../api/comments.ts";
import { priorityLabel } from "../../../utils/format.ts";
import { handleError } from "../../../utils/errors.ts";
import { resolveTaskArg } from "../../../utils/resolve.ts";

export function registerShowCommand(task: Command): void {
  task
    .command("show")
    .description("Show full details of a task")
    .argument("<id>", "Task ID")
    .option("--json", "Output as JSON")
    .action(async (rawId: string, opts: { json?: boolean }) => {
      try {
        const id = await resolveTaskArg(rawId);
        const [t, projects, allTasks] = await Promise.all([
          getTask(id),
          getProjects(),
          getTasks(),
        ]);
        const projectName = projects.find((p) => p.id === t.project_id)?.name ?? t.project_id;

        // Resolve section name
        let sectionName: string | null = null;
        if (t.section_id) {
          const sections = await getSections(t.project_id);
          sectionName = sections.find(s => s.id === t.section_id)?.name ?? t.section_id;
        }

        // Resolve parent task content
        let parentContent: string | null = null;
        if (t.parent_id) {
          try {
            const parent = await getTask(t.parent_id);
            parentContent = parent.content;
          } catch { /* ignore */ }
        }

        // Get subtasks
        const subtasks = allTasks.filter(st => st.parent_id === t.id);

        // Get comments
        let comments: { id: string; content: string; posted_at: string }[] = [];
        try {
          comments = await getComments(t.id);
        } catch { /* comments may not be available */ }

        if (opts.json) {
          console.log(JSON.stringify({ ...t, project_name: projectName, section_name: sectionName, subtasks, comments }, null, 2));
          return;
        }

        console.log("");
        console.log(chalk.bold(t.content));
        if (t.description) {
          console.log("");
          console.log(chalk.dim("  " + t.description.split("\n").join("\n  ")));
        }
        console.log("");
        console.log(`  ${chalk.dim("ID:")}          ${t.id}`);
        console.log(`  ${chalk.dim("Priority:")}    ${priorityLabel(t.priority)}`);
        console.log(`  ${chalk.dim("Project:")}     ${projectName}`);
        if (sectionName) {
          console.log(`  ${chalk.dim("Section:")}     ${sectionName}`);
        }
        if (t.parent_id) {
          console.log(`  ${chalk.dim("Parent:")}      ${parentContent ?? t.parent_id}`);
        }
        if (t.due) {
          const dueStr = t.due.datetime ?? t.due.date;
          const recurring = t.due.is_recurring ? chalk.cyan(` (recurring: ${t.due.string})`) : "";
          console.log(`  ${chalk.dim("Due:")}         ${dueStr}${recurring}`);
        }
        if (t.deadline) {
          console.log(`  ${chalk.dim("Deadline:")}    ${chalk.magenta(t.deadline.date)}`);
        }
        if (t.labels.length > 0) {
          console.log(`  ${chalk.dim("Labels:")}      ${chalk.cyan(t.labels.join(", "))}`);
        }
        const created = t.created_at;
        if (created) console.log(`  ${chalk.dim("Created:")}     ${created}`);
        if (t.url) console.log(`  ${chalk.dim("URL:")}         ${t.url}`);

        // Subtasks
        if (subtasks.length > 0) {
          console.log("");
          console.log(chalk.bold(`  Subtasks (${subtasks.length}):`));
          for (const st of subtasks) {
            const pri = priorityLabel(st.priority);
            const due = st.due ? chalk.dim(` (${st.due.date})`) : "";
            console.log(`    ${pri}  ${st.content}${due}`);
          }
        }

        // Comments
        if (comments.length > 0) {
          console.log("");
          console.log(chalk.bold(`  Comments (${comments.length}):`));
          for (const c of comments) {
            const date = new Date(c.posted_at);
            const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
            console.log(`    ${chalk.dim(timeStr)}  ${c.content}`);
          }
        }

        console.log("");
      } catch (err) {
        handleError(err);
      }
    });
}
