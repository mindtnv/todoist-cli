import type { Command } from "commander";
import chalk from "chalk";
import { getComments, createComment, updateComment, deleteComment } from "../api/comments.ts";
import { handleError } from "../utils/errors.ts";
import { ID_WIDTH } from "../utils/format.ts";
import { resolveTaskArg } from "../utils/resolve.ts";

const POSTED_WIDTH = 22;

export function registerCommentCommand(program: Command): void {
  const comment = program
    .command("comment")
    .description("Manage comments");

  comment
    .command("add")
    .description("Add a comment to a task")
    .argument("<task-id>", "Task ID")
    .argument("<text>", "Comment text")
    .action(async (rawTaskId: string, text: string) => {
      try {
        const taskId = await resolveTaskArg(rawTaskId);
        const result = await createComment({ task_id: taskId, content: text });
        console.log(chalk.green(`Comment added (${result.id})`));
      } catch (err) {
        handleError(err);
      }
    });

  comment
    .command("list")
    .description("List comments for a task")
    .argument("<task-id>", "Task ID")
    .action(async (rawTaskId: string) => {
      try {
        const taskId = await resolveTaskArg(rawTaskId);
        const comments = await getComments(taskId);
        if (comments.length === 0) {
          console.log(chalk.dim("No comments found."));
          return;
        }

        const header = `${"ID".padEnd(ID_WIDTH)} ${"Posted".padEnd(POSTED_WIDTH)} Content`;
        console.log(chalk.bold(header));
        console.log(chalk.dim("-".repeat(ID_WIDTH + 1 + POSTED_WIDTH + 1 + 30)));

        for (const c of comments) {
          const id = c.id.padEnd(ID_WIDTH);
          const posted = c.posted_at.padEnd(POSTED_WIDTH);
          console.log(`${id} ${posted} ${c.content}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  comment
    .command("update")
    .description("Update a comment")
    .argument("<id>", "Comment ID")
    .requiredOption("--text <text>", "New comment text")
    .action(async (id: string, opts: { text: string }) => {
      try {
        const result = await updateComment(id, { content: opts.text });
        console.log(chalk.green(`Comment ${result.id} updated.`));
      } catch (err) {
        handleError(err);
      }
    });

  comment
    .command("delete")
    .description("Delete a comment")
    .argument("<id>", "Comment ID")
    .action(async (id: string) => {
      try {
        await deleteComment(id);
        console.log(chalk.green(`Comment ${id} deleted.`));
      } catch (err) {
        handleError(err);
      }
    });
}
