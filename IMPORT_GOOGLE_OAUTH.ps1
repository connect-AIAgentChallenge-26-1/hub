$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Select the Google OAuth client JSON file'
$dialog.Filter = 'Google OAuth JSON (*.json)|*.json'
$dialog.Multiselect = $false
$downloads = Join-Path $env:USERPROFILE 'Downloads'
if (Test-Path -LiteralPath $downloads) {
    $dialog.InitialDirectory = $downloads
}

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    throw 'No Google OAuth JSON file was selected.'
}

$json = Get-Content -Raw -LiteralPath $dialog.FileName | ConvertFrom-Json
$client = $json.web
if (-not $client) {
    throw 'Select a Google OAuth client JSON created as a Web application.'
}

$clientId = [string]$client.client_id
$clientSecret = [string]$client.client_secret
if ($clientId -notmatch '^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$') {
    throw 'The selected JSON does not contain a valid Google Client ID.'
}
if ($clientSecret -notmatch '^GOCSPX-[A-Za-z0-9_-]+$') {
    throw 'The selected JSON does not contain a complete Google Client Secret.'
}

function Set-EnvValue {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $content = if (Test-Path -LiteralPath $Path) {
        [IO.File]::ReadAllText($Path)
    } else {
        ''
    }

    $pattern = "(?m)^$([Text.RegularExpressions.Regex]::Escape($Key))=.*$"
    if ($content -match $pattern) {
        $content = [Text.RegularExpressions.Regex]::Replace(
            $content,
            $pattern,
            { param($match) "$Key=$Value" }
        )
    } else {
        $content = $content.TrimEnd() + [Environment]::NewLine + "$Key=$Value" + [Environment]::NewLine
    }

    [IO.File]::WriteAllText($Path, $content, [Text.UTF8Encoding]::new($false))
}

Set-EnvValue -Path (Join-Path $root 'work.env') -Key 'GOOGLE_CLIENT_ID' -Value $clientId
Set-EnvValue -Path (Join-Path $root 'work.env') -Key 'GOOGLE_CLIENT_SECRET' -Value $clientSecret
Set-EnvValue -Path (Join-Path $root 'work\.env') -Key 'GOOGLE_CLIENT_ID' -Value $clientId
Set-EnvValue -Path (Join-Path $root 'work\.env') -Key 'GOOGLE_CLIENT_SECRET' -Value $clientSecret

$requiredRedirect = 'http://127.0.0.1:3001/api/auth/callback/google'
$redirects = @($client.redirect_uris)
if ($redirects -notcontains $requiredRedirect) {
    Write-Host ''
    Write-Warning "Add this Authorized redirect URI in Google Cloud: $requiredRedirect"
}

Write-Host ''
Write-Host 'Google Client ID and Client Secret were imported as one matching pair.'

$listener = netstat -ano | Select-String '127\.0\.0\.1:3001\s+.*LISTENING' | Select-Object -First 1
if ($listener) {
    $serverPid = [int](($listener.ToString() -split '\s+')[-1])
    Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}
