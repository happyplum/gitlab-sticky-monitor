import { getCurrentWindow } from "@tauri-apps/api/window";
import { ManagerWindow } from "./windows/ManagerWindow";
import { StickyNote } from "./windows/StickyNote";

function App() {
  const params = new URLSearchParams(window.location.search);
  const label = getCurrentWindow().label;
  return params.get("window") === "note" || label.startsWith("note-")
    ? <StickyNote noteId={params.get("noteId") || label} />
    : <ManagerWindow />;
}

export default App;
