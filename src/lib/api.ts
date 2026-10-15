export class ApiError extends Error {}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...init, headers });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : null;
  if (!response.ok) {
    throw new ApiError(body?.error || "The request could not be completed.");
  }
  return body as T;
}

export function uploadFile(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ run: import("./client-run").ClientRun }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.timeout = 120_000;
    xhr.onload = () => {
      let body: { error?: string; run?: unknown } = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        reject(new ApiError("Upload failed. The server returned an unexpected response."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as { run: import("./client-run").ClientRun });
      else reject(new ApiError(body.error || "Upload failed."));
    };
    xhr.onerror = () => reject(new ApiError("Upload failed. Check the connection and try again."));
    xhr.ontimeout = () =>
      reject(new ApiError("Upload timed out while processing the template. Try a smaller file or try again."));
    const data = new FormData();
    data.set("file", file);
    xhr.send(data);
  });
}
