$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$adminName = Read-Host 'Nome do administrador'
$adminEmail = Read-Host 'E-mail do administrador'
$adminSecure = Read-Host 'Senha (mínimo 12 caracteres)' -AsSecureString
$adminPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecure)
try {
  $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPointer)
  @{name=$adminName; email=$adminEmail; password=$adminPassword} | ConvertTo-Json -Compress | node server.cjs init
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível configurar a conta.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPointer)
  $adminPassword = $null
}
Read-Host 'Pressione Enter para concluir'
