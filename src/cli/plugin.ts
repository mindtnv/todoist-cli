import type { Command } from "commander";
import chalk from "chalk";
import { installPlugin, removePlugin, listPlugins, enablePlugin, disablePlugin, updatePlugin } from "../plugins/installer.ts";

export function registerPluginCommand(program: Command): void {
  const plugin = program
    .command("plugin")
    .description("Manage plugins");

  plugin
    .command("add")
    .description("Install a plugin (github:user/repo, npm:package, or local path)")
    .argument("<source>", "Plugin source")
    .action(async (source: string) => {
      try {
        console.log(chalk.dim(`Installing plugin from ${source}...`));
        const result = await installPlugin(source);
        console.log(chalk.green(`✓ Installed ${result.name} v${result.version}`));
        if (result.description) {
          console.log(chalk.dim(`  ${result.description}`));
        }
        if (result.permissions?.length) {
          console.log(chalk.dim(`  Permissions: ${result.permissions.join(", ")}`));
        }
      } catch (err) {
        console.error(chalk.red(`Failed to install: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  plugin
    .command("remove")
    .description("Remove an installed plugin")
    .argument("<name>", "Plugin name")
    .action((name: string) => {
      try {
        removePlugin(name);
        console.log(chalk.green(`✓ Removed ${name}`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  plugin
    .command("list")
    .description("List installed plugins")
    .action(() => {
      const plugins = listPlugins();
      if (plugins.length === 0) {
        console.log(chalk.dim("No plugins installed."));
        console.log(chalk.dim("Install one with: todoist plugin add github:user/repo"));
        return;
      }
      for (const p of plugins) {
        const status = p.enabled ? chalk.green("●") : chalk.red("○");
        console.log(`  ${status} ${chalk.bold(p.name)} ${chalk.dim(`(${p.source})`)}`);
      }
    });

  plugin
    .command("enable")
    .description("Enable a disabled plugin")
    .argument("<name>", "Plugin name")
    .action((name: string) => {
      try {
        enablePlugin(name);
        console.log(chalk.green(`✓ Enabled ${name}`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  plugin
    .command("disable")
    .description("Disable a plugin without removing it")
    .argument("<name>", "Plugin name")
    .action((name: string) => {
      try {
        disablePlugin(name);
        console.log(chalk.yellow(`○ Disabled ${name}`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  plugin
    .command("update")
    .description("Update a plugin (or all plugins)")
    .argument("[name]", "Plugin name (omit to update all)")
    .action((name?: string) => {
      try {
        const plugins = name ? [{ name }] : listPlugins();
        if (plugins.length === 0) {
          console.log(chalk.dim("No plugins installed."));
          return;
        }
        for (const p of plugins) {
          try {
            const result = updatePlugin(p.name);
            if (result.updated) {
              console.log(chalk.green(`✓ ${result.name}: ${result.message}`));
            } else {
              console.log(chalk.dim(`  ${result.name}: ${result.message}`));
            }
          } catch (err) {
            console.error(chalk.red(`✗ ${p.name}: ${err instanceof Error ? err.message : err}`));
          }
        }
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });
}
