import type { Command } from "commander";
import chalk from "chalk";
import {
  discoverPlugins,
  installPlugin,
  removePlugin,
  updatePlugin,
  updateAllPlugins,
  enablePlugin,
  disablePlugin,
  getRegisteredMarketplaces,
  addMarketplace,
  removeMarketplace,
  refreshMarketplaceCache,
} from "../plugins/marketplace.ts";
import { getConfig } from "../config/index.ts";

export function registerPluginCommand(program: Command): void {
  const plugin = program
    .command("plugin")
    .description("Manage plugins and marketplaces");

  // ── todoist plugin list ──
  plugin
    .command("list")
    .description("List installed plugins")
    .action(() => {
      try {
        const config = getConfig();
        const plugins = config.plugins;

        if (!plugins || Object.keys(plugins).length === 0) {
          console.log(chalk.dim("No plugins installed."));
          console.log(chalk.dim("Discover plugins with: todoist plugin discover"));
          return;
        }

        console.log(chalk.bold("Installed Plugins"));
        console.log("");

        for (const [name, entry] of Object.entries(plugins)) {
          const isEnabled = entry.enabled !== false;
          const status = isEnabled ? chalk.green("●") : chalk.yellow("○");
          const statusLabel = isEnabled ? chalk.green("enabled") : chalk.yellow("disabled");
          const version = (entry.version as string) ?? "unknown";
          const source = (entry.source as string) ?? "";

          console.log(
            `  ${status} ${chalk.bold(name)} ${chalk.cyan("v" + version)} ${statusLabel} ${chalk.dim(source)}`,
          );
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin discover ──
  plugin
    .command("discover")
    .description("Browse available plugins from all marketplaces")
    .action(async () => {
      try {
        console.log(chalk.dim("Fetching plugins from marketplaces..."));
        const discovered = await discoverPlugins();

        if (discovered.length === 0) {
          console.log(chalk.dim("No plugins found in any marketplace."));
          return;
        }

        // Group by marketplace
        const grouped = new Map<string, typeof discovered>();
        for (const plugin of discovered) {
          const group = grouped.get(plugin.marketplace) ?? [];
          group.push(plugin);
          grouped.set(plugin.marketplace, group);
        }

        for (const [marketplace, plugins] of grouped) {
          console.log("");
          console.log(chalk.bold.underline(marketplace));
          console.log("");

          for (const p of plugins) {
            let indicator: string;
            if (p.installed && p.enabled) {
              indicator = chalk.green("●");
            } else if (p.installed && !p.enabled) {
              indicator = chalk.yellow("◐");
            } else {
              indicator = chalk.dim("○");
            }

            const version = p.version ? chalk.cyan("v" + p.version) : "";
            const description = p.description ? chalk.dim(p.description) : "";

            console.log(`  ${indicator} ${chalk.bold(p.name)} ${version} ${description}`);
          }
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin install <name> ──
  plugin
    .command("install")
    .description("Install a plugin (optionally name@marketplace)")
    .argument("<name>", "Plugin name (or name@marketplace)")
    .action(async (nameArg: string) => {
      try {
        let pluginName = nameArg;
        let marketplaceName: string | undefined;

        // Parse name@marketplace syntax
        const atIndex = nameArg.lastIndexOf("@");
        if (atIndex > 0) {
          pluginName = nameArg.substring(0, atIndex);
          marketplaceName = nameArg.substring(atIndex + 1);
        }

        console.log(chalk.dim(`Installing plugin "${pluginName}"...`));
        const result = await installPlugin(pluginName, marketplaceName);
        console.log(chalk.green(`Installed ${result.name} v${result.version} from ${result.marketplace}`));
        if (result.description) {
          console.log(chalk.dim(`  ${result.description}`));
        }
      } catch (err) {
        console.error(chalk.red(`Failed to install: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin remove <name> ──
  plugin
    .command("remove")
    .description("Remove an installed plugin")
    .argument("<name>", "Plugin name")
    .action((name: string) => {
      try {
        removePlugin(name);
        console.log(chalk.green(`Removed ${name}`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin update [name] ──
  plugin
    .command("update")
    .description("Update a specific plugin or all plugins")
    .argument("[name]", "Plugin name (omit to update all)")
    .action(async (name?: string) => {
      try {
        if (name) {
          const result = await updatePlugin(name);
          if (result.updated) {
            console.log(chalk.green(`${result.name}: ${result.message}`));
          } else {
            console.log(chalk.dim(`${result.name}: ${result.message}`));
          }
        } else {
          console.log(chalk.dim("Updating all plugins..."));
          const results = await updateAllPlugins();

          if (results.length === 0) {
            console.log(chalk.dim("No plugins installed."));
            return;
          }

          for (const result of results) {
            if (result.updated) {
              console.log(chalk.green(`  ${result.name}: ${result.message}`));
            } else {
              console.log(chalk.dim(`  ${result.name}: ${result.message}`));
            }
          }
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin enable <name> ──
  plugin
    .command("enable")
    .description("Enable a disabled plugin")
    .argument("<name>", "Plugin name")
    .action((name: string) => {
      try {
        enablePlugin(name);
        console.log(chalk.green(`Enabled ${name}`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin disable <name> ──
  plugin
    .command("disable")
    .description("Disable a plugin without removing it")
    .argument("<name>", "Plugin name")
    .action((name: string) => {
      try {
        disablePlugin(name);
        console.log(chalk.yellow(`Disabled ${name}`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin marketplace ──
  const marketplace = plugin
    .command("marketplace")
    .description("Manage plugin marketplaces");

  // ── todoist plugin marketplace list ──
  marketplace
    .command("list")
    .description("List registered marketplaces")
    .action(() => {
      try {
        const marketplaces = getRegisteredMarketplaces();

        console.log(chalk.bold("Registered Marketplaces"));
        console.log("");

        for (const m of marketplaces) {
          const autoUpdate = m.autoUpdate ? chalk.green("auto-update") : chalk.dim("manual");
          console.log(`  ${chalk.bold(m.name)} ${chalk.dim(m.source)} ${autoUpdate}`);
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin marketplace add <source> ──
  marketplace
    .command("add")
    .description("Add a marketplace (e.g. github:user/repo)")
    .argument("<source>", "Marketplace source (github:user/repo)")
    .action((source: string) => {
      try {
        const name = addMarketplace(source);
        console.log(chalk.green(`Added marketplace "${name}" from ${source}`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin marketplace remove <name> ──
  marketplace
    .command("remove")
    .description("Remove a registered marketplace")
    .argument("<name>", "Marketplace name")
    .action((name: string) => {
      try {
        removeMarketplace(name);
        console.log(chalk.green(`Removed marketplace "${name}"`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });

  // ── todoist plugin marketplace refresh [name] ──
  marketplace
    .command("refresh")
    .description("Refresh marketplace cache")
    .argument("[name]", "Marketplace name (omit to refresh all)")
    .action(async (name?: string) => {
      try {
        console.log(chalk.dim(`Refreshing ${name ? `"${name}"` : "all marketplaces"}...`));
        await refreshMarketplaceCache(name);
        console.log(chalk.green(`Marketplace cache refreshed.`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}
