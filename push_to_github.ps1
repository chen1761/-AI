$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$git = "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd\git.exe"
if (-not (Test-Path -LiteralPath $git)) {
  throw "Git not found at $git"
}

if (-not (Test-Path -LiteralPath ".git")) {
  & $git init
  & $git branch -M main
  & $git remote add origin "https://github.com/chen1761/-AI.git"
}

& $git config user.name "chen1761"
& $git config user.email "chen1761@users.noreply.github.com"
& $git add -A

$hasCommit = $true
try { & $git rev-parse --verify HEAD | Out-Null } catch { $hasCommit = $false }
if ($hasCommit) {
  & $git commit -m "Update YaoHai GlobalTrade AI website"
} else {
  & $git commit -m "Deploy YaoHai GlobalTrade AI website"
}

if ($env:GITHUB_TOKEN) {
  $remote = "https://x-access-token:$env:GITHUB_TOKEN@github.com/chen1761/-AI.git"
  & $git push $remote main
} else {
  & $git push -u origin main
}
