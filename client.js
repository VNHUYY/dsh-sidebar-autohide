window.__ModuleLoader__.load({
  id: '@local/dsh-sidebar-autohide',
  factory(require) {
    // Tuning. Only the wide (non-narrow, non-drawer) layout is touched so the
    // shell's own drawer/narrow behavior is left alone.
    const EDGE_PX = 12; // window-edge hot zone for both columns
    const COOLDOWN_MS = 320; // ignore auto-toggles while a column slide/settle runs
    const MIN_VIEWPORT = 1024; // SIDEBAR_AUTO_COLLAPSE breakpoint used by ui-layout
    // Window chrome strip at the top (traffic lights / drag region, ~48px).
    // Moving there must never read as "left the sidebar".
    const TOP_GUARD = 56;
    const LEFT_LOCK_KEY = 'dsh.sidebar.locked';
    const RIGHT_LOCK_KEY = 'dsh.rightbar.locked';

    // ---------- left column ----------
    // The shell owns the truth: the frame carries `data-sidebar-collapsed`
    // exactly while the column is collapsed (a stable data attribute).
    function isLeftCollapsed() {
      return document.querySelector('[data-sidebar-collapsed]') != null;
    }

    // Right edge (viewport px) of the left sidebar column. Walks up from the
    // stable toggle button to the column that is a direct child of the grid frame.
    function leftRightEdge() {
      const toggle = document.querySelector('[data-sidebar-toggle]');
      if (!toggle) return 0;
      let node = toggle.parentElement;
      while (node) {
        const parent = node.parentElement;
        if (parent && parent.style && parent.style.gridTemplateColumns) {
          return node.getBoundingClientRect().right;
        }
        node = parent;
      }
      return 0;
    }

    // ---------- right column ----------
    // The right column's expanded state is per-Session and lives in its own
    // store; the shell exposes it through the optional `sidebarRight` service.
    // Read it lazily at call time so ordering never matters, and fall back to
    // the panel's stable data attributes if the service is unavailable.
    function sidebarRight(ctx) {
      try {
        const sr = ctx.get('sidebarRight');
        return sr && typeof sr.isExpanded === 'function' && typeof sr.toggleExpanded === 'function'
          ? sr
          : undefined;
      } catch {
        return undefined;
      }
    }

    function activeRightPanel() {
      return document.querySelector('[data-sidebar-right-session]:not([hidden]) [data-sidebar-right-panel]');
    }

    function isRightExpanded(sr) {
      if (sr) {
        try {
          return sr.isExpanded();
        } catch {}
      }
      const panel = activeRightPanel();
      return panel != null && panel.hasAttribute('data-sidebar-right-open');
    }

    function setRightExpanded(sr, expand) {
      if (isRightExpanded(sr) === expand) return;
      if (sr) {
        try {
          sr.toggleExpanded();
        } catch {}
        return;
      }
      if (expand) {
        const button = [...document.querySelectorAll('[data-sidebar-right-expand]')].find(
          (el) => el.getClientRects().length > 0,
        );
        button?.click();
      } else {
        activeRightPanel()?.querySelector('[data-sidebar-right-toggle]')?.click();
      }
    }

    return {
      inject: ['layout'],
      apply(ctx) {
        let leftLocked = false;
        let rightLocked = false;
        try {
          leftLocked = window.localStorage.getItem(LEFT_LOCK_KEY) === '1';
        } catch {}
        try {
          rightLocked = window.localStorage.getItem(RIGHT_LOCK_KEY) === '1';
        } catch {}

        ctx.effect(() => {
          let leftCoolUntil = 0;
          let rightCoolUntil = 0;
          let retryTimer;
          const coolLeft = () => { leftCoolUntil = Date.now() + COOLDOWN_MS; };
          const coolRight = () => { rightCoolUntil = Date.now() + COOLDOWN_MS; };
          const wide = () => window.innerWidth >= MIN_VIEWPORT;
          const leftReady = () => document.querySelector('[data-sidebar-toggle]') != null;
          const dragging = () => document.querySelector('[data-dragging]') != null;

          // Clicking a sidebar button pins/unpins that column's expanded state.
          // Capture phase + stopPropagation keeps the shell's native toggle from
          // flipping the column a second time.
          const onClick = (event) => {
            if (!wide()) return;
            const target = event.target;
            if (!(target instanceof Element)) return;

            if (target.closest('[data-sidebar-toggle], [data-sidebar-opener]')) {
              event.preventDefault();
              event.stopPropagation();
              leftLocked = !leftLocked;
              try { window.localStorage.setItem(LEFT_LOCK_KEY, leftLocked ? '1' : '0'); } catch {}
              if (leftLocked) {
                if (isLeftCollapsed()) { coolLeft(); ctx.layout.toggleSidebar(); }
              } else if (!isLeftCollapsed()) {
                coolLeft(); ctx.layout.toggleSidebar();
              }
              return;
            }

            if (!target.closest('[data-sidebar-right-expand], [data-sidebar-right-toggle]')) return;
            if (!event.isTrusted) return; // our own programmatic clicks must reach React
            event.preventDefault();
            event.stopPropagation();
            rightLocked = !rightLocked;
            try { window.localStorage.setItem(RIGHT_LOCK_KEY, rightLocked ? '1' : '0'); } catch {}
            coolRight();
            setRightExpanded(sidebarRight(ctx), rightLocked);
          };

          // Hover expand on an edge; hover leave collapse.
          const onPointerMove = (event) => {
            if (!wide()) return;
            if (dragging()) return;
            if (event.target instanceof Element && event.target.closest('[data-side="sidebar"], [data-side="rightbar"], [data-window-drag]')) return;
            const now = Date.now();
            // The window chrome strip (traffic lights / drag area) must not
            // count as leaving a column. Expand still works there; only the
            // collapse decisions below are gated.
            const belowChrome = event.clientY >= TOP_GUARD;

            if (!leftLocked && leftReady() && now >= leftCoolUntil) {
              if (isLeftCollapsed()) {
                if (event.clientX <= Math.max(EDGE_PX, leftRightEdge())) {
                  coolLeft();
                  ctx.layout.toggleSidebar();
                }
              } else if (belowChrome && event.clientX > leftRightEdge()) {
                coolLeft();
                ctx.layout.toggleSidebar();
              }
            }

            if (now < rightCoolUntil) return;
            const sr = sidebarRight(ctx);
            if (isRightExpanded(sr)) {
              if (rightLocked) return;
              const panel = activeRightPanel();
              if (panel == null || panel.dataset.sidebarRightPanel === 'fullscreen') return;
              const rect = panel.getBoundingClientRect();
              if (belowChrome && event.clientX < rect.left - 4) {
                coolRight();
                setRightExpanded(sr, false);
              }
            } else if (event.clientX >= window.innerWidth - EDGE_PX) {
              coolRight();
              setRightExpanded(sr, true);
            }
          };

          // Leaving the window collapses both unpinned columns. Some shells
          // synthesize a leave when the pointer crosses the window chrome
          // (traffic lights / drag strip): those report coordinates inside the
          // viewport or at the very top, so only a genuine exit counts.
          const onMouseLeave = (event) => {
            if (!wide()) return;
            if (dragging()) return;
            const x = Number(event?.clientX);
            const y = Number(event?.clientY);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (y < TOP_GUARD) return;
            if (x >= 0 && x <= window.innerWidth && y <= window.innerHeight) return;
            const now = Date.now();
            if (!leftLocked && leftReady() && now >= leftCoolUntil && !isLeftCollapsed()) {
              coolLeft();
              ctx.layout.toggleSidebar();
            }
            if (!rightLocked && now >= rightCoolUntil && isRightExpanded(sidebarRight(ctx))) {
              coolRight();
              setRightExpanded(sidebarRight(ctx), false);
            }
          };

          // While pinned, re-open the right column after a Session switch
          // (its per-Session layout may restore collapsed).
          const ensurePinnedRight = () => {
            if (!rightLocked || !wide()) return;
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(() => {
              if (!rightLocked || !wide()) return;
              if (!isRightExpanded(sidebarRight(ctx))) setRightExpanded(sidebarRight(ctx), true);
            }, 60);
          };
          const observer = new MutationObserver(ensurePinnedRight);
          observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['hidden'] });

          document.addEventListener('click', onClick, true);
          document.addEventListener('pointermove', onPointerMove, true);
          document.documentElement.addEventListener('mouseleave', onMouseLeave);

          // Pinned at load → open the columns once the shell mounts.
          const timer = window.setTimeout(() => {
            if (leftLocked && wide() && leftReady() && isLeftCollapsed()) {
              coolLeft();
              ctx.layout.toggleSidebar();
            }
            if (rightLocked && wide()) setRightExpanded(sidebarRight(ctx), true);
          }, 150);

          return () => {
            window.clearTimeout(timer);
            window.clearTimeout(retryTimer);
            observer.disconnect();
            document.removeEventListener('click', onClick, true);
            document.removeEventListener('pointermove', onPointerMove, true);
            document.documentElement.removeEventListener('mouseleave', onMouseLeave);
          };
        });
      },
    };
  },
});
