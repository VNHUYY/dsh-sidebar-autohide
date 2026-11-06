# DSH Sidebar Auto-hide

Notion-style auto-hide for the DeepSeek Harness (DSH) Web UI sidebars.

- Hover the left or right window edge to expand that sidebar.
- Move the pointer away to collapse it.
- Click a sidebar's toggle button to pin that column open (pins persist across reloads).
- A pinned right sidebar re-opens after a Session switch.
- The window chrome strip at the top (traffic lights / drag region) never triggers a collapse.
- Only applies to wide layouts (viewport >= 1024px); the shell's narrow/drawer behavior is left alone.

## Install

This package is a DSH client plugin bundle (`@local/dsh-sidebar-autohide`). Install it the same way as any local or git DSH bundle:

1. In the DSH desktop app, open **Settings -> Plugins** and install from this repository's git URL (or from a local checkout).
2. Alternatively, point your DSH profile's plugin installation flow at `https://github.com/VNHUYY/dsh-sidebar-autohide`. The install command differs between DSH versions; the Plugin Manager UI is the simplest path.

After installing, refresh the DSH window so the client bundle loads.

## How it works

The plugin has no UI of its own. It:

- injects the shell's `layout` service and reads the optional `sidebarRight` service;
- observes the shell's stable DOM state (`data-sidebar-collapsed`, `data-sidebar-right-open`) to know each column's state;
- toggles the left column through `ctx.layout.toggleSidebar()` and the right column through `ctx.sidebarRight.toggleExpanded()` (falling back to the shell's own buttons when the service is unavailable);
- intercepts the sidebar toggle buttons in the capture phase so a click pins the column instead of collapsing it.

It uses no private APIs and does not patch the shell. It does depend on the shell's data attributes (`data-sidebar-collapsed`, `data-sidebar-toggle`, `data-sidebar-right-*`, `data-dragging`, `data-window-drag`), so a future DSH release that renames them may need a matching update here.

## 中文

为 DSH Web 界面左右两侧边栏提供 Notion 式自动收起：

- 鼠标移到窗口左/右边缘时展开对应侧边栏；
- 移开后自动收起；
- 点击侧边栏按钮可固定该栏展开（固定状态会记住）；
- 固定的右侧边栏在切换会话后会自动重新展开；
- 窗口顶部（红绿灯 / 拖拽条）区域不会触发收起；
- 仅在宽屏（>= 1024px）生效，窄屏/抽屉模式保持原行为。

## License

MIT
