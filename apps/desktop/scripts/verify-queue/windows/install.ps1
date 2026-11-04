# Instala o actualiza la cola en Windows. Corre como administrador (SSM o consola elevada)
# desde esta carpeta. Idempotente: una segunda vez copia archivos, rehace llaves y tareas y
# reinicia la cola. Lo que toca y cómo quitarlo: uninstall.ps1.
#
# Todo vive en $Root (D:): herramientas, código, espejos, corridas y carriles.
#   tools\   node, pnpm y rustup (stable y 1.97.1), solo lectura para los usuarios
#   queue\   server.mjs, lane.mjs, gate.mjs, idle-stop.ps1, repos.json
#   sshd\    el sshd propio de la cola, en 127.0.0.1:$SshPort (solo SYSTEM)
#   key\     la llave con que la cola entra como los usuarios de corrida (solo verify)
#   runs\ incoming\ repos\ lanes\<n>\<repo>\   el estado de server.mjs
param(
  [string]$Root = 'D:\ci',
  [int]$SshPort = 8722
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$tools = "$Root\tools"
$code = "$Root\queue"
$openssh = "$env:SystemRoot\System32\OpenSSH"
$node = "$tools\node\node.exe"
$config = Get-Content "$here\repos.json" -Raw | ConvertFrom-Json
$lanes = [int]$config.lanes

function Invoke-Native([string]$exe, [string[]]$arguments) {
  $output = & $exe @arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "$exe $($arguments -join ' '): $output" }
  $output
}

function New-Secret {
  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  "aA1!" + [Convert]::ToBase64String($bytes)
}

# Una ACL sin herencia: SYSTEM y Administrators siempre, y lo que se pida.
function Set-Folder([string]$path, [string[]]$grants, [string]$owner = 'BUILTIN\Administrators') {
  New-Item -ItemType Directory -Force $path | Out-Null
  Invoke-Native icacls.exe (@($path, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '/grant:r', '*S-1-5-32-544:(OI)(CI)F') + ($grants | ForEach-Object { '/grant:r', $_ })) | Out-Null
  Invoke-Native icacls.exe @($path, '/setowner', $owner) | Out-Null
}

# Añade una SID a un derecho de usuario (secedit); uninstall.ps1 la quita.
function Grant-Right([string]$right, [string]$sid) {
  $work = Join-Path $env:TEMP ([guid]::NewGuid())
  New-Item -ItemType Directory $work | Out-Null
  Invoke-Native secedit.exe @('/export', '/cfg', "$work\now.inf", '/areas', 'USER_RIGHTS') | Out-Null
  $line = Select-String -Path "$work\now.inf" -Pattern "^$right\s*=" | Select-Object -First 1
  $holders = if ($line) { ($line.Line -split '=', 2)[1].Trim() -split ',' | Where-Object { $_ } } else { @() }
  if ($holders -notcontains "*$sid") {
    Set-Content -Encoding Unicode "$work\new.inf" "[Unicode]`r`nUnicode=yes`r`n[Version]`r`nsignature=`"`$CHICAGO`$`"`r`nRevision=1`r`n[Privilege Rights]`r`n$right = $((@($holders) + "*$sid") -join ',')"
    Invoke-Native secedit.exe @('/configure', '/db', "$work\new.sdb", '/cfg', "$work\new.inf", '/areas', 'USER_RIGHTS', '/quiet') | Out-Null
  }
  Remove-Item -Recurse -Force $work
}

# Lo que una rama deja en el registro del usuario sobrevive a la corrida. Quedan de solo lectura para él
# (OWNER RIGHTS incluido): el AutoRun de cmd (sshd usa cmd /c sin /d), Environment (llega a node) y los
# registros de COM de su hive de Classes (un COM de HKCU respondería por WMI en el barrido).
function Set-ReadOnlyKey($key, [string]$sid) {
  $acl = New-Object Security.AccessControl.RegistrySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = [Security.AccessControl.InheritanceFlags]::ContainerInherit
  foreach ($who in 'S-1-5-18', 'S-1-5-32-544') { $acl.AddAccessRule((New-Object Security.AccessControl.RegistryAccessRule((New-Object Security.Principal.SecurityIdentifier $who), 'FullControl', $inherit, 'None', 'Allow'))) }
  foreach ($who in $sid, 'S-1-3-4') { $acl.AddAccessRule((New-Object Security.AccessControl.RegistryAccessRule((New-Object Security.Principal.SecurityIdentifier $who), 'ReadKey', $inherit, 'None', 'Allow'))) }
  $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier 'S-1-5-32-544'))
  $key.SetAccessControl($acl)
  $key.Close()
}

function Use-Hive([string]$name, [string]$file, [scriptblock]$body) {
  $loaded = Test-Path "Registry::HKEY_USERS\$name"
  $hive = if ($loaded) { $name } else { "verify-queue-$name" }
  if (-not $loaded) { Invoke-Native reg.exe @('load', "HKU\$hive", $file) | Out-Null }
  try { & $body $hive } finally {
    if (-not $loaded) {
      [gc]::Collect()
      [gc]::WaitForPendingFinalizers()
      Invoke-Native reg.exe @('unload', "HKU\$hive") | Out-Null
    }
  }
}

function Lock-UserKeys([string]$sid) {
  $profilePath = (Get-CimInstance Win32_UserProfile | Where-Object SID -eq $sid).LocalPath
  Use-Hive $sid "$profilePath\NTUSER.DAT" {
    param($hive)
    foreach ($path in 'Software\Microsoft\Command Processor', 'Environment') {
      $key = [Microsoft.Win32.Registry]::Users.CreateSubKey("$hive\$path")
      foreach ($value in 'AutoRun', 'NODE_OPTIONS') { $key.DeleteValue($value, $false) }
      Set-ReadOnlyKey $key $sid
    }
  }
  # WMI y COM necesitan escribir en la raíz de Classes: solo los registros de COM quedan de solo lectura.
  Use-Hive "${sid}_Classes" "$profilePath\AppData\Local\Microsoft\Windows\UsrClass.dat" {
    param($hive)
    $classes = [Microsoft.Win32.Registry]::Users.OpenSubKey($hive, $true)
    $acl = New-Object Security.AccessControl.RegistrySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $inherit = [Security.AccessControl.InheritanceFlags]::ContainerInherit
    foreach ($who in 'S-1-5-18', 'S-1-5-32-544', $sid) { $acl.AddAccessRule((New-Object Security.AccessControl.RegistryAccessRule((New-Object Security.Principal.SecurityIdentifier $who), 'FullControl', $inherit, 'None', 'Allow'))) }
    $classes.SetAccessControl($acl)
    foreach ($path in 'CLSID', 'Interface', 'TypeLib', 'AppID', 'Wow6432Node\CLSID', 'Wow6432Node\Interface', 'Wow6432Node\TypeLib', 'Wow6432Node\AppID') {
      $classes.DeleteSubKeyTree($path, $false)
      Set-ReadOnlyKey ($classes.CreateSubKey($path)) $sid
    }
    $classes.Close()
  }
}

if (-not (Test-Path $node) -or -not (Test-Path "$tools\node\pnpm.cmd") -or -not (Test-Path "$tools\rust\cargo\bin\rustup.exe")) {
  throw "faltan las herramientas en ${tools}: corre antes tools.ps1"
}

# Usuarios: verify corre la cola; uno por repo y carril corre el código de la rama (`<user>` en
# el carril 0, `<user>-<n>` en los demás). Ninguno es administrador ni guarda contraseña: la de
# cada uno es aleatoria; la de verify solo la guarda el Programador de tareas, que la pide.
if (-not (Get-LocalGroup verify-runners -ErrorAction SilentlyContinue)) { New-LocalGroup verify-runners -Description 'verify-queue: usuarios de corrida' | Out-Null }
$runners = foreach ($repo in $config.repos.PSObject.Properties) {
  foreach ($lane in 0..($lanes - 1)) {
    [pscustomobject]@{ Repo = $repo.Name; Lane = $lane; User = $(if ($lane -eq 0) { $repo.Value.user } else { "$($repo.Value.user)-$lane" }) }
  }
}
foreach ($name in @('verify') + $runners.User) {
  $secret = ConvertTo-SecureString (New-Secret) -AsPlainText -Force
  # La contraseña de verify solo cambia junto a su tarea, más abajo: si cambia sola, la tarea no arranca al encender.
  if (Get-LocalUser $name -ErrorAction SilentlyContinue) { if ($name -ne 'verify') { Set-LocalUser $name -Password $secret -PasswordNeverExpires $true } }
  else { New-LocalUser $name -Password $secret -PasswordNeverExpires -UserMayNotChangePassword -Description 'verify-queue' | Out-Null }
  if (-not (Get-LocalGroupMember Users -Member $name -ErrorAction SilentlyContinue)) { Add-LocalGroupMember Users -Member $name }
}
foreach ($name in $runners.User) {
  if (-not (Get-LocalGroupMember verify-runners -Member $name -ErrorAction SilentlyContinue)) { Add-LocalGroupMember verify-runners -Member $name }
}
$verifySid = (Get-LocalUser verify).SID.Value
$runnersSid = (Get-LocalGroup verify-runners).SID.Value
# La cola y la entrada son tareas de verify con contraseña: necesitan el inicio por lotes.
Grant-Right SeBatchLogonRight $verifySid
# Las cadenas crean symlinks como en Linux; sin Modo de desarrollador solo los crea quien tiene el derecho.
# La cola no sigue un symlink al leer artefactos (server.mjs, openLaneFile).
Grant-Right SeCreateSymbolicLinkPrivilege $runnersSid

# Parar lo que corre antes de copiar.
foreach ($task in 'verify-queue', 'verify-queue-gate', 'verify-queue-sshd') { Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains("$Root\") -and $_.Name -in 'node.exe', 'sshd.exe', 'cmd.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# Carpetas. verify escribe en la raíz solo `busy` e `idle-stamp`; los usuarios de corrida la
# atraviesan (Bypass traverse checking) sin listarla, leen tools, queue y los espejos, y escriben solo en su carril.
# Node hace lstat de cada carpeta del camino: con (X,RA) da EPERM. RX sin herencia deja ver los
# nombres de esta carpeta, no lo de dentro; es lo más cerca del 0711 de Linux.
$traverse = "*${runnersSid}:(RX)"
# verify crea y borra `busy` e `idle-stamp` en la raíz: (OI)(NP)M llega a los archivos de aquí, no a las subcarpetas.
Set-Folder $Root @("*${verifySid}:(RX,W)", "*${verifySid}:(OI)(NP)M", $traverse)
Set-Folder "$tools" @('*S-1-5-32-545:(OI)(CI)RX')
Set-Folder "$code" @('*S-1-5-32-545:(OI)(CI)RX')
foreach ($dir in 'runs', 'incoming', 'logs') { Set-Folder "$Root\$dir" @("*${verifySid}:(OI)(CI)M") }
Set-Folder "$Root\repos" @("*${verifySid}:(OI)(CI)M", "*${runnersSid}:(OI)(CI)RX")
Set-Folder "$Root\lanes" @("*${verifySid}:(OI)(CI)RX", $traverse)
foreach ($runner in $runners) {
  $sid = (Get-LocalUser $runner.User).SID.Value
  Set-Folder "$Root\lanes\$($runner.Lane)" @("*${verifySid}:(OI)(CI)RX", $traverse)
  Set-Folder "$Root\lanes\$($runner.Lane)\$($runner.Repo)" @("*${verifySid}:(OI)(CI)RX", "*${sid}:(OI)(CI)F") $runner.User
}
# En la raíz del volumen Users crea carpetas: un D:\node_modules de un carril lo resolvería Node desde el otro.
Invoke-Native icacls.exe @("$(Split-Path -Qualifier $Root)\", '/remove:d', "*$runnersSid") | Out-Null
Invoke-Native icacls.exe @("$(Split-Path -Qualifier $Root)\", '/deny', "*${runnersSid}:(AD,WD)") | Out-Null
if (Test-Path "$Root\tmp") { Remove-Item -Recurse -Force "$Root\tmp" }

foreach ($file in 'lane.mjs', 'gate.mjs', 'health.mjs', 'gate.json', 'idle-stop.ps1', 'repos.json') { Copy-Item -Force "$here\$file" "$code\$file" }
Copy-Item -Force "$here\..\server.mjs" "$code\server.mjs"
# El barrido del usuario de corrida, sin WMI (denegado en una sesión ssh): sweep.cs compilado aquí.
$csc = "$env:SystemRoot\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
Invoke-Native $csc @('/nologo', '/optimize+', '/target:exe', "/out:$code\sweep.exe", "$here\sweep.cs") | Out-Null

# sshd propio en loopback: el de la VM y su configuración no se tocan. Solo los usuarios de
# corrida, solo con la llave de la cola, sin TTY, reenvío ni contraseña.
Set-Folder "$Root\sshd" @()
Set-Folder "$Root\key" @("*${verifySid}:(OI)(CI)F") 'verify'
foreach ($file in "$Root\sshd\host_ed25519", "$Root\key\id_ed25519") {
  Remove-Item -Force $file, "$file.pub" -ErrorAction SilentlyContinue
  Invoke-Native "$openssh\ssh-keygen.exe" @('-q', '-t', 'ed25519', '-N', '""', '-C', 'verify-queue', '-f', $file) | Out-Null
}
# ssh-keygen deja la llave solo para quien la creó (SYSTEM); ssh exige que sea de verify y de nadie más.
Invoke-Native icacls.exe @("$Root\key\id_ed25519", '/inheritance:r', '/grant:r', "*${verifySid}:F", '/grant:r', '*S-1-5-18:F', '/grant:r', '*S-1-5-32-544:F') | Out-Null
Invoke-Native icacls.exe @("$Root\key\id_ed25519", '/setowner', 'verify') | Out-Null
$queueKey = (Get-Content "$Root\key\id_ed25519.pub").Trim()
Set-Content -Encoding ascii "$Root\sshd\authorized_keys" "from=`"127.0.0.1`",restrict $queueKey"
Set-Content -Encoding ascii "$Root\key\known_hosts" "[127.0.0.1]:$SshPort $((Get-Content "$Root\sshd\host_ed25519.pub").Trim())"
$sshdConfig = @"
Port $SshPort
ListenAddress 127.0.0.1
HostKey $($Root.Replace('\', '/'))/sshd/host_ed25519
PidFile $($Root.Replace('\', '/'))/sshd/sshd.pid
AuthorizedKeysFile $($Root.Replace('\', '/'))/sshd/authorized_keys
AllowUsers $($runners.User -join ' ')
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
AllowTcpForwarding no
AllowAgentForwarding no
PermitTTY no
X11Forwarding no
MaxStartups 30:30:60
LogLevel ERROR
"@
Set-Content -Encoding ascii "$Root\sshd\sshd_config" $sshdConfig
Invoke-Native "$openssh\sshd.exe" @('-t', '-f', "$Root\sshd\sshd_config") | Out-Null

$launcher = [ordered]@{ ssh = "$openssh\ssh.exe"; key = "$Root\key\id_ed25519"; knownHosts = "$Root\key\known_hosts"; port = $SshPort; node = $node; helper = "$code\lane.mjs" }
$launcher | ConvertTo-Json | Set-Content -Encoding ascii "$code\launcher.json"

# La cola escucha en un pipe: el firewall no filtra loopback, y un pipe con la DACL por omisión solo lo
# abren para escribir verify, SYSTEM y Administrators; ni los usuarios de corrida ni otras cuentas de la VM.
$pipe = '\\.\pipe\verify-queue'

# El arranque de la cola y de la entrada: un cmd que repite, como Restart=always.
$path = "$tools\rust\cargo\bin;$tools\node;$env:ProgramFiles\Git\cmd;$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0;$openssh"
Set-Content -Encoding ascii "$code\queue.cmd" @"
@echo off
set VERIFY_QUEUE_HOME=$Root
set VERIFY_QUEUE_CONFIG=$code\repos.json
set VERIFY_QUEUE_LAUNCHER=$code\launcher.json
set VERIFY_QUEUE_NAME=windows-x64
set VERIFY_QUEUE_PIPE=$pipe
set RUSTUP_HOME=$tools\rust\rustup
set LANG=C.UTF-8
set PATH=$path
:loop
"$node" "$code\server.mjs" >> "$Root\logs\queue.log" 2>&1
ping -n 6 127.0.0.1 >nul
goto loop
"@
Set-Content -Encoding ascii "$code\gate.cmd" @"
@echo off
:loop
"$node" "$code\gate.mjs" "$code\gate.json" >> "$Root\logs\gate.log" 2>&1
ping -n 6 127.0.0.1 >nul
goto loop
"@

# Red: la cola y los usuarios de corrida salen a internet, no a IMDS, la VPC ni la tailnet.
$denied = '10.0.0.0/8', '100.64.0.0/10', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16', 'fd00::/8', 'fe80::/10'
Remove-NetFirewallRule -Group 'verify-queue' -ErrorAction SilentlyContinue
New-NetFirewallRule -Group 'verify-queue' -DisplayName 'verify-queue: sin red interna' -Direction Outbound -Action Block -RemoteAddress $denied -LocalUser "D:(A;;CC;;;$verifySid)(A;;CC;;;$runnersSid)" | Out-Null
New-NetFirewallRule -Group 'verify-queue' -DisplayName 'verify-queue: entrada por Tailscale' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8787 -RemoteAddress 100.64.0.0/10 -InterfaceAlias Tailscale | Out-Null

# Tareas: sshd, la entrada y el apagado como SYSTEM (el pipe de tailscaled es de administradores);
# la cola como verify. Registrar S4U desde
# SYSTEM da acceso denegado: la tarea lleva la contraseña, y el Programador le da a verify el inicio por lotes.
$forever = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
$boot = New-ScheduledTaskTrigger -AtStartup
$system = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -Force -TaskName 'verify-queue-sshd' -Principal $system -Trigger $boot -Settings $forever -Action (New-ScheduledTaskAction -Execute "$openssh\sshd.exe" -Argument "-f $Root\sshd\sshd_config") | Out-Null
$verifyPassword = New-Secret
Set-LocalUser verify -Password (ConvertTo-SecureString $verifyPassword -AsPlainText -Force) -PasswordNeverExpires $true
Register-ScheduledTask -Force -TaskName 'verify-queue' -User "$env:COMPUTERNAME\verify" -Password $verifyPassword -RunLevel Limited -Trigger $boot -Settings $forever -Action (New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" -Argument "/d /c $code\queue.cmd") | Out-Null
Register-ScheduledTask -Force -TaskName 'verify-queue-gate' -Principal $system -Trigger $boot -Settings $forever -Action (New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" -Argument "/d /c $code\gate.cmd") | Out-Null
# Un apagado desactivado a mano (otra tarea usa la VM) sigue desactivado tras reinstalar.
$idleOff = (Get-ScheduledTask -TaskName 'verify-queue-idle' -ErrorAction SilentlyContinue).State -eq 'Disabled'
$minute = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
$short = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -Force -TaskName 'verify-queue-idle' -Principal $system -Trigger $minute -Settings $short -Action (New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $code\idle-stop.ps1 -Root $Root") | Out-Null
if ($idleOff) { Disable-ScheduledTask -TaskName 'verify-queue-idle' | Out-Null }

# Primero el sshd y el bloqueo del registro; la cola y la entrada arrancan con los usuarios ya cerrados.
Start-ScheduledTask -TaskName 'verify-queue-sshd'
$deadline = (Get-Date).AddSeconds(30)
while (-not (Get-NetTCPConnection -State Listen -LocalPort $SshPort -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) { Start-Sleep 1 }
$probe = Join-Path $env:TEMP ([guid]::NewGuid())
Copy-Item "$Root\key\id_ed25519" $probe
Invoke-Native icacls.exe @($probe, '/inheritance:r', '/grant:r', '*S-1-5-18:F') | Out-Null
Invoke-Native icacls.exe @($probe, '/setowner', '*S-1-5-18') | Out-Null
foreach ($runner in $runners) {
  $sid = (Get-LocalUser $runner.User).SID.Value
  # Sin perfil, una entrada que no corre nada lo crea; con perfil, se bloquea antes de entrar.
  if (-not (Get-CimInstance Win32_UserProfile | Where-Object SID -eq $sid)) {
    Invoke-Native "$openssh\ssh.exe" @('-F', 'none', '-i', $probe, '-p', "$SshPort", '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', "UserKnownHostsFile=$Root\key\known_hosts", "$($runner.User)@127.0.0.1", 'exit 0') | Out-Null
  }
  Lock-UserKeys $sid
}
Remove-Item -Force $probe

foreach ($task in 'verify-queue', 'verify-queue-gate') { Start-ScheduledTask -TaskName $task }
$deadline = (Get-Date).AddSeconds(90)
do {
  Start-Sleep 2
  $health = & $node "$code\health.mjs" $pipe 2>$null | ConvertFrom-Json
} until ($health -or (Get-Date) -gt $deadline)
if (-not $health) { Get-Content "$Root\logs\queue.log" -Tail 20 -ErrorAction SilentlyContinue; throw "la cola no responde en $pipe" }
"cola en $pipe ($($health.platform)-$($health.arch)), $lanes carriles: $($runners.User -join ', ')"
