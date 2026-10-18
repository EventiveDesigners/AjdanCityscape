# Prepares the 360 renders in assets\panos for offline viewing (double-click index.html).
# Browsers block 360 textures read straight from disk, so each render is wrapped into
# assets\panos\packed\<name>.js. Works with .png, .jpg, .jpeg and .webp - full quality,
# nothing is resized or recompressed. Only new or changed renders are processed.
# If both pano-07.png and pano-07.jpg exist, the most recently saved file is used.
$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot
$src    = Join-Path $root 'assets\panos'
$out    = Join-Path $src 'packed'
$stampF = Join-Path $out 'stamps.txt'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$old = @{}
if (Test-Path $stampF) { Get-Content $stampF | ForEach-Object { $p = $_ -split "`t"; if ($p.Count -eq 2) { $old[$p[0]] = $p[1] } } }

$all = Get-ChildItem $src -File | Where-Object { $_.Extension -match '^\.(png|jpe?g|webp)$' }
$pick = @{}
foreach ($f in $all) {
  $b = $f.BaseName
  if (-not $pick.ContainsKey($b) -or $f.LastWriteTime -gt $pick[$b].LastWriteTime) { $pick[$b] = $f }
}
$new = @{}; $n = 0
foreach ($b in ($pick.Keys | Sort-Object)) {
  $f = $pick[$b]
  $stamp = "{0}|{1}|{2}" -f $f.Name, $f.Length, $f.LastWriteTimeUtc.Ticks
  $new[$b] = $stamp
  $dst = Join-Path $out ($b + '.js')
  if ((Test-Path $dst) -and $old[$b] -eq $stamp -and (Test-Path (Join-Path $out ('thumbs\' + $b + '.jpg')))) { continue }
  $bytes = [IO.File]::ReadAllBytes($f.FullName)
  $mime = 'image/jpeg'                                   # detect real format from the header
  if ($bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { $mime = 'image/png' }
  elseif ($bytes[8] -eq 0x57 -and $bytes[9] -eq 0x45) { $mime = 'image/webp' }
  $js = 'window.PANO_PACK=window.PANO_PACK||{};window.PANO_PACK["' + $b + '"]="data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes) + '";'
  [IO.File]::WriteAllText($dst, $js, (New-Object Text.UTF8Encoding($false)))
  # small thumbnail for the viewpoint list (the full render is never used for thumbnails)
  try {
    Add-Type -AssemblyName System.Drawing
    $thumbDir = Join-Path $out 'thumbs'; New-Item -ItemType Directory -Force -Path $thumbDir | Out-Null
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $bmp = New-Object System.Drawing.Bitmap 480, 240
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, 480, 240)
    $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L
    $bmp.Save((Join-Path $thumbDir ($b + '.jpg')), $enc, $ep)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
  } catch { Write-Host "           (thumbnail skipped: $($_.Exception.Message))" }
  $mb = $f.Length / 1MB
  Write-Host ("  updated  {0,-14} {1,7:N1} MB" -f $f.Name, $mb)
  if ($mb -gt 60) { Write-Host "           (large file - fine on PC, may load slowly on phones/tablets)" }
  $n++
}
# drop packs whose render was deleted, write manifest + stamps
Get-ChildItem $out -Filter 'pano*.js' | Where-Object { -not $pick.ContainsKey($_.BaseName) } | Remove-Item -Force
$pairs = ($pick.Keys | Sort-Object | ForEach-Object { '"' + $_ + '":"' + $pick[$_].Name + '"' }) -join ','
$thumbDir = Join-Path $out 'thumbs'
Get-ChildItem $thumbDir -Filter '*.jpg' -ErrorAction SilentlyContinue | Where-Object { -not $pick.ContainsKey($_.BaseName) } | Remove-Item -Force
$tpairs = ($pick.Keys | Sort-Object | Where-Object { Test-Path (Join-Path $thumbDir ($_ + '.jpg')) } | ForEach-Object { '"' + $_ + '":' + $pick[$_].LastWriteTimeUtc.Ticks % 1000000000 }) -join ','
[IO.File]::WriteAllText((Join-Path $out 'manifest.js'), 'window.PANO_FILES={' + $pairs + '};window.PANO_THUMBS={' + $tpairs + '};', (New-Object Text.UTF8Encoding($false)))
($new.Keys | Sort-Object | ForEach-Object { $_ + "`t" + $new[$_] }) | Set-Content $stampF -Encoding UTF8
foreach ($b in $pick.Keys) {
  $dupes = $all | Where-Object { $_.BaseName -eq $b }
  if (@($dupes).Count -gt 1) { Write-Host ("  note: several files named {0} - using {1}" -f $b, $pick[$b].Name) }
}
if ($n -eq 0) { Write-Host "  all panoramas already up to date" } else { Write-Host "`n  $n panorama(s) updated." }
