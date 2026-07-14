But: Instructions pour créer un tunnel Cloudflare nommé (URL stable) et exposer Ollama en sécurité.

Prérequis
- Avoir un compte Cloudflare et domaine enregistré dans Cloudflare.
- `cloudflared` téléchargé sur la machine (Windows/Ubuntu).
- Ollama installé et en écoute sur `127.0.0.1:11434`.

1) Authentifier `cloudflared` avec votre compte Cloudflare
```powershell
# Windows PowerShell (exécutez depuis le dossier de cloudflared.exe)
./cloudflared.exe login
```
Cette commande ouvrira le navigateur et vous demandera d'autoriser l'accès à votre compte Cloudflare.

2) Créer un tunnel nommé
```bash
# Exemple (Linux/macOS)
cloudflared tunnel create ollama-tunnel
# Notez l'ID retourné et le chemin du fichier credentials (généré dans ~/.cloudflared)
```

3) Associer un nom DNS (ex: ollama.example.com)
```bash
cloudflared tunnel route dns ollama-tunnel ollama.example.com
```
(Remplacez `ollama.example.com` par votre sous-domaine.)

4) Configurer `config.yml` (exemple local)
Créez `~/.cloudflared/config.yml` avec le contenu :
```yaml
proxy_url: http://127.0.0.1:11434
tunnel: <TUNNEL_ID> # mettez l'ID retourné par `tunnel create`
credentials-file: /home/<user>/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: ollama.example.com
    service: http://127.0.0.1:11434
  - service: http_status:404
```

5) Lancer le tunnel (mode service)
Linux (systemd) :
```bash
# Démarrer directement
cloudflared tunnel run ollama-tunnel
# ou créer le service systemd (fichier fourni ci-dessous) et activer
sudo systemctl enable --now cloudflared-ollama.service
```
Windows : utilisez le run `cloudflared.exe service install` ou NSSM pour créer un service.

6) Vérifier
```bash
# depuis le VPS
curl http://127.0.0.1:11434/v1/models
# ou via le DNS si configuré
curl https://ollama.example.com/v1/models
```

7) Mettre à jour Render
- Dans Render Dashboard -> service -> Environment -> ajoutez :
  - `OLLAMA_HOST` = `https://ollama.example.com`
  - `OLLAMA_MODEL` = `llama3.2:3b`
- Redeploy l'app.

Sécurité recommandée
- Activez TLS (Certbot + nginx) et/ou Cloudflare Access pour restreindre l'accès.
- Ne laissez pas le port 11434 exposé sans protection.

Notes
- Le tunnel nommé fournit une URL stable (lliée au DNS). L'URL `trycloudflare` est temporaire et change si vous relancez le client sans tunnel enregistré.
- Si vous préférez l'URL temporaire pour tests rapides, exécutez `cloudflared tunnel --url http://127.0.0.1:11434`.
