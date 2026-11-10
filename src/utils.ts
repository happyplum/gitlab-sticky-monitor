import { open } from "@tauri-apps/plugin-shell";

export async function openUrl(url: string) {
  try {
    await open(url);
  } catch (e) {
    console.error("Failed to open URL:", e);
    window.open(url, "_blank");
  }
}
