import type { Command } from "commander";
import { cliExit } from "../utils/exit.ts";

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
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
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
      completion) _values 'shell' bash zsh fish ;;
    esac
  fi
}

_todoist "$@"`;

const FISH_COMPLETION = `# todoist CLI fish completion

# Disable file completions
complete -c todoist -f

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
complete -c todoist -n "__fish_seen_subcommand_from completion" -a "bash zsh fish" -d "Shell type"`;

export function registerCompletionCommand(program: Command): void {
  program
    .command("completion")
    .description("Generate shell completion script")
    .argument("<shell>", "Shell type: bash, zsh, or fish")
    .action((shell: string) => {
      switch (shell) {
        case "bash":
          console.log(BASH_COMPLETION);
          break;
        case "zsh":
          console.log(ZSH_COMPLETION);
          break;
        case "fish":
          console.log(FISH_COMPLETION);
          break;
        default:
          console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
          cliExit(2);
      }
    });
}
