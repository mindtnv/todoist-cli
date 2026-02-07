import type { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import { CONFIG_DIR } from "../config/index.ts";
import { cliExit } from "../utils/exit.ts";

const COMPLETION_CACHE_PATH = join(CONFIG_DIR, ".completion-cache.json");

export interface CompletionCache {
  projects: string[];
  labels: string[];
  updated_at?: string;
}

export function getCompletionCache(): CompletionCache {
  if (!existsSync(COMPLETION_CACHE_PATH)) {
    return { projects: [], labels: [] };
  }
  try {
    const raw = readFileSync(COMPLETION_CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CompletionCache;
  } catch {
    return { projects: [], labels: [] };
  }
}

export function saveCompletionCache(cache: CompletionCache): void {
  writeFileSync(COMPLETION_CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

const BASH_COMPLETION = `#!/usr/bin/env bash
# todoist CLI bash completion
_todoist_completions() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  commands="task project label comment template section auth today inbox ui completion completed review matrix log stats next upcoming overdue search deadlines"
  task_sub="add list complete delete update show reopen move"
  project_sub="list create delete update show"
  label_sub="list create delete update"
  section_sub="list create delete update"
  comment_sub="add list delete update"
  template_sub="save apply list"

  # Dynamic completion from cache
  local cache_file="\${HOME}/.config/todoist-cli/.completion-cache.json"
  local cached_projects=""
  local cached_labels=""
  if [ -f "\${cache_file}" ]; then
    cached_projects=$(cat "\${cache_file}" | grep -o '"projects":\\s*\\[.*\\]' | sed 's/"projects":\\s*\\[//;s/\\]//;s/"//g;s/,/ /g' 2>/dev/null || echo "")
    cached_labels=$(cat "\${cache_file}" | grep -o '"labels":\\s*\\[.*\\]' | sed 's/"labels":\\s*\\[//;s/\\]//;s/"//g;s/,/ /g' 2>/dev/null || echo "")
  fi

  # Complete project names for -P/--project flags
  case "\${prev}" in
    -P|--project)
      COMPREPLY=( $(compgen -W "\${cached_projects}" -- "\${cur}") )
      return 0
      ;;
    -l|--label)
      COMPREPLY=( $(compgen -W "\${cached_labels}" -- "\${cur}") )
      return 0
      ;;
  esac

  case "\${COMP_WORDS[1]}" in
    task)
      COMPREPLY=( $(compgen -W "\${task_sub}" -- "\${cur}") )
      return 0
      ;;
    project)
      COMPREPLY=( $(compgen -W "\${project_sub}" -- "\${cur}") )
      return 0
      ;;
    label)
      COMPREPLY=( $(compgen -W "\${label_sub}" -- "\${cur}") )
      return 0
      ;;
    section)
      COMPREPLY=( $(compgen -W "\${section_sub}" -- "\${cur}") )
      return 0
      ;;
    comment)
      COMPREPLY=( $(compgen -W "\${comment_sub}" -- "\${cur}") )
      return 0
      ;;
    template)
      COMPREPLY=( $(compgen -W "\${template_sub}" -- "\${cur}") )
      return 0
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish update" -- "\${cur}") )
      return 0
      ;;
  esac

  if [ "\${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  fi
  return 0
}
complete -F _todoist_completions todoist`;

const ZSH_COMPLETION = `#compdef todoist
# todoist CLI zsh completion

_todoist_projects() {
  local cache_file="\${HOME}/.config/todoist-cli/.completion-cache.json"
  if [[ -f "\${cache_file}" ]]; then
    local projects
    projects=(\${(f)"$(cat "\${cache_file}" | python3 -c "import sys,json; [print(p) for p in json.load(sys.stdin).get('projects',[])]" 2>/dev/null)"})
    compadd -a projects
  fi
}

_todoist_labels() {
  local cache_file="\${HOME}/.config/todoist-cli/.completion-cache.json"
  if [[ -f "\${cache_file}" ]]; then
    local labels
    labels=(\${(f)"$(cat "\${cache_file}" | python3 -c "import sys,json; [print(l) for l in json.load(sys.stdin).get('labels',[])]" 2>/dev/null)"})
    compadd -a labels
  fi
}

_todoist() {
  local -a commands task_sub project_sub label_sub section_sub comment_sub template_sub

  commands=(
    'task:Manage tasks'
    'project:Manage projects'
    'label:Manage labels'
    'comment:Manage comments'
    'template:Manage templates'
    'section:Manage sections'
    'auth:Authenticate with Todoist'
    'today:Show today and overdue tasks'
    'inbox:Show inbox tasks'
    'ui:Launch interactive TUI'
    'completion:Generate shell completion script'
    'completed:Show completed tasks'
    'review:Interactive GTD weekly review'
    'matrix:Eisenhower matrix view'
    'log:Show activity log'
    'stats:Show productivity stats'
    'next:Show highest-priority actionable task'
    'upcoming:Show tasks for next 7 days'
    'overdue:Show overdue tasks'
    'search:Search tasks by text'
    'deadlines:Show tasks with upcoming deadlines'
  )

  task_sub=(
    'add:Add a new task'
    'list:List tasks'
    'complete:Complete one or more tasks'
    'delete:Delete one or more tasks'
    'update:Update a task'
    'show:Show full task details'
    'reopen:Reopen completed tasks'
    'move:Move task to another project'
  )

  project_sub=(
    'list:List all projects'
    'create:Create a new project'
    'delete:Delete a project'
    'update:Update a project'
    'show:Show project details'
  )

  label_sub=(
    'list:List all labels'
    'create:Create a new label'
    'delete:Delete a label'
    'update:Update a label'
  )

  section_sub=(
    'list:List sections'
    'create:Create a new section'
    'delete:Delete a section'
    'update:Update a section'
  )

  comment_sub=(
    'add:Add a comment to a task'
    'list:List comments for a task'
    'delete:Delete a comment'
    'update:Update a comment'
  )

  template_sub=(
    'save:Save a task as a template'
    'apply:Apply a template'
    'list:List templates'
  )

  # Handle -P/--project and -l/--label flag completions
  case "\${words[CURRENT-1]}" in
    -P|--project) _todoist_projects; return ;;
    -l|--label) _todoist_labels; return ;;
  esac

  if (( CURRENT == 2 )); then
    _describe -t commands 'todoist commands' commands
  elif (( CURRENT == 3 )); then
    case "\${words[2]}" in
      task) _describe -t task_sub 'task subcommands' task_sub ;;
      project) _describe -t project_sub 'project subcommands' project_sub ;;
      label) _describe -t label_sub 'label subcommands' label_sub ;;
      section) _describe -t section_sub 'section subcommands' section_sub ;;
      comment) _describe -t comment_sub 'comment subcommands' comment_sub ;;
      template) _describe -t template_sub 'template subcommands' template_sub ;;
      completion) _values 'shell or action' bash zsh fish update ;;
    esac
  fi
}

_todoist "$@"`;

const FISH_COMPLETION = `# todoist CLI fish completion

# Disable file completions
complete -c todoist -f

# Dynamic completion helpers
function __todoist_cached_projects
  set -l cache_file "$HOME/.config/todoist-cli/.completion-cache.json"
  if test -f "$cache_file"
    cat "$cache_file" | python3 -c "import sys,json; [print(p) for p in json.load(sys.stdin).get('projects',[])]" 2>/dev/null
  end
end

function __todoist_cached_labels
  set -l cache_file "$HOME/.config/todoist-cli/.completion-cache.json"
  if test -f "$cache_file"
    cat "$cache_file" | python3 -c "import sys,json; [print(l) for l in json.load(sys.stdin).get('labels',[])]" 2>/dev/null
  end
end

# Dynamic completions for -P/--project and -l/--label flags
complete -c todoist -l project -s P -x -a "(__todoist_cached_projects)" -d "Project name"
complete -c todoist -l label -s l -x -a "(__todoist_cached_labels)" -d "Label name"

# Main commands
complete -c todoist -n "__fish_use_subcommand" -a "task" -d "Manage tasks"
complete -c todoist -n "__fish_use_subcommand" -a "project" -d "Manage projects"
complete -c todoist -n "__fish_use_subcommand" -a "label" -d "Manage labels"
complete -c todoist -n "__fish_use_subcommand" -a "comment" -d "Manage comments"
complete -c todoist -n "__fish_use_subcommand" -a "template" -d "Manage templates"
complete -c todoist -n "__fish_use_subcommand" -a "section" -d "Manage sections"
complete -c todoist -n "__fish_use_subcommand" -a "auth" -d "Authenticate with Todoist"
complete -c todoist -n "__fish_use_subcommand" -a "today" -d "Show today and overdue tasks"
complete -c todoist -n "__fish_use_subcommand" -a "inbox" -d "Show inbox tasks"
complete -c todoist -n "__fish_use_subcommand" -a "ui" -d "Launch interactive TUI"
complete -c todoist -n "__fish_use_subcommand" -a "completion" -d "Generate shell completion script"
complete -c todoist -n "__fish_use_subcommand" -a "completed" -d "Show completed tasks"
complete -c todoist -n "__fish_use_subcommand" -a "review" -d "Interactive GTD weekly review"
complete -c todoist -n "__fish_use_subcommand" -a "matrix" -d "Eisenhower matrix view"
complete -c todoist -n "__fish_use_subcommand" -a "log" -d "Show activity log"
complete -c todoist -n "__fish_use_subcommand" -a "stats" -d "Show productivity stats"
complete -c todoist -n "__fish_use_subcommand" -a "next" -d "Show highest-priority actionable task"
complete -c todoist -n "__fish_use_subcommand" -a "upcoming" -d "Show tasks for next 7 days"
complete -c todoist -n "__fish_use_subcommand" -a "overdue" -d "Show overdue tasks"
complete -c todoist -n "__fish_use_subcommand" -a "search" -d "Search tasks by text"
complete -c todoist -n "__fish_use_subcommand" -a "deadlines" -d "Show tasks with upcoming deadlines"

# task subcommands
complete -c todoist -n "__fish_seen_subcommand_from task" -a "add" -d "Add a new task"
complete -c todoist -n "__fish_seen_subcommand_from task" -a "list" -d "List tasks"
complete -c todoist -n "__fish_seen_subcommand_from task" -a "complete" -d "Complete one or more tasks"
complete -c todoist -n "__fish_seen_subcommand_from task" -a "delete" -d "Delete one or more tasks"
complete -c todoist -n "__fish_seen_subcommand_from task" -a "update" -d "Update a task"
complete -c todoist -n "__fish_seen_subcommand_from task" -a "show" -d "Show full task details"
complete -c todoist -n "__fish_seen_subcommand_from task" -a "reopen" -d "Reopen completed tasks"
complete -c todoist -n "__fish_seen_subcommand_from task" -a "move" -d "Move task to another project"

# project subcommands
complete -c todoist -n "__fish_seen_subcommand_from project" -a "list" -d "List all projects"
complete -c todoist -n "__fish_seen_subcommand_from project" -a "create" -d "Create a new project"
complete -c todoist -n "__fish_seen_subcommand_from project" -a "delete" -d "Delete a project"
complete -c todoist -n "__fish_seen_subcommand_from project" -a "update" -d "Update a project"
complete -c todoist -n "__fish_seen_subcommand_from project" -a "show" -d "Show project details"

# label subcommands
complete -c todoist -n "__fish_seen_subcommand_from label" -a "list" -d "List all labels"
complete -c todoist -n "__fish_seen_subcommand_from label" -a "create" -d "Create a new label"
complete -c todoist -n "__fish_seen_subcommand_from label" -a "delete" -d "Delete a label"
complete -c todoist -n "__fish_seen_subcommand_from label" -a "update" -d "Update a label"

# section subcommands
complete -c todoist -n "__fish_seen_subcommand_from section" -a "list" -d "List sections"
complete -c todoist -n "__fish_seen_subcommand_from section" -a "create" -d "Create a new section"
complete -c todoist -n "__fish_seen_subcommand_from section" -a "delete" -d "Delete a section"
complete -c todoist -n "__fish_seen_subcommand_from section" -a "update" -d "Update a section"

# comment subcommands
complete -c todoist -n "__fish_seen_subcommand_from comment" -a "add" -d "Add a comment to a task"
complete -c todoist -n "__fish_seen_subcommand_from comment" -a "list" -d "List comments for a task"
complete -c todoist -n "__fish_seen_subcommand_from comment" -a "delete" -d "Delete a comment"
complete -c todoist -n "__fish_seen_subcommand_from comment" -a "update" -d "Update a comment"

# template subcommands
complete -c todoist -n "__fish_seen_subcommand_from template" -a "save" -d "Save a task as a template"
complete -c todoist -n "__fish_seen_subcommand_from template" -a "apply" -d "Apply a template"
complete -c todoist -n "__fish_seen_subcommand_from template" -a "list" -d "List templates"

# completion subcommands
complete -c todoist -n "__fish_seen_subcommand_from completion" -a "bash zsh fish update" -d "Shell type or action"`;

async function updateCompletionCache(): Promise<void> {
  const { getProjects } = await import("../api/projects.ts");
  const { getLabels } = await import("../api/labels.ts");

  try {
    const [projects, labels] = await Promise.all([getProjects(), getLabels()]);
    const cache: CompletionCache = {
      projects: projects.map((p) => p.name),
      labels: labels.map((l) => l.name),
      updated_at: new Date().toISOString(),
    };
    saveCompletionCache(cache);
    console.log(
      chalk.green(`Completion cache updated: ${cache.projects.length} projects, ${cache.labels.length} labels`)
    );
    console.log(chalk.dim(`Saved to ${COMPLETION_CACHE_PATH}`));
  } catch (err) {
    console.error(chalk.red(`Failed to update completion cache: ${err instanceof Error ? err.message : err}`));
    cliExit(1);
  }
}

// ── Dynamic Completion Generation ──

/**
 * Extracts all command names (including nested subcommands) from a Commander
 * program instance. Returns fully-qualified names for subcommands using
 * dot notation, e.g. ["task", "task.add", "task.list", "project", "project.create"].
 */
export function getRegisteredCommands(program: Command): string[] {
  const result: string[] = [];

  function walk(cmd: Command, prefix: string): void {
    for (const sub of cmd.commands) {
      const name = prefix ? `${prefix}.${sub.name()}` : sub.name();
      result.push(name);
      walk(sub, name);
    }
  }

  walk(program, "");
  return result;
}

/**
 * Generates a shell completion script using the provided command list instead
 * of hardcoded command names. This allows plugin-registered commands to be
 * included in completions.
 *
 * The generated scripts include the same dynamic project/label cache completion
 * as the static scripts, but use the provided `commands` array for command names.
 */
export function generateDynamicCompletion(
  shell: "bash" | "zsh" | "fish",
  commands: string[],
): string {
  // Separate top-level commands from subcommands
  const topLevel: string[] = [];
  const subcommands = new Map<string, string[]>();

  for (const cmd of commands) {
    const parts = cmd.split(".");
    if (parts.length === 1) {
      topLevel.push(parts[0]!);
    } else if (parts.length === 2) {
      const parent = parts[0]!;
      const child = parts[1]!;
      if (!subcommands.has(parent)) subcommands.set(parent, []);
      subcommands.get(parent)!.push(child);
    }
    // Deeper nesting (3+) is ignored for shell completion simplicity
  }

  switch (shell) {
    case "bash":
      return generateDynamicBash(topLevel, subcommands);
    case "zsh":
      return generateDynamicZsh(topLevel, subcommands);
    case "fish":
      return generateDynamicFish(topLevel, subcommands);
  }
}

function generateDynamicBash(
  topLevel: string[],
  subcommands: Map<string, string[]>,
): string {
  const topLevelStr = topLevel.join(" ");

  // Build case branches for each parent that has subcommands
  const caseBranches = Array.from(subcommands.entries())
    .map(
      ([parent, children]) =>
        `    ${parent})\n      COMPREPLY=( $(compgen -W "${children.join(" ")}" -- "\${cur}") )\n      return 0\n      ;;`,
    )
    .join("\n");

  return `#!/usr/bin/env bash
# todoist CLI bash completion (dynamically generated)
_todoist_completions() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  commands="${topLevelStr}"

  # Dynamic completion from cache
  local cache_file="\${HOME}/.config/todoist-cli/.completion-cache.json"
  local cached_projects=""
  local cached_labels=""
  if [ -f "\${cache_file}" ]; then
    cached_projects=$(cat "\${cache_file}" | grep -o '"projects":\\s*\\[.*\\]' | sed 's/"projects":\\s*\\[//;s/\\]//;s/"//g;s/,/ /g' 2>/dev/null || echo "")
    cached_labels=$(cat "\${cache_file}" | grep -o '"labels":\\s*\\[.*\\]' | sed 's/"labels":\\s*\\[//;s/\\]//;s/"//g;s/,/ /g' 2>/dev/null || echo "")
  fi

  # Complete project names for -P/--project flags
  case "\${prev}" in
    -P|--project)
      COMPREPLY=( $(compgen -W "\${cached_projects}" -- "\${cur}") )
      return 0
      ;;
    -l|--label)
      COMPREPLY=( $(compgen -W "\${cached_labels}" -- "\${cur}") )
      return 0
      ;;
  esac

  case "\${COMP_WORDS[1]}" in
${caseBranches}
  esac

  if [ "\${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  fi
  return 0
}
complete -F _todoist_completions todoist`;
}

function generateDynamicZsh(
  topLevel: string[],
  subcommands: Map<string, string[]>,
): string {
  // Build the commands array entries (top-level only get simple labels)
  const commandEntries = topLevel
    .map((cmd) => `    '${cmd}:${cmd} command'`)
    .join("\n");

  // Build local variable declarations and case branches for subcommands
  const subVarDecls: string[] = [];
  const caseBranches: string[] = [];

  for (const [parent, children] of subcommands) {
    const varName = `${parent.replace(/-/g, "_")}_sub`;
    const entries = children.map((c) => `    '${c}:${c}'`).join("\n");
    subVarDecls.push(`  ${varName}=(\n${entries}\n  )`);
    caseBranches.push(
      `      ${parent}) _describe -t ${varName} '${parent} subcommands' ${varName} ;;`,
    );
  }

  return `#compdef todoist
# todoist CLI zsh completion (dynamically generated)

_todoist_projects() {
  local cache_file="\${HOME}/.config/todoist-cli/.completion-cache.json"
  if [[ -f "\${cache_file}" ]]; then
    local projects
    projects=(\${(f)"$(cat "\${cache_file}" | python3 -c "import sys,json; [print(p) for p in json.load(sys.stdin).get('projects',[])]" 2>/dev/null)"})
    compadd -a projects
  fi
}

_todoist_labels() {
  local cache_file="\${HOME}/.config/todoist-cli/.completion-cache.json"
  if [[ -f "\${cache_file}" ]]; then
    local labels
    labels=(\${(f)"$(cat "\${cache_file}" | python3 -c "import sys,json; [print(l) for l in json.load(sys.stdin).get('labels',[])]" 2>/dev/null)"})
    compadd -a labels
  fi
}

_todoist() {
  local -a commands

  commands=(
${commandEntries}
  )

${subVarDecls.join("\n\n")}

  # Handle -P/--project and -l/--label flag completions
  case "\${words[CURRENT-1]}" in
    -P|--project) _todoist_projects; return ;;
    -l|--label) _todoist_labels; return ;;
  esac

  if (( CURRENT == 2 )); then
    _describe -t commands 'todoist commands' commands
  elif (( CURRENT == 3 )); then
    case "\${words[2]}" in
${caseBranches.join("\n")}
    esac
  fi
}

_todoist "$@"`;
}

function generateDynamicFish(
  topLevel: string[],
  subcommands: Map<string, string[]>,
): string {
  const lines: string[] = [
    "# todoist CLI fish completion (dynamically generated)",
    "",
    "# Disable file completions",
    "complete -c todoist -f",
    "",
    "# Dynamic completion helpers",
    `function __todoist_cached_projects`,
    `  set -l cache_file "$HOME/.config/todoist-cli/.completion-cache.json"`,
    `  if test -f "$cache_file"`,
    `    cat "$cache_file" | python3 -c "import sys,json; [print(p) for p in json.load(sys.stdin).get('projects',[])]" 2>/dev/null`,
    `  end`,
    `end`,
    "",
    `function __todoist_cached_labels`,
    `  set -l cache_file "$HOME/.config/todoist-cli/.completion-cache.json"`,
    `  if test -f "$cache_file"`,
    `    cat "$cache_file" | python3 -c "import sys,json; [print(l) for l in json.load(sys.stdin).get('labels',[])]" 2>/dev/null`,
    `  end`,
    `end`,
    "",
    `# Dynamic completions for -P/--project and -l/--label flags`,
    `complete -c todoist -l project -s P -x -a "(__todoist_cached_projects)" -d "Project name"`,
    `complete -c todoist -l label -s l -x -a "(__todoist_cached_labels)" -d "Label name"`,
    "",
    "# Main commands",
  ];

  for (const cmd of topLevel) {
    lines.push(
      `complete -c todoist -n "__fish_use_subcommand" -a "${cmd}" -d "${cmd} command"`,
    );
  }

  // Subcommands
  for (const [parent, children] of subcommands) {
    lines.push("");
    lines.push(`# ${parent} subcommands`);
    for (const child of children) {
      lines.push(
        `complete -c todoist -n "__fish_seen_subcommand_from ${parent}" -a "${child}" -d "${child}"`,
      );
    }
  }

  return lines.join("\n");
}

export function registerCompletionCommand(program: Command): void {
  program
    .command("completion")
    .description("Generate shell completion script or update completion cache")
    .argument("<shell-or-action>", "Shell type (bash, zsh, fish) or 'update' to refresh completion cache")
    .action(async (arg: string) => {
      switch (arg) {
        case "bash":
          console.log(BASH_COMPLETION);
          break;
        case "zsh":
          console.log(ZSH_COMPLETION);
          break;
        case "fish":
          console.log(FISH_COMPLETION);
          break;
        case "update":
          await updateCompletionCache();
          break;
        default:
          console.error(`Unknown argument: ${arg}. Supported: bash, zsh, fish, update`);
          cliExit(2);
      }
    });
}
