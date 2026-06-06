$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = 'tradicted-trading-journal'
  fileType       = 'exe'
  url64bit       = 'https://github.com/tradicted/tradicted-journal/releases/download/v1.0.0/Tradicted.Journal-1.0.0-setup.exe'
  checksum64     = 'c7ecc88af2018e8efbf97fc3153e21e17ae02ba77d20096b8c112addda554373'
  checksumType64 = 'sha256'
  silentArgs     = '/S'
  validExitCodes = @(0)
}

Install-ChocolateyPackage @packageArgs
