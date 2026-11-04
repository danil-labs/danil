# Apaga la VM tras 20 minutos sin uso; corre cada minuto como SYSTEM (tarea verify-queue-idle).
# Cuentan una corrida o una en cola, una subida de bundle, una sesión en uso, y las sesiones,
# compilaciones, tareas programadas y comandos de SSM de menos de 2 horas: lo olvidado deja de contar.
param([string]$Root = 'D:\ci')
$idleSeconds = 1200
$capSeconds = 7200
$stamp = Join-Path $Root 'idle-stamp'
$now = Get-Date
$fresh = { param($start) $start -and ($now - $start).TotalSeconds -lt $capSeconds }

# Una corrida en cola o en marcha, aunque `busy` aún no exista o la cola se haya reiniciado.
function Test-Run {
  [bool](Get-ChildItem (Join-Path $Root 'runs') -Directory -ErrorAction SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'meta.json' } | Where-Object { Test-Path $_ } | Select-String -Pattern '"state": "(queued|running)"' -List)
}

function Test-Upload {
  [bool](Get-ChildItem (Join-Path $Root 'incoming') -Filter *.bundle -ErrorAction SilentlyContinue | Where-Object { ($now - $_.LastWriteTime).TotalMinutes -lt 15 })
}

# Compilaciones y sesiones: cargo, rustc, la cadena, el sshd hijo de cada sesión SSH, y SSM.
function Test-Process {
  $all = Get-CimInstance Win32_Process
  $names = @{}
  foreach ($p in $all) { $names[$p.ProcessId] = $p.Name }
  foreach ($p in $all) {
    $busy = $p.Name -in 'cargo.exe', 'rustc.exe', 'ssm-session-worker.exe', 'ssm-document-worker.exe' -or
      ($p.Name -eq 'node.exe' -and $p.CommandLine -match 'verify\.mjs') -or
      ($p.Name -eq 'sshd.exe' -and $names[$p.ParentProcessId] -eq 'sshd.exe')
    if ($busy -and (& $fresh $p.CreationDate)) { return $true }
  }
  $false
}

# Una sesión cuenta si es reciente o si alguien la usó en los últimos 20 minutos: la consola de QA
# lleva días abierta y solo cuenta mientras se usa.
function Test-Logon {
  foreach ($line in (quser 2>$null | Select-Object -Skip 1)) {
    $fields = $line.Trim() -split '\s{2,}'
    try { if (& $fresh ([datetime]::Parse($fields[-1]))) { return $true } } catch {}
    $idle = $fields[-2]
    if ($idle -in 'none', '.') { return $true }
    $minutes = if ($idle -match '^(?:(\d+)\+)?(?:(\d+):)?(\d+)$') { [int]$Matches[1] * 1440 + [int]$Matches[2] * 60 + [int]$Matches[3] } else { [int]::MaxValue }
    if ($minutes -lt $idleSeconds / 60) { return $true }
  }
  $false
}

# Las tareas de QA y los builds de otras personas en esta VM; una que lleva más de 2 horas deja de contar.
function Test-Task {
  foreach ($task in Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Running' -and $_.TaskPath -notlike '\Microsoft\*' -and $_.TaskName -notlike 'verify-queue*' }) {
    if (& $fresh ($task | Get-ScheduledTaskInfo).LastRunTime) { return $true }
  }
  $false
}

if ((Test-Path (Join-Path $Root 'busy')) -or (Test-Run) -or (Test-Upload) -or (Test-Process) -or (Test-Logon) -or (Test-Task) -or -not (Test-Path $stamp)) {
  Set-Content $stamp ''
  exit 0
}
if (($now - (Get-Item $stamp).LastWriteTime).TotalSeconds -ge $idleSeconds) {
  Set-Content $stamp ''
  & shutdown.exe /s /t 60 /d p:0:0 /c "verify-queue: 20 minutos sin uso"
}
