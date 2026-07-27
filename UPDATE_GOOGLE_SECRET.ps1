$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $root 'work\.env'

if (-not (Test-Path -LiteralPath $envPath)) {
    throw "The environment file was not found: $envPath"
}

Write-Host ''
Write-Host 'Paste the NEW Google Client Secret and press Enter.'
Write-Host 'The pasted value will stay hidden.'
$secureSecret = Read-Host 'Google Client Secret' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)

try {
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

if ($secret -notmatch '^GOCSPX-[A-Za-z0-9_-]+$') {
    throw 'The value does not look like a complete Google Client Secret.'
}

$content = [IO.File]::ReadAllText($envPath)
if ($content -match '(?m)^GOOGLE_CLIENT_SECRET=.*$') {
    $content = [Text.RegularExpressions.Regex]::Replace(
        $content,
        '(?m)^GOOGLE_CLIENT_SECRET=.*$',
        "GOOGLE_CLIENT_SECRET=$secret"
    )
} else {
    $content = $content.TrimEnd() + [Environment]::NewLine + "GOOGLE_CLIENT_SECRET=$secret" + [Environment]::NewLine
}

[IO.File]::WriteAllText($envPath, $content, [Text.UTF8Encoding]::new($false))
Write-Host ''
Write-Host 'The new Google Client Secret was saved successfully.'

$listener = netstat -ano | Select-String '127\.0\.0\.1:3001\s+.*LISTENING' | Select-Object -First 1
if ($listener) {
    $serverPid = [int](($listener.ToString() -split '\s+')[-1])
    Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}
