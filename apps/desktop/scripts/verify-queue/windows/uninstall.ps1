# Quita lo que instaló install.ps1 y deja la VM como estaba. Corre como administrador.
# Borra las tareas, las reglas de firewall, los usuarios y sus perfiles, y $Root entero
# (herramientas, espejos, carriles y corridas). El sshd y la configuración de la VM no se tocaron.
param([string]$Root = 'D:\ci')
$ErrorActionPreference = 'Continue'
foreach ($task in 'verify-queue-idle', 'verify-queue', 'verify-queue-gate', 'verify-queue-sshd') {
  Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
}
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains("$Root\") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-NetFirewallRule -Group 'verify-queue' -ErrorAction SilentlyContinue
# Quita a verify del inicio por lotes y a verify-runners de los symlinks (install.ps1 los añadió).
function Revoke-Right([string]$right, [string]$sid) {
  $work = Join-Path $env:TEMP ([guid]::NewGuid())
  New-Item -ItemType Directory $work | Out-Null
  secedit.exe /export /cfg "$work\now.inf" /areas USER_RIGHTS | Out-Null
  $line = (Select-String -Path "$work\now.inf" -Pattern "^$right\s*=").Line
  $holders = ($line -split '=', 2)[1].Trim() -split ',' | Where-Object { $_ -and $_ -ne "*$sid" }
  Set-Content -Encoding Unicode "$work\new.inf" "[Unicode]`r`nUnicode=yes`r`n[Version]`r`nsignature=`"`$CHICAGO`$`"`r`nRevision=1`r`n[Privilege Rights]`r`n$right = $($holders -join ',')"
  secedit.exe /configure /db "$work\new.sdb" /cfg "$work\new.inf" /areas USER_RIGHTS /quiet | Out-Null
  Remove-Item -Recurse -Force $work
}
$verifySid = (Get-LocalUser verify -ErrorAction SilentlyContinue).SID.Value
$runnersSid = (Get-LocalGroup verify-runners -ErrorAction SilentlyContinue).SID.Value
if ($verifySid) { Revoke-Right SeBatchLogonRight $verifySid }
if ($runnersSid) {
  Revoke-Right SeCreateSymbolicLinkPrivilege $runnersSid
  icacls.exe "$(Split-Path -Qualifier $Root)\" /remove:d "*$runnersSid" | Out-Null
}
$users = @('verify') + @(Get-LocalGroupMember verify-runners -ErrorAction SilentlyContinue | ForEach-Object { $_.Name.Split('\')[-1] })
foreach ($name in $users) {
  $user = Get-LocalUser $name -ErrorAction SilentlyContinue
  if (-not $user) { continue }
  Get-CimInstance Win32_Process | Where-Object { (Invoke-CimMethod -InputObject $_ -MethodName GetOwner -ErrorAction SilentlyContinue).User -eq $name } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_UserProfile | Where-Object SID -eq $user.SID.Value | Remove-CimInstance
  Remove-LocalUser $name
}
Remove-LocalGroup verify-runners -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $Root -ErrorAction SilentlyContinue
"listo: $Root, usuarios ($($users -join ', ')), reglas y tareas fuera"
