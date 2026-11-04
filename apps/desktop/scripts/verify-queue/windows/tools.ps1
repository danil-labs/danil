# Las herramientas de la cola en Windows, en $Root\tools: Node y pnpm como en vm-verify, y
# rustup con stable y 1.97.1. Corre como administrador antes de install.ps1. Idempotente.
param([string]$Root = 'D:\ci')
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$tools = "$Root\tools"
$nodeVersion = 'v22.23.4'
$pnpmVersion = '12.3.4'
$toolchains = 'stable', '1.97.1'
$download = Join-Path $env:TEMP ([guid]::NewGuid())
New-Item -ItemType Directory -Force $tools, $download | Out-Null
if (-not (Test-Path "$tools\node\node.exe") -or ((& "$tools\node\node.exe" -v) -ne $nodeVersion)) {
  Invoke-WebRequest "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip" -OutFile "$download\node.zip"
  Expand-Archive "$download\node.zip" $download
  if (Test-Path "$tools\node") { Remove-Item -Recurse -Force "$tools\node" }
  Move-Item "$download\node-$nodeVersion-win-x64" "$tools\node"
}
$env:Path = "$tools\node;$env:Path"
& "$tools\node\npm.cmd" install -g --prefix "$tools\node" --cache "$download\npm-cache" "pnpm@$pnpmVersion" 2>&1 | Select-Object -Last 1
$env:RUSTUP_HOME = "$tools\rust\rustup"
$env:CARGO_HOME = "$tools\rust\cargo"
if (-not (Test-Path "$tools\rust\cargo\bin\rustup.exe")) {
  Invoke-WebRequest 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile "$download\rustup-init.exe"
  & "$download\rustup-init.exe" -y --no-modify-path --profile minimal --default-toolchain none --default-host x86_64-pc-windows-msvc 2>&1 | Select-Object -Last 1
}
foreach ($toolchain in $toolchains) { & "$tools\rust\cargo\bin\rustup.exe" toolchain install $toolchain --profile minimal -c clippy,rustfmt 2>&1 | Select-Object -Last 1 }
& "$tools\rust\cargo\bin\rustup.exe" default stable 2>&1 | Select-Object -Last 1
Remove-Item -Recurse -Force $download
"node $(& "$tools\node\node.exe" -v), pnpm $(& "$tools\node\pnpm.cmd" -v), $((& "$tools\rust\cargo\bin\rustup.exe" toolchain list) -join ', ')"
