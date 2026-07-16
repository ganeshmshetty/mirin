import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { EmbeddedMirrorView } from "./EmbeddedMirrorView";
import { scrcpyService, windowService } from "../services";

export function EmbeddedMirrorPopup() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialName = searchParams.get("name") || id || "Device Mirror";
  const [name, setName] = useState(initialName);

  if (!id) {
    return (
      <div className="h-screen w-screen bg-[#0f1012] text-slate-400 flex items-center justify-center p-4">
        Invalid device ID for mirror popup.
      </div>
    );
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      await scrcpyService.disconnectEmbeddedMirror(id).catch(() => {});
      await getCurrentWindow().destroy();
    }).then(un => unlisten = un);
    return () => {
      if (unlisten) unlisten();
    };
  }, [id]);

  return (
    <div className="h-screen w-screen bg-[#0f1012] flex flex-col overflow-hidden select-none">
      <EmbeddedMirrorView
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
      />
    </div>
  );
}
