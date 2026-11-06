import { readFile, writeFile, readdir, stat, rename, access } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL, fileURLToPath } from "node:url";

const BASE_URL = "https://seegen.ai/api/v1";
const MODEL = "kling-4.0";
const POLL_INTERVAL_MS = 5000;
const WAIT_TIMEOUT_MS = 15 * 60 * 1000;
const MULTI_KEYFRAME_DIR = new URL("./multi-keyframe/", import.meta.url);
const PROMPT_FILE = new URL("./prompt.txt", import.meta.url);
const TASK_FILE = new URL("./last-task.json", import.meta.url);
const RESULT_FILE = new URL("./result.json", import.meta.url);

// Editing prompt.txt changes the choreography without changing the API code.

function apiKey() {
  const key = process.env.API_KEY?.trim() || process.env.SEEGEN_API_KEY?.trim();
  if (!key || key === "YOUR_SEEGEN_API_KEY") {
    throw new Error("Add your API_KEY to .env, then run: npm start");
  }
  return key;
}

function errorText(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${apiKey()}` },
      signal: AbortSignal.timeout(120000),
      redirect: "error",
    });
  } catch (cause) {
    throw new Error(`Network error at ${path}: ${cause.message}`);
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status}: server returned a non-JSON response.`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${errorText(data.message ?? data.error ?? data)}`);
  }
  return data;
}

export async function loadKeyframes(directory = MULTI_KEYFRAME_DIR) {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isFile() && /\.(png|jpe?g)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (names.length !== 10) {
    throw new Error(`This prompt requires exactly 10 images in multi-keyframe/. Found ${names.length}.`);
  }
  return Promise.all(names.map(async (name, index) => {
    const file = new URL(encodeURIComponent(name), directory);
    const info = await stat(file);
    if (info.size === 0 || info.size > 30 * 1024 * 1024) {
      throw new Error(`${name}: image must be non-empty and no larger than 30 MB.`);
    }
    // Inspect PNG dimensions locally before uploading. JPGs are checked by the API.
    if (/\.png$/i.test(name)) {
      const bytes = await readFile(file);
      if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
        throw new Error(`${name}: not a valid PNG file.`);
      }
      if (bytes.readUInt32BE(16) < 300 || bytes.readUInt32BE(20) < 300) {
        throw new Error(`${name}: both image dimensions must be at least 300 px.`);
      }
    }
    return {
      file,
      name,
      id: `Image${index + 1}`,
      type: index === 0 ? "first_frame" : index === names.length - 1 ? "last_frame" : "middle_frame",
    };
  }));
}

export function buildTaskRequest(media, prompt) {
  return {
    model: MODEL,
    inputs: {
      videoWorkflowTab: "multi-keyframe",
      duration: "10s",
      outputResolution: "720p",
      prompt,
      media: media.map(({ id, type, url }) => ({ id, type, url })),
      // Keyframe workflows follow the images; omit ratio and unsupported audio fields.
    },
  };
}

export async function uploadImage(frame) {
  const bytes = await readFile(frame.file);
  const form = new FormData();
  const mime = /\.png$/i.test(frame.name) ? "image/png" : "image/jpeg";
  form.append("file", new Blob([bytes], { type: mime }), frame.name);

  console.log(`Uploading ${frame.id}: ${frame.name}...`);
  let asset = await apiRequest(`/assets/upload?model=${MODEL}`, {
    method: "POST",
    body: form,
    // FormData sets Content-Type, including its multipart boundary.
  });
  const uploadedUrl = asset.url;
  const assetId = asset.assetId;
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let reviewRequested = false;
  while (true) {
    if (asset.status === "FAILED") {
      throw new Error(`${frame.name}: ${errorText(asset.failReason ?? "Upload failed")}`);
    }
    const review = asset.contentReview?.status;
    if (["BLOCK", "NEEDS_REPHRASE", "SERVICE_UNAVAILABLE"].includes(review)) {
      throw new Error(`${frame.name}: content review ${review}. Check the asset before retrying.`);
    }
    const reviewReady = review == null || ["ALLOW", "DISABLED"].includes(review);
    if (asset.status === "ACTIVE" && reviewReady) break;
    if (assetId == null || Date.now() >= deadline) {
      throw new Error(`${frame.name}: asset ${assetId ?? "unknown"} is not ready. No video was submitted.`);
    }
    if (review === "PENDING" && !reviewRequested) {
      await apiRequest("/assets/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      reviewRequested = true;
    }
    await sleep(POLL_INTERVAL_MS);
    asset = await apiRequest(`/assets/status?assetId=${encodeURIComponent(assetId)}`);
  }
  const imageUrl = asset.url ?? uploadedUrl;
  if (typeof imageUrl !== "string" || !imageUrl.startsWith("https://")) {
    throw new Error("Upload did not return an HTTPS image URL.");
  }
  console.log(`${frame.id} ready.`);
  return imageUrl;
}

export async function createTask(media, prompt) {
  const taskRequest = buildTaskRequest(media, prompt);

  console.log("Starting Kling 4.0 multi-keyframe generation: 10s, 720p, 10 keyframes.");
  console.log("This request uses account credits.");
  // Submit once. A lost response can still mean the server accepted the task.
  let task;
  try {
    task = await apiRequest("/jobs/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskRequest),
    });
  } catch (error) {
    console.error("Submission was not retried. If its outcome is unclear, check your task history before starting again.");
    throw error;
  }
  if (typeof task.taskId !== "string" || !task.taskId) {
    throw new Error("No taskId returned. Check task history before submitting again.");
  }
  return task;
}

export async function waitForResult(taskId, {
  pollIntervalMs = POLL_INTERVAL_MS,
  timeoutMs = WAIT_TIMEOUT_MS,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await apiRequest(`/jobs/queryTask?taskId=${encodeURIComponent(taskId)}`);
    console.log(`Status: ${result.status}`);
    if (result.status === "COMPLETED") {
      const videoUrl = result.output?.[0]?.url;
      if (typeof videoUrl !== "string" || !videoUrl.startsWith("https://")) {
        throw new Error("Task completed without an HTTPS video URL. Query this task again later.");
      }
      return result;
    }
    if (result.status === "FAILED") {
      throw new Error(`Generation failed: ${errorText(result.error ?? "No error details")}`);
    }
    if (!["PENDING", "QUEUED", "PROCESSING", "RUNNING", "VALIDATING"].includes(result.status)) {
      throw new Error(`Unexpected task status: ${result.status}. Keep the task ID for follow-up.`);
    }
    await sleep(pollIntervalMs);
  }
  throw new Error("Stopped waiting after the local timeout. The server task may still be running.");
}

export async function downloadVideo(result) {
  const safeId = result.taskId?.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new Error("Missing task ID for the video filename.");
  const destination = new URL(`./kling-${safeId}.mp4`, import.meta.url);
  try {
    await access(destination);
    console.log(`Video already saved: ${fileURLToPath(destination)}`);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // Download without forwarding the API key to the media host.
  const response = await fetch(result.output[0].url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Video download failed: HTTP ${response.status}. The result URL is saved in result.json.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Downloaded video was empty. Use the URL in result.json to retry.");
  const temporary = new URL(`${destination.href}.part`);
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  console.log(`Video saved: ${fileURLToPath(destination)}`);
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes("--dry-run")) {
    const frames = await loadKeyframes();
    const prompt = (await readFile(PROMPT_FILE, "utf8")).trim();
    if (!prompt) throw new Error("prompt.txt is empty.");
    for (const frame of frames) console.log(`${frame.id}: ${frame.type} <- ${frame.name}`);
    console.log(JSON.stringify(buildTaskRequest(frames.map((frame) => ({ ...frame, url: `LOCAL_ONLY/${frame.name}` })), prompt), null, 2));
    console.log("Local validation passed. No network calls, uploads, or generation charges.");
    return;
  }
  const unknown = args.find((arg) => arg.startsWith("--") && arg !== "--new");
  if (unknown) throw new Error(`Unknown option: ${unknown}`);
  apiKey();
  // A supplied ID or a saved task resumes polling without submitting a second task.
  let taskId = args.find((arg) => !arg.startsWith("--"));
  if (!taskId && !args.includes("--new")) {
    try {
      const saved = JSON.parse(await readFile(TASK_FILE, "utf8"));
      if (saved.taskId) taskId = saved.taskId;
      else if (saved.status === "SUBMITTING") {
        throw new Error("A previous submission has an unknown outcome. Check SeeGen task history, then use an existing task ID or --new.");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!taskId) {
    const frames = await loadKeyframes();
    const prompt = (await readFile(PROMPT_FILE, "utf8")).trim();
    if (!prompt) throw new Error("prompt.txt is empty.");
    console.log("Image order:");
    for (const frame of frames) console.log(`${frame.id}: ${frame.type} <- ${frame.name}`);
    const media = [];
    for (const frame of frames) {
      media.push({ id: frame.id, type: frame.type, url: await uploadImage(frame) });
    }
    await writeFile(TASK_FILE, JSON.stringify({ model: MODEL, status: "SUBMITTING", createdAt: new Date().toISOString() }, null, 2) + "\n");
    const task = await createTask(media, prompt);
    taskId = task.taskId;
    console.log(`Task ID: ${taskId}`);
    try {
      await writeFile(TASK_FILE, JSON.stringify({ ...task, model: MODEL }, null, 2) + "\n");
    } catch {
      console.warn("Could not save last-task.json. Keep the task ID shown above.");
    }
  } else {
    console.log(`Checking existing task: ${taskId}`);
  }
  console.log(`To check this task later: npm start -- ${taskId}`);
  const result = await waitForResult(taskId);
  console.log(`Final video URL: ${result.output[0].url}`);
  await writeFile(RESULT_FILE, JSON.stringify(result, null, 2) + "\n");
  console.log("Response saved to result.json. To create another video: npm start -- --new");
  await downloadVideo({ ...result, taskId });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
