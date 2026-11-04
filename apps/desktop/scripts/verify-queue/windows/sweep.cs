// El barrido del usuario de corrida en Windows: `sweep.exe <pid>` mata los procesos de este usuario
// salvo `<pid>` y sus antecesores, y sale con 0 si no queda ninguno. En una sesión ssh WMI está
// denegado (tasklist incluido): se listan con Toolhelp32 y el dueño sale del token de cada proceso.
// install.ps1 lo compila con el csc de .NET Framework en $Root\queue, de solo lectura para la rama.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;

static class Sweep {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct Entry {
    public uint Size, Usage, Pid;
    public IntPtr Heap;
    public uint Module, Threads, Parent;
    public int Priority;
    public uint Flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Exe;
  }

  [DllImport("kernel32", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
  [DllImport("kernel32", CharSet = CharSet.Unicode)] static extern bool Process32FirstW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32", CharSet = CharSet.Unicode)] static extern bool Process32NextW(IntPtr snapshot, ref Entry entry);
  [DllImport("kernel32")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32")] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32")] static extern uint SetSecurityInfo(IntPtr handle, int type, uint info, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);

  const uint QueryLimited = 0x1000, Terminate = 0x0001, TokenQuery = 0x0008, WriteDac = 0x40000;

  static Dictionary<uint, Entry> Snapshot() {
    var all = new Dictionary<uint, Entry>();
    IntPtr snapshot = CreateToolhelp32Snapshot(0x2, 0);
    if (snapshot == new IntPtr(-1)) throw new Exception("CreateToolhelp32Snapshot: " + Marshal.GetLastWin32Error());
    try {
      var entry = new Entry { Size = (uint)Marshal.SizeOf(typeof(Entry)) };
      for (bool more = Process32FirstW(snapshot, ref entry); more; more = Process32NextW(snapshot, ref entry)) all[entry.Pid] = entry;
    } finally { CloseHandle(snapshot); }
    return all;
  }

  // null si no se puede abrir: los de otros usuarios y SYSTEM no se abren para leer su token.
  static string Owner(uint pid) {
    IntPtr process = OpenProcess(QueryLimited, false, pid);
    if (process == IntPtr.Zero) return null;
    try {
      IntPtr token;
      if (!OpenProcessToken(process, TokenQuery, out token)) return null;
      try { using (var identity = new WindowsIdentity(token)) return identity.User.Value; } finally { CloseHandle(token); }
    } finally { CloseHandle(process); }
  }

  // Un proceso de la rama puede quitarse su DACL; su dueño conserva WRITE_DAC, que nadie más tiene.
  static bool Hidden(uint pid) {
    IntPtr probe = OpenProcess(QueryLimited, false, pid);
    if (probe != IntPtr.Zero) { CloseHandle(probe); return false; }
    IntPtr process = OpenProcess(WriteDac, false, pid);
    if (process == IntPtr.Zero) return false;
    CloseHandle(process);
    return true;
  }

  // DACL nula sobre un proceso propio que se cerró: lo vuelve a dejar terminar.
  static void Reopen(uint pid) {
    IntPtr process = OpenProcess(WriteDac, false, pid);
    if (process == IntPtr.Zero) return;
    SetSecurityInfo(process, 6, 4, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
    CloseHandle(process);
  }

  static List<uint> Others(uint caller, string me) {
    var all = Snapshot();
    var chain = new HashSet<uint> { (uint)System.Diagnostics.Process.GetCurrentProcess().Id };
    for (uint pid = caller; pid != 0 && all.ContainsKey(pid) && chain.Add(pid); pid = all[pid].Parent) { }
    var left = new List<uint>();
    foreach (var entry in all.Values) {
      if (chain.Contains(entry.Pid)) continue;
      // El conhost de la cadena es de la sesión ssh: matarlo corta la respuesta.
      if (string.Equals(entry.Exe, "conhost.exe", StringComparison.OrdinalIgnoreCase) && chain.Contains(entry.Parent)) continue;
      if (Owner(entry.Pid) == me || Hidden(entry.Pid)) left.Add(entry.Pid);
    }
    return left;
  }

  static int Main(string[] args) {
    uint caller;
    if (args.Length != 1 || !uint.TryParse(args[0], out caller)) { Console.Error.WriteLine("uso: sweep.exe <pid>"); return 2; }
    string me = WindowsIdentity.GetCurrent().User.Value;
    try {
      for (int round = 0; round < 10; round++) {
        var left = Others(caller, me);
        if (left.Count == 0) return 0;
        foreach (uint pid in left) {
          IntPtr process = OpenProcess(Terminate, false, pid);
          if (process == IntPtr.Zero) { Reopen(pid); process = OpenProcess(Terminate, false, pid); }
          if (process == IntPtr.Zero) continue;
          TerminateProcess(process, 137);
          CloseHandle(process);
        }
        System.Threading.Thread.Sleep(200);
      }
      var rest = Others(caller, me);
      if (rest.Count > 0) Console.Error.WriteLine("quedan: " + string.Join(", ", rest));
      return rest.Count == 0 ? 0 : 1;
    } catch (Exception error) {
      Console.Error.WriteLine("sin barrido: " + error.Message);
      return 1;
    }
  }
}
