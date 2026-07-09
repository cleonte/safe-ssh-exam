# TypeScript 7 Migration Guide

Analysis of what would be required to migrate this codebase from TypeScript 5.x to **TypeScript 7**.

TypeScript 7 is Microsoft's upcoming native Go-port rewrite of the compiler. Beyond a ~10× speed boost, it introduces **breaking behavioral changes** across three categories.

---

## 1. `package.json` — Dependency Updates

| Package | Current | Required | Why |
|---|---|---|---|
| `typescript` | `^5.9.3` | `^7.0.0` | The upgrade itself |
| `ts-node` | `^10.9.2` | Replace with `tsx` or `ts-node ^11` | `ts-node` 10 does not support TS 7's module resolution changes |
| `@types/node` | `^25.3.3` | Keep, but re-verify peer compat | Minor risk |
| `electron` | `^28.0.0` | Consider `^33+` | TS 7 + Electron's bundled Node type alignment |

---

## 2. `tsconfig.json` — Configuration Overhaul

TS 7 changes several defaults and deprecates options:

```jsonc
// REMOVE or CHANGE:
"moduleResolution": "node"          // Deprecated → must be "node16", "nodenext", or "bundler"
"strict": false                     // TS 7 sets this to true by default
"noImplicitAny": false              // TS 7 enables this by default
"strictNullChecks": false           // TS 7 enables this by default
"noImplicitThis": false             // TS 7 enables this by default

// ADD:
"verbatimModuleSyntax": true        // Enforces import type for type-only imports
"isolatedModules": true             // Required for native TS 7 stripping/erasure model
"moduleResolution": "node16"        // Or "bundler" for Electron's bundling context
```

---

## 3. `src/types.ts` — Replace `any` with Proper Types

The `Tab` interface uses `any` for four fields. With `noImplicitAny: true` (now default), these need real types:

```ts
// BEFORE (currently):
terminal: any;   // xterm Terminal type
sshClient: any;  // ssh2 Client type
sshStream: any;  // ssh2 Stream type
fitAddon: any;   // FitAddon type

// AFTER — import and use the real types:
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { Client, ClientChannel } from 'ssh2';

terminal: Terminal;
sshClient: Client | null;
sshStream: ClientChannel | null;
fitAddon: FitAddon;
```

---

## 4. `src/preload.ts` — `import type` Enforcement

With `verbatimModuleSyntax: true`, imports used **only as types** must use `import type`.
The current import of `ExamAPI` and `ExamConfig` are type-only:

```ts
// BEFORE:
import { ipcRenderer } from 'electron';
import { ExamAPI, ExamConfig } from './types';

// AFTER:
import { ipcRenderer } from 'electron';
import type { ExamAPI, ExamConfig } from './types';  // type-only → must use import type
```

Additionally, `(window as any).examAPI` and `(window as any).examConfig` can remain valid
syntactically, but `strict` mode will flag them in stricter lint setups.

---

## 5. `src/main.ts` — Type-Only Import Fix

Same `verbatimModuleSyntax` concern:

```ts
// BEFORE:
import { ExamConfig } from './types';

// AFTER:
import type { ExamConfig } from './types';  // only used as a type
```

---

## 6. `src/renderer.ts` — The Largest Change (Implicit `any` Parameters)

This is where the most work is. With `noImplicitAny: true` and `strict: true`,
**all untyped function parameters become errors**. These functions need explicit type annotations:

| Function | Missing Types |
|---|---|
| `createTabElement(tab)` | `tab: Tab` |
| `connectTabSSH(tab, isFirstTab)` | `tab: Tab, isFirstTab: boolean` |
| `switchTab(tabId)` | `tabId: number` |
| `handleCloseTab(tabId)` | `tabId: number` |
| `closeTab(tabId)` | `tabId: number` |
| `updateStatus(status, text)` | `status: string, text: string` |
| `showError(message)` | `message: string` |
| `updateTimer(remainingSeconds)` | `remainingSeconds: number` |
| `showWarning(message)` | `message: string` |
| `handleSessionEnd(reason)` | `reason: string` |
| `createTab(isFirstTab = false)` | `isFirstTab: boolean = false` |
| `setupKeyboardShortcuts()` | Return type `: void` |
| `getActiveTab()` | Return type `: Tab \| undefined` |

---

## 7. `src/renderer.ts` — `strictNullChecks` Cascade

With `strictNullChecks: true` (now default), every bare `document.getElementById(...)` returns
`HTMLElement | null`, causing errors on direct `.classList` / `.textContent` / `.focus()` access.
There are **~18 unguarded calls** like:

```ts
// BEFORE (currently — these will error under strictNullChecks):
document.getElementById('connection-error').classList.add('hidden');
document.getElementById('tab-bar').classList.remove('hidden');
document.getElementById('terminals-area').appendChild(containerElement);
document.getElementById('tabs-container');           // null-unsafe
document.getElementById('status-indicator');         // null-unsafe
document.getElementById('time-remaining').textContent = timeString;
document.getElementById('admin-dialog').classList.remove('hidden');
document.getElementById('admin-password').focus();
// ... 10 more

// AFTER — use the existing getElement() helper consistently:
getElement('connection-error').classList.add('hidden');
getElement('tab-bar').classList.remove('hidden');
// or add non-null assertions where element existence is guaranteed:
document.getElementById('...')!
```

The project already has `getElement()`, `getInputElement()`, `getSelectElement()`, and
`getButtonElement()` helpers — they just need to be used **consistently** instead of raw
`document.getElementById`.

---

## 8. `src/renderer.ts` — `connectionInfo` Null Safety

```ts
// Line 605 — connectionInfo could be null (declared as `| null`):
updateStatus('connected', `Connected to ${connectionInfo.hostInfo.host}`);
//                                         ^ TS error: connectionInfo is possibly null

// Fix: add a null guard
if (connectionInfo) {
  updateStatus('connected', `Connected to ${connectionInfo.hostInfo.host}`);
}
```

---

## Summary of Impact by File

| File | Effort | Main Issues |
|---|---|---|
| `package.json` | Low | 2 dependency version bumps, 1 replacement (`ts-node` → `tsx`) |
| `tsconfig.json` | Low | ~5 option changes |
| `src/types.ts` | Medium | Replace 4× `any` with real types, add `import type` |
| `src/preload.ts` | Low | Change 1 import to `import type` |
| `src/main.ts` | Low | Change 1 import to `import type` |
| `src/renderer.ts` | **High** | ~11 untyped function signatures, ~18 null-unsafe DOM calls, 1 null-unsafe variable access |

The **renderer.ts** file carries the bulk of the migration effort, almost entirely due to the
project's current opt-out of `strictNullChecks` and `noImplicitAny`, both of which TypeScript 7
enforces by default.
