# Plugin System Design

> **Status:** Draft
> **Date:** 2026-02-07
> **Goal:** Расширяемая система плагинов для todoist-cli — CLI-команды, TUI-вьюхи, хуки на события, расширение существующих компонентов.

---

## Концепция

Плагины — это внешние модули, которые пользователь устанавливает через команду `todoist plugin add` (по аналогии с MCP-серверами в Claude Code). Плагин может:

- Добавлять новые CLI-команды
- Добавлять TUI-вьюхи, столбцы в TaskRow, секции в TaskDetail
- Подписываться на события задач (create, complete, delete и т.д.)
- Расширять Command Palette и keybindings
- Хранить данные локально (SQLite) или синхронизировать через комментарии Todoist

Плагины **не являются динамически загружаемыми** в runtime — они устанавливаются явно через CLI-команду, скачиваются из GitHub/npm, и загружаются при старте приложения через `import()`.

---

## Установка и управление

### CLI-команды

```bash
# Установка
todoist plugin add github:user/todoist-time-tracking
todoist plugin add npm:todoist-cli-pomodoro
todoist plugin add ./my-local-plugin

# Управление
todoist plugin list
todoist plugin remove time-tracking
todoist plugin update time-tracking
todoist plugin config time-tracking
```

### Конфигурация

```toml
# ~/.config/todoist-cli/config.toml

[plugins]
time-tracking = { source = "github:user/todoist-time-tracking" }
pomodoro = { source = "npm:todoist-cli-pomodoro", after = "time-tracking" }
my-local = { source = "./my-plugin" }
```

Опциональное поле `after` — если плагин зависит от другого.

### Файловая структура

```
~/.config/todoist-cli/
├── config.toml
├── plugins/
│   ├── time-tracking/
│   │   ├── plugin.json          # Манифест
│   │   ├── package.json
│   │   ├── node_modules/
│   │   ├── src/
│   │   ├── dist/
│   │   │   └── index.js         # Точка входа
│   │   └── data/
│   │       └── data.db           # SQLite хранилище
│   └── pomodoro/
│       └── ...
```

### Манифест — plugin.json

```json
{
  "name": "time-tracking",
  "version": "1.0.0",
  "description": "Track time spent on tasks",
  "main": "./dist/index.js",
  "author": "user",
  "source": "github:user/todoist-time-tracking",
  "engines": {
    "todoist-cli": ">=1.0.0"
  },
  "permissions": [
    "tasks.read",
    "tasks.hooks",
    "comments.write",
    "storage",
    "ui.taskRow",
    "ui.views",
    "ui.palette"
  ]
}
```

`permissions` декларативно описывают, что плагин использует. При установке пользователь видит список и подтверждает.

### Процесс `plugin add`

```
todoist plugin add github:user/todoist-time-tracking
  │
  ├── git clone → ~/.config/todoist-cli/plugins/time-tracking/
  ├── cd plugins/time-tracking && bun install
  ├── Читает plugin.json → показывает permissions
  ├── Пользователь подтверждает
  ├── Добавляет запись в config.toml [plugins]
  └── "✓ Installed time-tracking v1.0.0"
```

---

## Plugin Interface — контракт

```typescript
interface TodoistPlugin {
  name: string;
  version: string;
  description?: string;

  // CLI: новые команды
  registerCommands?(program: Command): void;

  // TUI: новые вьюхи
  registerViews?(registry: ViewRegistry): void;

  // Хуки на события задач
  registerHooks?(hooks: HookRegistry): void;

  // Расширение UI-компонентов (столбцы в TaskRow, секции в Detail и т.д.)
  registerExtensions?(extensions: ExtensionRegistry): void;

  // Команды для Command Palette
  registerPaletteCommands?(palette: PaletteRegistry): void;

  // Жизненный цикл
  onLoad?(ctx: PluginContext): Promise<void>;
  onUnload?(): Promise<void>;
}
```

### PluginContext — что получает плагин при загрузке

```typescript
interface PluginContext {
  // Todoist API — проксированный, с событиями
  api: {
    tasks: typeof import('./api/tasks');
    projects: typeof import('./api/projects');
    labels: typeof import('./api/labels');
    comments: typeof import('./api/comments');
  };

  // Хранилище данных плагина
  storage: PluginStorage;

  // Конфигурация плагина из config.toml
  config: Record<string, unknown>;

  // Путь к директории плагина
  pluginDir: string;

  // Логгер
  log: PluginLogger;
}
```

---

## Storage API

```typescript
interface PluginStorage {
  // Key-value (SQLite: ~/.config/todoist-cli/plugins/<name>/data/data.db)
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;

  // Привязка к задаче (локально, ключ = taskId)
  getTaskData<T>(taskId: string, key: string): Promise<T | null>;
  setTaskData<T>(taskId: string, key: string, value: T): Promise<void>;

  // Синхронизация через Todoist (пишет в комментарии к задаче)
  syncToComment?(taskId: string, data: Record<string, unknown>): Promise<void>;
  readFromComment?(taskId: string): Promise<Record<string, unknown> | null>;
}
```

Плагин выбирает: хранить локально (быстро, оффлайн) или синхронизировать через комментарии (доступно на всех устройствах).

---

## Система событий (Event Hooks)

### Расширение существующих команд

Вместо декорирования существующих Commander-команд (хрупко, не работает в TUI), используется система событий. Плагин подписывается на события задач и реагирует на них.

### Доступные события

```
task.creating    → до создания (можно модифицировать параметры)
task.created     → после создания
task.completing  → до завершения
task.completed   → после завершения
task.updating    → до обновления (доступ к старым и новым значениям)
task.updated     → после обновления
task.deleting    → до удаления
task.deleted     → после удаления
```

Хуки `*.ing` (before) — могут модифицировать данные или отменить операцию.
Хуки `*.ed` (after) — только реагируют.

### HookRegistry API

```typescript
interface HookRegistry {
  // Before-хуки: могут модифицировать или отменить
  on(event: 'task.creating', handler: (ctx: {
    params: CreateTaskParams;
    modify: (changes: Partial<CreateTaskParams>) => void;
    cancel: (reason: string) => void;
  }) => Promise<void>): void;

  // After-хуки: только реагируют
  on(event: 'task.created', handler: (ctx: {
    task: Task;
  }) => Promise<{ message?: string } | void>): void;

  on(event: 'task.completing', handler: (ctx: {
    task: Task;
    cancel: (reason: string) => void;
  }) => Promise<{ message?: string } | void>): void;

  on(event: 'task.completed', handler: (ctx: {
    task: Task;
  }) => Promise<{ message?: string } | void>): void;

  on(event: 'task.updating', handler: (ctx: {
    task: Task;
    changes: Partial<UpdateTaskParams>;
    modify: (changes: Partial<UpdateTaskParams>) => void;
  }) => Promise<void>): void;

  on(event: 'task.updated', handler: (ctx: {
    task: Task;
    changes: Partial<UpdateTaskParams>;
  }) => Promise<void>): void;

  on(event: 'task.deleting', handler: (ctx: {
    task: Task;
    cancel: (reason: string) => void;
  }) => Promise<void>): void;

  on(event: 'task.deleted', handler: (ctx: {
    taskId: string;
  }) => Promise<void>): void;
}
```

### Почему не декоратор команд

| Критерий | Event hooks | Декоратор команд |
|---|---|---|
| Работает в CLI | ✓ | ✓ |
| Работает в TUI | ✓ | ✗ |
| Связанность | Слабая (события) | Сильная (Commander API) |
| Конфликты плагинов | Нет | Возможны |
| Предсказуемость | Высокая | Низкая |

---

## TUI Extension Points

### 1. Новые вьюхи

```typescript
interface ViewRegistry {
  addView(view: {
    name: string;
    label: string;
    component: React.ComponentType<PluginViewProps>;
    sidebar?: { icon: string; section: 'plugins' };
    shortcut?: string;
  }): void;
}

interface PluginViewProps {
  onBack: () => void;
  onNavigate: (view: string) => void;
  ctx: PluginContext;
  tasks: Task[];
  projects: Project[];
  labels: Label[];
}
```

### 2. Столбцы в TaskRow

```typescript
interface ExtensionRegistry {
  addTaskColumn(column: {
    id: string;
    label: string;
    width: number;
    position: 'after-priority' | 'after-due' | 'before-content';
    render: (task: Task, ctx: PluginContext) => string;
    color?: (task: Task) => string;
  }): void;
}
```

### 3. Секции в TaskDetailView

```typescript
ext.addDetailSection(section: {
  id: string;
  label: string;
  position: 'after-comments' | 'after-subtasks' | 'after-labels';
  component: React.ComponentType<{ task: Task; ctx: PluginContext }>;
}): void;
```

### 4. Команды в Command Palette

```typescript
interface PaletteRegistry {
  addCommands(commands: Array<{
    label: string;
    category: string;
    shortcut?: string;
    action: (
      ctx: PluginContext,
      currentTask: Task | null,
      navigate: (view: string) => void,
    ) => Promise<void> | void;
  }>): void;
}
```

### 5. Keybindings

```typescript
ext.addKeybinding(binding: {
  key: string;
  description: string;
  helpSection: string;        // Автоматически попадает в HelpOverlay
  action: (
    ctx: PluginContext,
    currentTask: Task | null,
  ) => Promise<{ statusMessage?: string } | void>;
}): void;
```

### Карта расширений в TUI

```
┌─────────────────────────────────────────────────┐
│ App.tsx                                         │
│  ┌──────────┐  ┌─────────────────────────────┐  │
│  │ Sidebar  │  │ TasksView                   │  │
│  │          │  │  ┌─────────────────────────┐ │  │
│  │ [плагин  │  │  │ TaskRow                 │ │  │
│  │  вьюхи]  │  │  │ [...] [столбец плагина] │ │  │
│  │          │  │  └─────────────────────────┘ │  │
│  └──────────┘  │  ┌─────────────────────────┐ │  │
│                │  │ StatusBar [плагин инфо]  │ │  │
│                │  └─────────────────────────┘ │  │
│                │  CommandPalette [+ команды]  │  │
│                │  HelpOverlay [+ хоткеи]     │  │
│                └─────────────────────────────┘  │
│  ┌─────────────────────────────────────────┐    │
│  │ TaskDetailView                          │    │
│  │  [стандартные поля]                     │    │
│  │  [секция плагина: Time Log]             │    │
│  └─────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────┐    │
│  │ PluginView: Time Report (полный экран)  │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## Жизненный цикл

### Загрузка при старте

```
todoist ui / todoist task list
        │
        ▼
   loadPlugins()
        │
        ├── Читает [plugins] из config.toml
        ├── Для каждого плагина:
        │     ├── import(pluginDir/dist/index.js)
        │     ├── Создаёт PluginContext (api, storage, config, log)
        │     ├── Вызывает plugin.onLoad(ctx)
        │     ├── plugin.registerHooks(hookRegistry)
        │     ├── plugin.registerCommands(program)        ← только CLI
        │     ├── plugin.registerViews(viewRegistry)      ← только TUI
        │     ├── plugin.registerExtensions(extRegistry)  ← только TUI
        │     └── plugin.registerPaletteCommands(palette) ← только TUI
        │
        ▼
   Приложение запущено, хуки активны
        │
        ▼
   При выходе:
        └── plugin.onUnload() для каждого плагина
```

### Изоляция ошибок

```typescript
try {
  await plugin.onLoad(ctx);
} catch (err) {
  ctx.log.error(`Plugin ${plugin.name} failed to load: ${err.message}`);
  // Плагин деактивируется, приложение работает дальше
}
```

Принцип: **ни один плагин не может сломать основное приложение**. Ошибки изолируются, плагин деактивируется с сообщением в статус-баре.

---

## Полный пример: time-tracking плагин

### Структура

```
todoist-time-tracking/
├── plugin.json
├── package.json
├── src/
│   ├── index.ts          # Точка входа
│   ├── timer.ts          # Логика таймера
│   ├── storage.ts        # Работа с данными
│   ├── cli/
│   │   └── commands.ts   # CLI: time start/stop/report
│   └── ui/
│       ├── TimeReportView.tsx   # Полноэкранная вьюха
│       ├── TimeLogSection.tsx   # Секция в TaskDetail
│       └── TimerColumn.tsx      # Столбец в TaskRow
└── dist/
    └── index.js
```

### index.ts — точка входа

```typescript
import type { TodoistPlugin, PluginContext } from 'todoist-cli/plugin';
import { registerTimeCommands } from './cli/commands';
import { TimeReportView } from './ui/TimeReportView';
import { TimeLogSection } from './ui/TimeLogSection';
import { TimerService } from './timer';

let timer: TimerService;

const plugin: TodoistPlugin = {
  name: 'time-tracking',
  version: '1.0.0',
  description: 'Track time spent on tasks',

  async onLoad(ctx: PluginContext) {
    timer = new TimerService(ctx.storage);
    await timer.restoreState();
  },

  registerCommands(program) {
    registerTimeCommands(program, timer);
  },

  registerHooks(hooks) {
    // Автостоп при завершении задачи
    hooks.on('task.completing', async ({ task }) => {
      if (await timer.isRunning(task.id)) {
        const elapsed = await timer.stop(task.id);
        return { message: `Timer stopped: ${formatDuration(elapsed)}` };
      }
    });

    // Автостоп при удалении
    hooks.on('task.deleting', async ({ task }) => {
      if (await timer.isRunning(task.id)) {
        await timer.stop(task.id);
      }
    });
  },

  registerViews(registry) {
    registry.addView({
      name: 'time-report',
      label: 'Time Report',
      component: TimeReportView,
      sidebar: { icon: '◷', section: 'plugins' },
      shortcut: 'T',
    });
  },

  registerExtensions(ext) {
    // Столбец с таймером в списке задач
    ext.addTaskColumn({
      id: 'timer',
      label: '◷',
      width: 8,
      position: 'after-priority',
      render: (task) => {
        const active = timer.isRunningSync(task.id);
        const total = timer.getTotalSync(task.id);
        if (active) return `▶ ${formatDuration(timer.getElapsedSync(task.id))}`;
        if (total > 0) return formatDuration(total);
        return '';
      },
      color: (task) => timer.isRunningSync(task.id) ? 'green' : 'dim',
    });

    // Секция в детальном виде задачи
    ext.addDetailSection({
      id: 'time-log',
      label: 'Time Log',
      position: 'after-comments',
      component: TimeLogSection,
    });

    // Хоткей
    ext.addKeybinding({
      key: 'ctrl+t',
      description: 'Start/stop timer',
      helpSection: 'Time Tracking',
      action: async (ctx, currentTask) => {
        if (!currentTask) return;
        const running = await timer.isRunning(currentTask.id);
        if (running) {
          const elapsed = await timer.stop(currentTask.id);
          return { statusMessage: `Stopped: ${formatDuration(elapsed)}` };
        } else {
          await timer.start(currentTask.id);
          return { statusMessage: `Timer started` };
        }
      },
    });
  },

  registerPaletteCommands(palette) {
    palette.addCommands([
      {
        label: 'Start Timer',
        category: 'Time Tracking',
        shortcut: 'ctrl+t',
        action: async (ctx, task) => {
          if (task) await timer.start(task.id);
        },
      },
      {
        label: 'Stop Timer',
        category: 'Time Tracking',
        action: async () => { await timer.stopActive(); },
      },
      {
        label: 'Time Report',
        category: 'Time Tracking',
        action: (_, __, navigate) => navigate('time-report'),
      },
    ]);
  },

  async onUnload() {
    await timer.persistState();
  },
};

export default plugin;
```

### cli/commands.ts

```typescript
import type { Command } from 'commander';
import type { TimerService } from '../timer';

export function registerTimeCommands(program: Command, timer: TimerService) {
  const time = program
    .command('time')
    .description('Track time on tasks');

  time
    .command('start <taskId>')
    .description('Start timer for a task')
    .action(async (taskId: string) => {
      await timer.start(taskId);
      console.log(`▶ Timer started for task ${taskId}`);
    });

  time
    .command('stop [taskId]')
    .description('Stop active timer')
    .action(async (taskId?: string) => {
      const elapsed = taskId
        ? await timer.stop(taskId)
        : await timer.stopActive();
      console.log(`⏹ Stopped: ${formatDuration(elapsed)}`);
    });

  time
    .command('status')
    .description('Show active timer')
    .action(async () => {
      const active = timer.getActive();
      if (!active) return console.log('No active timer');
      console.log(`▶ ${active.taskId} — ${formatDuration(active.elapsed)}`);
    });

  time
    .command('report')
    .description('Show time report')
    .option('--days <n>', 'Days to include', '7')
    .option('--json <fields>', 'JSON output')
    .action(async (opts) => {
      const entries = await timer.getReport(parseInt(opts.days));
      printTimeReport(entries, opts);
    });
}
```

### timer.ts

```typescript
import type { PluginStorage } from 'todoist-cli/plugin';

interface TimeEntry {
  taskId: string;
  start: number;
  end?: number;
  duration: number;
}

export class TimerService {
  private active: { taskId: string; start: number } | null = null;
  private cache = new Map<string, number>();

  constructor(private storage: PluginStorage) {}

  async start(taskId: string) {
    if (this.active) await this.stopActive();
    this.active = { taskId, start: Date.now() };
    await this.storage.set('active-timer', this.active);
  }

  async stop(taskId: string): Promise<number> {
    if (!this.active || this.active.taskId !== taskId) return 0;
    const duration = Date.now() - this.active.start;

    const entry: TimeEntry = {
      taskId,
      start: this.active.start,
      end: Date.now(),
      duration,
    };

    const entries = await this.storage.getTaskData<TimeEntry[]>(taskId, 'entries') ?? [];
    entries.push(entry);
    await this.storage.setTaskData(taskId, 'entries', entries);

    const total = entries.reduce((s, e) => s + e.duration, 0);
    await this.storage.setTaskData(taskId, 'total', total);
    this.cache.set(taskId, total);

    this.active = null;
    await this.storage.delete('active-timer');
    return duration;
  }

  async stopActive(): Promise<number> {
    if (!this.active) return 0;
    return this.stop(this.active.taskId);
  }

  async restoreState() {
    this.active = await this.storage.get('active-timer');
  }

  async persistState() {
    if (this.active) {
      await this.storage.set('active-timer', this.active);
    }
  }

  // Sync-версии для рендеринга (из кеша, без await)
  isRunningSync(taskId: string): boolean {
    return this.active?.taskId === taskId;
  }

  getTotalSync(taskId: string): number {
    return this.cache.get(taskId) ?? 0;
  }

  getElapsedSync(taskId: string): number {
    if (this.active?.taskId !== taskId) return 0;
    return Date.now() - this.active.start;
  }

  async isRunning(taskId: string): Promise<boolean> {
    return this.active?.taskId === taskId;
  }

  getActive() {
    if (!this.active) return null;
    return {
      taskId: this.active.taskId,
      elapsed: Date.now() - this.active.start,
    };
  }

  async getReport(days: number): Promise<TimeEntry[]> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const allKeys = await this.storage.list('task:');
    const entries: TimeEntry[] = [];
    for (const key of allKeys) {
      const taskEntries = await this.storage.get<TimeEntry[]>(key);
      if (taskEntries) {
        entries.push(...taskEntries.filter(e => e.start >= since));
      }
    }
    return entries.sort((a, b) => b.start - a.start);
  }
}
```

### Результат для пользователя

```bash
# Установка
todoist plugin add github:user/todoist-time-tracking

# CLI
todoist time start abc123
todoist time stop
todoist time report --days 30

# TUI — всё появляется автоматически:
# - Столбец ◷ с таймером рядом с приоритетом
# - Ctrl+T запускает/останавливает таймер
# - "Time Report" в sidebar
# - "Start Timer" / "Stop Timer" в Command Palette
# - Секция "Time Log" в деталях задачи
# - Автостоп при завершении задачи
```

---

## Архитектура — интеграция в кодовую базу

### Новые файлы

```
src/
├── plugins/
│   ├── types.ts              # TodoistPlugin, PluginContext, все registry-интерфейсы
│   ├── loader.ts             # loadPlugins() — import() + инициализация
│   ├── hook-registry.ts      # HookRegistry — EventEmitter для task events
│   ├── view-registry.ts      # ViewRegistry — коллекция плагинных вьюх
│   ├── extension-registry.ts # ExtensionRegistry — столбцы, секции, keybindings
│   ├── palette-registry.ts   # PaletteRegistry — команды для палитры
│   ├── storage.ts            # PluginStorage — SQLite wrapper (bun:sqlite)
│   └── installer.ts          # plugin add/remove — git clone, bun install
├── cli/
│   └── plugin.ts             # registerPluginCommand — todoist plugin add/list/remove
```

### Изменения в существующих файлах

| Файл | Что меняется |
|---|---|
| `src/cli/index.ts` | Вызов `loadPlugins()`, передача `program` в плагины |
| `src/ui/App.tsx` | Получение view/extension registries, передача в компоненты |
| `src/ui/views/TasksView.tsx` | Рендеринг плагинных команд в palette, keybindings |
| `src/ui/components/TaskRow.tsx` | Рендеринг плагинных столбцов |
| `src/ui/views/TaskDetailView.tsx` | Рендеринг плагинных секций |
| `src/ui/components/Sidebar.tsx` | Пункты плагинных вьюх в секции "Plugins" |
| `src/ui/components/CommandPalette.tsx` | Плагинные команды |
| `src/ui/components/HelpOverlay.tsx` | Плагинные keybindings |
| `src/api/tasks.ts` | Обёртка с эмиссией событий для hook registry |

### Обёртка API для событий

```typescript
// src/plugins/api-proxy.ts
// Оборачивает существующие API-функции, добавляя эмиссию событий

export function createProxiedApi(hookRegistry: HookRegistry) {
  return {
    tasks: {
      async createTask(params: CreateTaskParams) {
        await hookRegistry.emit('task.creating', { params });
        const task = await originalCreateTask(params);
        await hookRegistry.emit('task.created', { task });
        return task;
      },
      async closeTask(taskId: string) {
        const task = await getTask(taskId);
        await hookRegistry.emit('task.completing', { task });
        await originalCloseTask(taskId);
        await hookRegistry.emit('task.completed', { task });
      },
      // ... аналогично для update, delete
    },
  };
}
```

---

## Ограничения и принципы

1. **Плагин не может сломать приложение** — все вызовы обёрнуты в try/catch
2. **Плагин не может модифицировать core-компоненты** — только добавлять через registry
3. **Permissions явные** — при установке пользователь видит, что плагин запрашивает
4. **Storage изолирован** — каждый плагин видит только свои данные
5. **Порядок загрузки определён** — по порядку в config.toml + поле `after`
6. **Sync-рендеринг** — столбцы в TaskRow используют sync-методы (из кеша), не async
