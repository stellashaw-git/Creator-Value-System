"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PickedFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readFilesFromInput(input: HTMLInputElement | null): File[] {
  const list = input?.files;
  if (!list || list.length === 0) return [];
  const out: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const f = list.item(i);
    if (f) out.push(f);
  }
  return out;
}

export default function UploadTestPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const [pageLoads, setPageLoads] = useState(1);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [reactChangeCount, setReactChangeCount] = useState(0);
  const [nativeChangeCount, setNativeChangeCount] = useState(0);
  const [rawInputCount, setRawInputCount] = useState(0);
  const [inputValue, setInputValue] = useState("(empty)");
  const [lastSync, setLastSync] = useState("none");
  const [logLines, setLogLines] = useState<string[]>([]);

  const pushLog = useCallback((line: string) => {
    console.log("[upload-test]", line);
    setLogLines((prev) => [...prev.slice(-8), line]);
  }, []);

  useEffect(() => {
    const count = Number(sessionStorage.getItem("reactUploadLoads") || "0") + 1;
    sessionStorage.setItem("reactUploadLoads", String(count));
    setPageLoads(count);
    pushLog(`page load #${count}`);
  }, [pushLog]);

  const applyFiles = useCallback(
    (selected: File[], source: string) => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];

      const value = inputRef.current?.value || "(empty)";
      setInputValue(value);

      if (selected.length === 0) {
        setFiles([]);
        setRawInputCount(0);
        const msg = `${source}: 0 files (value=${value})`;
        setLastSync(msg);
        pushLog(msg);
        return;
      }

      const next: PickedFile[] = selected.map((file, i) => {
        pushLog(
          `${source}: ${file.name} type=${file.type || "(empty)"} size=${file.size}`
        );
        const previewUrl = URL.createObjectURL(file);
        previewUrlsRef.current.push(previewUrl);
        return {
          id: `${file.name}-${file.size}-${file.lastModified}-${i}`,
          name: file.name,
          type: file.type || "(empty)",
          size: file.size,
          previewUrl,
        };
      });

      setFiles(next);
      setRawInputCount(selected.length);
      setLastSync(`${source}: ${selected.length} file(s)`);
    },
    [pushLog]
  );

  const syncFromInput = useCallback(
    (source: string, useAlert = false) => {
      const input = inputRef.current;
      const selected = readFilesFromInput(input);
      const value = input?.value || "(empty)";
      setInputValue(value);
      applyFiles(selected, source);
      if (useAlert) {
        window.alert(
          `Manual read\nfiles.length=${selected.length}\ninput.value=${value}`
        );
      }
    },
    [applyFiles]
  );

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const onNativeChange = () => {
      setNativeChangeCount((n) => n + 1);
      syncFromInput("native-change");
    };

    input.addEventListener("change", onNativeChange);
    input.addEventListener("input", onNativeChange);
    return () => {
      input.removeEventListener("change", onNativeChange);
      input.removeEventListener("input", onNativeChange);
    };
  }, [syncFromInput]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      pushLog("page visible again");
      window.setTimeout(() => syncFromInput("visibility"), 300);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pushLog, syncFromInput]);

  const handleReactChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setReactChangeCount((n) => n + 1);
    pushLog("react onChange fired");
    applyFiles(readFilesFromInput(event.target), "react-change");
  };

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>Upload test (React)</h1>
      <p>Minimal native file input — no custom upload UI.</p>
      <p>
        Also try pure HTML:{" "}
        <a href="/upload-test-static.html">/upload-test-static.html</a>
      </p>
      <p>
        Page loads this session: <strong>{pageLoads}</strong>
        {pageLoads > 1 ? " (page may have reloaded after picker)" : ""}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleReactChange}
        style={{ display: "block", marginTop: 16, fontSize: 16 }}
      />

      <button
        type="button"
        onClick={() => syncFromInput("manual-button", true)}
        style={{ display: "block", marginTop: 12, padding: "8px 12px", fontSize: 16 }}
      >
        Read input.files now (shows alert)
      </button>

      <p style={{ marginTop: 16 }}>
        React onChange fired: <strong>{reactChangeCount}</strong>
      </p>
      <p>
        Native change fired: <strong>{nativeChangeCount}</strong>
      </p>
      <p>
        input.files count: <strong>{rawInputCount}</strong>
      </p>
      <p>
        input.value: <strong>{inputValue}</strong>
      </p>
      <p>
        Uploaded file count: <strong>{files.length}</strong>
      </p>
      <p>
        Last sync: <strong>{lastSync}</strong>
      </p>

      {logLines.length > 0 && (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            background: "#f5f5f5",
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {logLines.join("\n")}
        </pre>
      )}

      {files.length > 0 && (
        <ul style={{ marginTop: 16, paddingLeft: 20 }}>
          {files.map((file) => (
            <li key={file.id} style={{ marginBottom: 16 }}>
              <div>{file.name}</div>
              <div>type: {file.type}</div>
              <div>size: {formatSize(file.size)}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file.previewUrl}
                alt={file.name}
                style={{ display: "block", marginTop: 8, maxWidth: 200, height: "auto" }}
              />
            </li>
          ))}
        </ul>
      )}

      <hr style={{ margin: "24px 0" }} />
      <h2>If all counts stay 0</h2>
      <ol style={{ paddingLeft: 20 }}>
        <li>
          Try <a href="/upload-test-static.html">static HTML test</a> (no React)
        </li>
        <li>
          In the picker, try <strong>Choose Files</strong> / Browse instead of Photo Library
        </li>
        <li>
          Test production mode on Mac first: <code>npm run build &amp;&amp; npm run start</code>
        </li>
        <li>Check if page load count jumps after picking (dev reload)</li>
      </ol>
    </main>
  );
}
