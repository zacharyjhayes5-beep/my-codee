/**
 * Copy to the clipboard, wherever the app happens to be running.
 *
 * The async Clipboard API is the right path and the only one that works
 * without a visible side effect, but it is unavailable over plain http on a
 * LAN address and in a few locked-down configurations. Rather than let a copy
 * button silently do nothing there, this falls back to the old
 * hidden-textarea trick and reports honestly whether anything landed.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea */
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    // Off-screen rather than hidden: a display:none element cannot be selected.
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
