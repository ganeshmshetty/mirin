import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { DeviceManager } from "./DeviceManager";
import { scrcpyService, windowService } from "../services";
import { useTranslation } from "react-i18next";

export function EmbeddedMirrorPopup() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialName = searchParams.get("name") || id || "Device Mirror";
  const [name, setName] = useState(initialName);

  const lastSizeRef = useRef({ width: 0, height: 0 });
  const isAdjustingRef = useRef(false);
  const resizeFrameRef = useRef(0);
  const pendingSizeRef = useRef<{ width: number; height: number } | undefined>(
    undefined,
  );
  const currentDimRef = useRef({ width: 0, height: 0 });

  // Update window title when name changes
  useEffect(() => {
    if (name) {
      getCurrentWindow()
        .setTitle(`${name} - Mirin`)
        .catch(() => {});
    }
  }, [name]);

  // Clean close requested handler
  useEffect(() => {
    if (!id) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        await scrcpyService.disconnectEmbeddedMirror(id).catch(() => {});
        try {
          await windowService.closeCurrentWindow();
        } catch {
          await getCurrentWindow().destroy();
        }
      })
      .then((un) => (unlisten = un));
    return () => {
      if (unlisten) unlisten();
    };
  }, [id]);

  // Dynamic aspect-ratio and monitor-aware window sizing
  const handleDimensionsChange = useCallback(
    async ({ width, height }: { width: number; height: number }) => {
      if (width <= 0 || height <= 0) return;
      if (
        currentDimRef.current.width === width &&
        currentDimRef.current.height === height
      ) {
        return;
      }
      currentDimRef.current = { width, height };

      try {
        const { getCurrentWindow, currentMonitor } = await import(
          "@tauri-apps/api/window"
        );
        const win = getCurrentWindow();
        const isLand = width > height;
        const aspect = width / height;

        const monitor = await currentMonitor();
        const factor = monitor?.scaleFactor || (await win.scaleFactor()) || 1;
        const monWidth = monitor ? monitor.size.width / factor : 1920;
        const monHeight = monitor ? monitor.size.height / factor : 1080;
        const monX = monitor ? monitor.position.x / factor : 0;
        const monY = monitor ? monitor.position.y / factor : 0;

        // Safe monitor work bounds with margins for taskbars/docks/menus
        const maxAvailableW = Math.max(300, Math.round(monWidth - 60));
        const maxAvailableH = Math.max(300, Math.round(monHeight - 90));
        const minW = 260;
        const minH = 340;

        // Toolbar dimensions:
        // Portrait: vertical right rail (~68px)
        // Landscape: bottom horizontal bar (~56px)
        const toolbarW = isLand ? 0 : 68;
        const toolbarH = isLand ? 56 : 0;

        let stageWidth = width;
        let stageHeight = height;

        if (!isLand) {
          // Portrait: prefer fitting height up to 840 or 85% of available monitor height
          const maxStageH = Math.min(
            840,
            Math.round(maxAvailableH * 0.85) - toolbarH,
          );
          stageHeight = Math.max(minH - toolbarH, Math.min(height, maxStageH));
          stageWidth = Math.round(stageHeight * aspect);
          if (stageWidth + toolbarW > maxAvailableW) {
            stageWidth = maxAvailableW - toolbarW;
            stageHeight = Math.round(stageWidth / aspect);
          }
        } else {
          // Landscape: prefer fitting width up to 1000 or 85% of available monitor width
          const maxStageW = Math.min(
            1000,
            Math.round(maxAvailableW * 0.85) - toolbarW,
          );
          stageWidth = Math.max(minW - toolbarW, Math.min(width, maxStageW));
          stageHeight = Math.round(stageWidth / aspect);
          if (stageHeight + toolbarH > maxAvailableH) {
            stageHeight = maxAvailableH - toolbarH;
            stageWidth = Math.round(stageHeight * aspect);
          }
        }

        const finalLogicalW = Math.max(
          minW,
          Math.min(maxAvailableW, Math.round(stageWidth + toolbarW)),
        );
        const finalLogicalH = Math.max(
          minH,
          Math.min(maxAvailableH, Math.round(stageHeight + toolbarH)),
        );

        // Adjust position so window doesn't overflow screen when rotating
        const currentOuterPos = await win.outerPosition();
        const curLogicalX = currentOuterPos.x / factor;
        const curLogicalY = currentOuterPos.y / factor;
        let targetX = curLogicalX;
        let targetY = curLogicalY;

        if (targetX + finalLogicalW > monX + monWidth - 10) {
          targetX = Math.max(monX + 10, monX + monWidth - finalLogicalW - 10);
        }
        if (targetY + finalLogicalH > monY + monHeight - 10) {
          targetY = Math.max(monY + 30, monY + monHeight - finalLogicalH - 10);
        }

        if (
          Math.abs(targetX - curLogicalX) > 1 ||
          Math.abs(targetY - curLogicalY) > 1
        ) {
          await win.setPosition(new LogicalPosition(targetX, targetY));
        }

        isAdjustingRef.current = true;
        try {
          await win.setMinSize(new LogicalSize(minW, minH));
          await win.setMaxSize(new LogicalSize(maxAvailableW, maxAvailableH));
          await win.setSize(new LogicalSize(finalLogicalW, finalLogicalH));
          lastSizeRef.current = await win.innerSize();
        } finally {
          isAdjustingRef.current = false;
        }
      } catch (err) {
        console.error("Failed to dynamically resize popout window:", err);
      }
    },
    [],
  );

  // Maintain aspect ratio during manual user resize
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isDisposed = false;

    const attachResizeListener = async () => {
      const win = getCurrentWindow();
      unlisten = await win.onResized(({ payload: size }) => {
        if (isDisposed || isAdjustingRef.current) return;
        pendingSizeRef.current = size;
        if (resizeFrameRef.current) return;

        resizeFrameRef.current = requestAnimationFrame(async () => {
          resizeFrameRef.current = 0;
          const requestedSize = pendingSizeRef.current;
          pendingSizeRef.current = undefined;
          if (!requestedSize || isDisposed || isAdjustingRef.current) return;

          const w = currentDimRef.current.width;
          const h = currentDimRef.current.height;
          if (w <= 0 || h <= 0) return;

          const isLand = w > h;
          const scale = await win.scaleFactor();
          const tbW = isLand ? 0 : Math.round(68 * scale);
          const tbH = isLand ? Math.round(56 * scale) : 0;
          const stgW = requestedSize.width - tbW;
          const stgH = requestedSize.height - tbH;
          if (stgW <= 0 || stgH <= 0) return;

          const targetRatio = w / h;
          const deltaW = Math.abs(
            requestedSize.width - lastSizeRef.current.width,
          );
          const deltaH = Math.abs(
            requestedSize.height - lastSizeRef.current.height,
          );
          const targetSize =
            deltaW >= deltaH
              ? new PhysicalSize(
                  requestedSize.width,
                  Math.round(stgW / targetRatio) + tbH,
                )
              : new PhysicalSize(
                  Math.round(stgH * targetRatio) + tbW,
                  requestedSize.height,
                );

          if (
            Math.abs(targetSize.width - requestedSize.width) <= 2 &&
            Math.abs(targetSize.height - requestedSize.height) <= 2
          ) {
            lastSizeRef.current = requestedSize;
            return;
          }

          isAdjustingRef.current = true;
          try {
            await win.setSize(targetSize);
            lastSizeRef.current = targetSize;
          } finally {
            isAdjustingRef.current = false;
          }
        });
      });
    };

    attachResizeListener();

    return () => {
      isDisposed = true;
      if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current);
      if (unlisten) unlisten();
    };
  }, []);

  if (!id) {
    return (
      <div className="h-screen w-screen bg-[#0f1012] text-slate-400 flex items-center justify-center p-4">
        {t("mirror.invalid_id")}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#0f1012] flex flex-col overflow-hidden select-none">
      <DeviceManager
        deviceId={id}
        deviceName={name}
        onClose={async () => {
          try {
            await windowService.closeCurrentWindow();
          } catch {
            await getCurrentWindow().close();
          }
        }}
        fillWorkspace
        isPopup
        onRename={setName}
        onDimensionsChange={handleDimensionsChange}
      />
    </div>
  );
}
