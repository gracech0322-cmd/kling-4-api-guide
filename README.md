# Kling 4.0 API guide: Generate a video without writing code

Run a ready-made Node.js script to turn ten keyframe images into a 10-second, 720p video. No coding experience is needed: download the project, add your API key, and run two commands in VS Code.

This example uses [SeeGen AI](https://seegen.ai/?utm_source=githubkling) (sign up and join Discord can get 200 credits to test Kling 4.0) as the API provider. Its endpoints, authentication, request fields, and billing rules are provider-specific.

The script uploads the images, waits for asset review, submits the video request, checks progress, and downloads the finished MP4. The sample images and prompt are included.

## Watch the result

These ten reference images and the included prompt were used to generate the 10-second dance video below with Kling 4.0, using the multi-keyframe workflow at 720p.

[![Animated preview of the five-performer dance video](assets/demo-preview.gif)](assets/demo.mp4)

**[Open or download the final video with sound](assets/demo.mp4)**

The animated preview is silent. The MP4 includes the generated audio. This is a sample result; your own run may produce a different video.

## The 10 keyframe images

The script reads the images in filename order. Image1 is the first frame, Image10 is the last frame, and Image2 through Image9 are middle frames. Click any preview to open the full-size image.

| Keyframe | Keyframe |
| --- | --- |
| **Image1 — Groove entry**<br>[![Keyframe 1: Groove entry](assets/keyframes/01-groove-entry.jpg)](multi-keyframe/01-groove-entry.png) | **Image2 — Face hook**<br>[![Keyframe 2: Face hook](assets/keyframes/02-face-hook.jpg)](multi-keyframe/02-face-hook.png) |
| **Image3 — Chest hit and step**<br>[![Keyframe 3: Chest hit and step](assets/keyframes/03-chest-hit-step.jpg)](multi-keyframe/03-chest-hit-step.png) | **Image4 — Profile pivot**<br>[![Keyframe 4: Profile pivot](assets/keyframes/04-profile-pivot.jpg)](multi-keyframe/04-profile-pivot.png) |
| **Image5 — Center exchange**<br>[![Keyframe 5: Center exchange](assets/keyframes/05-center-exchange.jpg)](multi-keyframe/05-center-exchange.png) | **Image6 — Shoulder groove**<br>[![Keyframe 6: Shoulder groove](assets/keyframes/06-shoulder-groove.jpg)](multi-keyframe/06-shoulder-groove.png) |
| **Image7 — Torso wave**<br>[![Keyframe 7: Torso wave](assets/keyframes/07-torso-wave.jpg)](multi-keyframe/07-torso-wave.png) | **Image8 — Kick-ball-change**<br>[![Keyframe 8: Kick-ball-change](assets/keyframes/08-kick-ball-change.jpg)](multi-keyframe/08-kick-ball-change.png) |
| **Image9 — Hair turn**<br>[![Keyframe 9: Hair turn](assets/keyframes/09-hair-turn.jpg)](multi-keyframe/09-hair-turn.png) | **Image10 — Relaxed ending**<br>[![Keyframe 10: Relaxed ending](assets/keyframes/10-relaxed-ending.jpg)](multi-keyframe/10-relaxed-ending.png) |

The full prompt is in [`prompt.txt`](prompt.txt).

## Watch the YouTube tutorial

Follow the video walkthrough to create an API key, open the project in VS Code, add your key, and run the script.

[![Watch the Kling 4.0 API tutorial on YouTube](https://img.youtube.com/vi/smOAddW75dg/hqdefault.jpg)](https://www.youtube.com/watch?v=smOAddW75dg)

**[Watch the step-by-step tutorial on YouTube](https://www.youtube.com/watch?v=smOAddW75dg)**

## What you need

- [Node.js](https://nodejs.org/) version 22 or later. Install a current LTS release; npm is included.
- [Visual Studio Code](https://code.visualstudio.com/).
- An API key from your [SeeGen AI account](https://seegen.ai/?utm_source=githubkling) and enough credits to generate the video. Check the [current pricing](https://seegen.ai/api-docs?utm_source=githubkling#pricing) before running it.

## Quick start

### 1. Download and open the project

On this GitHub repository, select **Code > Download ZIP**, then extract the ZIP. In VS Code, choose **File > Open Folder** and select the extracted folder that contains `package.json`.

Choose **Terminal > New Terminal**. Paste this command and press Enter:

```bash
node --version
```

The result should start with `v22` or a higher version. If the command is not found, install Node.js and restart VS Code.

This project has no additional npm dependencies, so you do not need to run `npm install`.

### 2. Add your API key

Create an API key in your provider's Account Settings. In VS Code's Explorer, create a new file named `.env` beside `package.json`.

Copy the following line into it, replace the placeholder with your own key, and save the file:

```env
API_KEY=YOUR_SEEGEN_API_KEY
```

The included `.env.example` contains the same placeholder. Your real key belongs only in your local `.env`. Keep it out of screenshots and public uploads. The project's `.gitignore` excludes `.env` from Git commits.

### 3. Keep the sample images and prompt for your first run

The `multi-keyframe` folder already contains ten numbered images. The `prompt.txt` file contains the accompanying dance instructions. You can use these files for your first generation.

To use your own images later, replace the samples with exactly ten JPG or PNG files. Keep a numeric prefix such as `01`, `02`, through `10` so their order is clear. Edit `prompt.txt` to describe the movement, camera work, and audio you want, then save it.

The first image becomes the starting frame, the last image becomes the ending frame, and the other eight are middle frames. Exactly ten images is a requirement of this example script, not every Kling workflow.

### 4. Check the project locally

In the terminal, run:

```bash
npm run check
```

The script prints the image order and request settings. It checks the image count, file sizes, PNG dimensions, and whether the prompt is empty. The API checks JPG dimensions after upload.

Look for `Local validation passed`. This command does not upload files, require an API key, or spend credits.

### 5. Generate and download your video

Run:

```bash
npm start
```

This starts a paid generation using your account credits. Leave the terminal open while the images upload and the video generates.

When the task completes, the script saves `kling-TASK_ID.mp4` in the project folder. It also saves the API response in `result.json` and the task information in `last-task.json`. These files appear after running the project and are excluded from Git commits.

## Resume a task or generate another video

If you close the terminal, run `npm start` again to resume the saved task. The script checks that task instead of submitting another generation.

To check a particular task, replace `YOUR_TASK_ID` with its ID:

```bash
npm start -- YOUR_TASK_ID
```

After changing your images or prompt, use this command when you want a new, separately charged video:

```bash
npm start -- --new
```

The script waits up to 15 minutes for generation. A local timeout does not cancel the server task. Check the saved task before starting another.

## Project files

| File or folder | Purpose |
| --- | --- |
| `generate.mjs` | Uploads images, submits a task, checks status, and downloads the video. |
| `multi-keyframe/` | Ten sample images, sorted by numeric filename. |
| `prompt.txt` | Instructions for movement, camera work, and audio. |
| `assets/` | README image previews, a silent animated preview, and the final sample MP4. |
| `package.json` | Defines the start and local-check commands. |
| `.env.example` | API key placeholder. Copy its format into your local `.env`. |
| `.gitignore` | Excludes local keys, task records, and generated videos from Git commits. |

## Troubleshooting

| Message or problem | What to do |
| --- | --- |
| `node` or `npm` is not found | Install Node.js 22 or later and restart VS Code. |
| `package.json` cannot be found | Open the extracted project folder, then create a new terminal there. |
| Missing API key | Check that `.env` is beside `package.json`, save it, and replace the placeholder. |
| Wrong image count | Keep exactly ten JPG or PNG files in `multi-keyframe/`. |
| Insufficient credits | Add enough credits before submitting the task again. |
| Upload or review failure | Read the reported reason and check the affected image. |
| Timeout or uncertain submission | Check task history and resume the existing task before using `--new`. |
| Video download failed | The completed result is saved in `result.json`. Use its video URL or query the same task again. |

## API reference

The example uses `model: "kling-4.0"`, `videoWorkflowTab: "multi-keyframe"`, `duration: "10s"`, and `outputResolution: "720p"`.

See the [multi-keyframe API documentation](https://seegen.ai/api-docs?utm_source=githubkling#kling40-multi-keyframe) for request fields and limits. The script automatically fills in uploaded image URLs; you do not need to copy them manually.

## Before publishing your own copy

Upload the source files, `.env.example`, `.gitignore`, the `multi-keyframe` folder, and the `assets` folder. The sample video in `assets/demo.mp4` is included for the tutorial. Exclude your real `.env`, new generation outputs in the project root, `last-task.json`, and `result.json`. Git ignores these files, but manual browser uploads and ZIP creation still require checking the file selection.
