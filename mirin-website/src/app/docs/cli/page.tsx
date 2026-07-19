"use client";
import React, { useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";

export default function CliReferencePage() {
  const [copiedText, setCopiedText] = useState("");

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(""), 2000);
  };

  return (
    <>
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold text-text-primary tracking-tight">
          CLI Reference
        </h1>
        <p className="text-lg text-text-muted leading-relaxed">
          Gemini CLI provides a command-line interface named{" "}
          <code className="text-accent bg-accent-soft px-1.5 py-0.5 rounded text-sm">
            mirin-cli
          </code>{" "}
          to interact with Android devices and run integration services.
        </p>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">
          Subcommands
        </h2>
        <p className="text-text-muted leading-relaxed">
          The binary exposes specific subcommands to list devices or start the
          communication server.
        </p>

        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-xl font-medium text-text-primary flex items-center gap-2">
              <Terminal size={18} className="text-accent" /> Devices Command
            </h3>
            <p className="text-sm text-text-muted">
              Queries the Android Debug Bridge (ADB) to retrieve all connected
              devices and returns a formatted JSON array containing the serial
              numbers, connection types, and authorization status.
            </p>
            <div className="flex justify-between items-center bg-page-bg-alt border border-border rounded-lg pl-4 pr-2 py-2 text-sm font-mono text-text-muted">
              <span>cargo run --bin mirin-cli devices</span>
              <button
                onClick={() =>
                  handleCopy("cargo run --bin mirin-cli devices", "devices")
                }
                className="p-1.5 hover:bg-border rounded text-text-primary transition-colors"
              >
                {copiedText === "devices" ? (
                  <Check size={14} className="text-accent" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl font-medium text-text-primary flex items-center gap-2">
              <Terminal size={18} className="text-accent" /> MCP Command
            </h3>
            <p className="text-sm text-text-muted">
              Starts the Model Context Protocol (MCP) server, which lets AI
              agents interact with connected Android devices. The server can
              communicate over standard input and output channels or a local
              network socket.
            </p>
            <div className="flex justify-between items-center bg-page-bg-alt border border-border rounded-lg pl-4 pr-2 py-2 text-sm font-mono text-text-muted">
              <span>cargo run --bin mirin-cli mcp</span>
              <button
                onClick={() =>
                  handleCopy("cargo run --bin mirin-cli mcp", "mcp")
                }
                className="p-1.5 hover:bg-border rounded text-text-primary transition-colors"
              >
                {copiedText === "mcp" ? (
                  <Check size={14} className="text-accent" />
                ) : (
                  <Copy size={14} />
                )}
              </button>
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium text-text-primary">Options:</p>
              <ul className="text-sm text-text-muted space-y-2 list-disc pl-5">
                <li>
                  <code className="text-xs bg-page-bg px-1 rounded">
                    --transport
                  </code>
                  : Specifies the communication channel. You must choose either{" "}
                  <code className="text-xs bg-page-bg px-1 rounded">stdio</code>{" "}
                  or{" "}
                  <code className="text-xs bg-page-bg px-1 rounded">http</code>.
                  The default value is{" "}
                  <code className="text-xs bg-page-bg px-1 rounded">stdio</code>
                  .
                </li>
                <li>
                  <code className="text-xs bg-page-bg px-1 rounded">
                    --listen
                  </code>
                  : Specifies the network address and port when using the{" "}
                  <code className="text-xs bg-page-bg px-1 rounded">http</code>{" "}
                  transport. The default value is{" "}
                  <code className="text-xs bg-page-bg px-1 rounded">
                    127.0.0.1:7270
                  </code>
                  .
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
