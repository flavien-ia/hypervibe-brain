// forward.mjs - Brings the Explorer window of a folder to the front (Windows).
//
// WHY (2026-11-20). The live view's server runs in the background, and Windows
// opens BEHIND the window in use whatever a background program starts: "Open in
// the Explorer" opened the folder under the brain's own window, and the person
// saw nothing happen. This script, started beside the Explorer, waits for the
// window that shows the folder (four seconds at most) and brings it forward.
// The folder comes in the environment (HVBRAIN_OPEN_FOLDER), never in the
// text of the command: no path can be read as code.
//
// Windows only lets the program in use hand the front to another; a press of
// Alt, sent first, is the known way for a background program to be allowed.

export const BRING_FORWARD = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "$want = ([string]$env:HVBRAIN_OPEN_FOLDER).TrimEnd('\\')",
  "if (-not $want) { exit 0 }",
  "Add-Type -Namespace HvBrain -Name Win -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h, int n); [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr h); [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);'",
  "$shell = New-Object -ComObject Shell.Application",
  "for ($i = 0; $i -lt 27; $i++) {",
  "  Start-Sleep -Milliseconds 150",
  "  $w = $shell.Windows() | Where-Object { ([string]$_.Document.Folder.Self.Path).TrimEnd('\\') -ieq $want } | Select-Object -Last 1",
  "  if ($w) {",
  "    $h = [IntPtr]$w.HWND",
  "    if ([HvBrain.Win]::IsIconic($h)) { [void][HvBrain.Win]::ShowWindow($h, 9) }",
  "    [HvBrain.Win]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)",
  "    [HvBrain.Win]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)",
  "    [void][HvBrain.Win]::SetForegroundWindow($h)",
  "    if ($env:HVBRAIN_OPEN_SAY) { Start-Sleep -Milliseconds 200; Write-Output ('front=' + ([HvBrain.Win]::GetForegroundWindow() -eq $h)) }",
  "    exit 0",
  "  }",
  "}",
  "if ($env:HVBRAIN_OPEN_SAY) { Write-Output 'front=no-window' }",
].join("\n");
