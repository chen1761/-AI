$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host "Deploying YaoHai GlobalTrade AI website to Vercel..."

if (-not (Get-Command "D:\npx.cmd" -ErrorAction SilentlyContinue)) {
  throw "D:\npx.cmd not found. Please install Node.js/npm or update this script."
}

if (-not $env:VERCEL_TOKEN) {
  Write-Host "No VERCEL_TOKEN detected. Starting Vercel CLI login..."
  & "D:\npx.cmd" vercel@latest login
}

if ($env:VERCEL_TOKEN) {
  & "D:\npx.cmd" vercel@latest --prod --yes --token $env:VERCEL_TOKEN
  & "D:\npx.cmd" vercel@latest domains add haoleyun.xyz --token $env:VERCEL_TOKEN
} else {
  & "D:\npx.cmd" vercel@latest --prod --yes
  & "D:\npx.cmd" vercel@latest domains add haoleyun.xyz
}

Write-Host "Done. If Vercel asks for DNS changes, update the domain records in your domain registrar."
