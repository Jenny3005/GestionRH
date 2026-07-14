# PowerShell helper to create a named cloudflared tunnel and route DNS (Windows)
# Usage: .\cloudflared_create_tunnel.ps1 -TunnelName ollama-tunnel -Hostname ollama.example.com
param(
    [string]$TunnelName = 'ollama-tunnel',
    [string]$Hostname = ''
)

if (-not (Get-Command .\cloudflared.exe -ErrorAction SilentlyContinue)) {
    Write-Error "cloudflared.exe not found in current folder. Place cloudflared.exe here or add it to PATH."
    exit 1
}

Write-Output "Authentification Cloudflare (ouvre le navigateur)..."
Start-Process -FilePath .\cloudflared.exe -ArgumentList 'login' -NoNewWindow -Wait

Write-Output "Création du tunnel nommé: $TunnelName"
$create = .\cloudflared.exe tunnel create $TunnelName
Write-Output $create

if ($Hostname -ne '') {
    Write-Output "Association DNS: $Hostname -> tunnel $TunnelName"
    .\cloudflared.exe tunnel route dns $TunnelName $Hostname
}

Write-Output "Pour lancer le tunnel (persistance) :`ncloudflared tunnel run $TunnelName`
Ou installez en service systemd sur Linux avec le fichier deployments/cloudflared/cloudflared.service"
