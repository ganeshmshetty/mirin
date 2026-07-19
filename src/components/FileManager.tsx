import { useState, useEffect } from "react";
import { fileService } from "../services";
import type { FileInfo } from "../types";
import {
  Folder,
  File,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  ChevronRight,
  CornerLeftUp,
  FolderPlus,
} from "lucide-react";
import { useToast } from "./ToastProvider";
import { useConfirmDialog } from "./ConfirmDialog";

interface FileManagerProps {
  deviceId: string;
}

/** Join Android paths without producing double slashes. */
function joinDevicePath(base: string, name: string): string {
  const b = base.replace(/\/+$/, "") || "";
  const n = name.replace(/^\/+/, "");
  if (!b || b === "/") return `/${n}`.replace(/\/+/g, "/");
  return `${b}/${n}`.replace(/\/+/g, "/");
}

function parentDevicePath(path: string): string {
  if (path === "/" || !path) return "/";
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join("/")}` : "/";
}

export function FileManager({ deviceId }: FileManagerProps) {
  const [currentPath, setCurrentPath] = useState("/sdcard");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();
  const { confirm } = useConfirmDialog();

  const loadFiles = async (path: string) => {
    const normalized = path.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
    setIsLoading(true);
    try {
      const list = await fileService.listFiles(deviceId, normalized);
      setFiles(list);
      setCurrentPath(normalized);
    } catch (err: any) {
      toast.error(`Failed to load directory: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles(currentPath);
  }, [deviceId]);

  const handleNavigate = (folder: string) => {
    loadFiles(joinDevicePath(currentPath, folder));
  };

  const handleNavigateUp = () => {
    if (currentPath === "/") return;
    loadFiles(parentDevicePath(currentPath));
  };

  const handleBreadcrumbClick = (index: number) => {
    const parts = currentPath.split("/").filter(Boolean);
    const newPath = "/" + parts.slice(0, index + 1).join("/");
    loadFiles(newPath);
  };

  const handlePush = async () => {
    try {
      const success = await fileService.pushFile(deviceId, currentPath);
      if (success) {
        toast.success("File uploaded successfully.");
        loadFiles(currentPath);
      }
    } catch (err: any) {
      toast.error(`Upload failed: ${err}`);
    }
  };

  const handlePull = async (file: FileInfo) => {
    try {
      const remotePath = joinDevicePath(currentPath, file.name);
      const success = await fileService.pullFile(
        deviceId,
        remotePath,
        file.name,
      );
      if (success) {
        toast.success(`Downloaded ${file.name}`);
      }
    } catch (err: any) {
      toast.error(`Download failed: ${err}`);
    }
  };

  const handleDelete = async (file: FileInfo) => {
    const confirmed = await confirm({
      title: "Delete File",
      message: `Are you sure you want to delete ${file.name}?`,
      confirmText: "Delete",
      variant: "danger",
    });

    if (!confirmed) return;

    try {
      const remotePath = joinDevicePath(currentPath, file.name);
      await fileService.deleteFile(deviceId, remotePath);
      toast.success("Deleted successfully.");
      loadFiles(currentPath);
    } catch (err: any) {
      toast.error(`Delete failed: ${err}`);
    }
  };

  const handleCreateFolder = async () => {
    // We could use a prompt dialog, but for now we'll just prompt via JS
    const folderName = window.prompt("Enter new folder name:");
    if (!folderName) return;

    try {
      const remotePath = joinDevicePath(currentPath, folderName);
      await fileService.createDirectory(deviceId, remotePath);
      toast.success("Folder created.");
      loadFiles(currentPath);
    } catch (err: any) {
      toast.error(`Failed to create folder: ${err}`);
    }
  };

  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-[#0e1012] overflow-hidden">
      {/* Toolbar */}
      <div className="flex-none p-6 pb-2">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2 ml-12">
              <Folder className="text-cyan-600 dark:text-cyan-400" />
              File Explorer
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleCreateFolder}
                className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#16191b] hover:bg-gray-50 dark:hover:bg-[#1d2327] border border-gray-200 dark:border-[#222629] rounded-xl text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors shadow-sm"
              >
                <FolderPlus size={16} />
                <span className="hidden sm:inline">New Folder</span>
              </button>
              <button
                onClick={handlePush}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20 text-white dark:text-cyan-400 border border-transparent dark:border-cyan-500/20 rounded-xl text-sm font-medium transition-colors shadow-sm"
              >
                <Upload size={16} />
                <span className="hidden sm:inline">Upload</span>
              </button>
            </div>
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-[#16191b] border border-gray-200 dark:border-[#222629] rounded-xl overflow-x-auto shadow-sm">
            <button
              onClick={() => loadFiles("/")}
              className="text-gray-500 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400 font-medium transition-colors whitespace-nowrap"
            >
              root
            </button>
            {pathParts.map((part, index) => (
              <div
                key={index}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <ChevronRight
                  size={16}
                  className="text-gray-400 dark:text-slate-600"
                />
                <button
                  onClick={() => handleBreadcrumbClick(index)}
                  className={`font-medium transition-colors ${
                    index === pathParts.length - 1
                      ? "text-gray-900 dark:text-slate-100"
                      : "text-gray-500 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
                  }`}
                >
                  {part}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-6 pt-2">
        <div className="bg-white dark:bg-[#16191b] border border-gray-200 dark:border-[#222629] rounded-xl shadow-sm overflow-hidden flex flex-col h-full min-h-[400px]">
          {/* Header Row */}
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-gray-100 dark:border-[#222629] text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider sticky top-0 bg-white/95 dark:bg-[#16191b]/95 backdrop-blur-sm z-10">
            <div className="col-span-6 sm:col-span-5">Name</div>
            <div className="col-span-3 sm:col-span-2 text-right">Size</div>
            <div className="hidden sm:block col-span-3">Modified</div>
            <div className="col-span-3 sm:col-span-2 text-right">Actions</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
                <RefreshCw className="animate-spin text-cyan-500" />
                <p>Loading files...</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-[#222629]">
                {currentPath !== "/" && (
                  <div
                    className="grid grid-cols-12 gap-4 p-4 hover:bg-gray-50 dark:hover:bg-[#1d2327] items-center cursor-pointer transition-colors group"
                    onClick={handleNavigateUp}
                  >
                    <div className="col-span-12 flex items-center gap-3">
                      <div className="text-gray-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                        <CornerLeftUp size={20} />
                      </div>
                      <span className="font-medium text-gray-600 dark:text-slate-300">
                        ..
                      </span>
                    </div>
                  </div>
                )}

                {files.map((file) => (
                  <div
                    key={file.name}
                    className="grid grid-cols-12 gap-4 p-4 hover:bg-gray-50 dark:hover:bg-[#1d2327] items-center transition-colors group"
                    onDoubleClick={() =>
                      file.is_dir && handleNavigate(file.name)
                    }
                  >
                    <div
                      className={`col-span-6 sm:col-span-5 flex items-center gap-3 min-w-0 ${file.is_dir ? "cursor-pointer" : ""}`}
                      onClick={() => file.is_dir && handleNavigate(file.name)}
                    >
                      <div
                        className={`shrink-0 ${file.is_dir ? "text-cyan-500 dark:text-cyan-400" : "text-gray-400 dark:text-slate-500"}`}
                      >
                        {file.is_dir ? (
                          <Folder
                            size={20}
                            className="fill-cyan-100 dark:fill-cyan-900/30"
                          />
                        ) : (
                          <File size={20} />
                        )}
                      </div>
                      <span
                        className="font-medium text-gray-900 dark:text-slate-200 truncate"
                        title={file.name}
                      >
                        {file.name}
                      </span>
                    </div>

                    <div className="col-span-3 sm:col-span-2 text-right text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">
                      {file.is_dir ? "--" : file.size}
                    </div>

                    <div className="hidden sm:block col-span-3 text-sm text-gray-500 dark:text-slate-400 truncate">
                      {file.modified_at}
                    </div>

                    <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!file.is_dir && (
                        <button
                          onClick={() => handlePull(file)}
                          className="p-1.5 text-gray-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg transition-colors"
                          title="Download"
                        >
                          <Download size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(file)}
                        className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {files.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-500 dark:text-slate-500">
                    <Folder size={32} className="opacity-50" />
                    <p>Folder is empty</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
