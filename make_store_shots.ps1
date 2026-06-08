Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$cacheDir = Join-Path $env:USERPROFILE ".claude\image-cache\8e4ad10a-8ab4-46c7-99ae-e51b9fd1408b"
$outDir   = Join-Path $env:USERPROFILE "Downloads"
$map = @{ 79 = 1; 80 = 2; 81 = 3; 82 = 4; 83 = 5 }

function Get-WidestRun([bool[]]$arr) {
  $bestStart = 0; $bestLen = 0; $curStart = -1
  for ($i = 0; $i -lt $arr.Length; $i++) {
    if ($arr[$i]) {
      if ($curStart -lt 0) { $curStart = $i }
      $len = $i - $curStart + 1
      if ($len -gt $bestLen) { $bestLen = $len; $bestStart = $curStart }
    } else { $curStart = -1 }
  }
  return @($bestStart, ($bestStart + $bestLen - 1))
}

function New-RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
  $p.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
  $p.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

foreach ($n in ($map.Keys | Sort-Object)) {
  $srcPath = Join-Path $cacheDir "$n.png"
  $orig = [System.Drawing.Bitmap]::FromFile($srcPath)
  $w = $orig.Width; $h = $orig.Height

  # Clone into 32bpp for predictable stride, then LockBits for fast pixel reads.
  $bmp32 = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gg = [System.Drawing.Graphics]::FromImage($bmp32)
  $gg.DrawImage($orig, 0, 0, $w, $h)
  $gg.Dispose()
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp32.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp32.UnlockBits($data)

  # Find the panel by its OUTLINE: a full-height contrast edge that exists whether
  # the page behind is light or dark. For each column, count rows with a strong
  # horizontal luminance gradient; the panel's left/right borders span most of the
  # height. Page text only makes short, scattered edges, so it's ignored.
  $E = 35; $dxp = 3
  $colThr = $h * 0.33
  $left = -1; $right = -1
  for ($x = $dxp; $x -lt $w; $x++) {
    $c = 0
    for ($y = 0; $y -lt $h; $y++) {
      $o = $y * $stride + $x * 4; $o2 = $o - $dxp * 4
      $l1 = ($bytes[$o] + $bytes[$o + 1] + $bytes[$o + 2]) / 3
      $l2 = ($bytes[$o2] + $bytes[$o2 + 1] + $bytes[$o2 + 2]) / 3
      if ([Math]::Abs($l1 - $l2) -gt $E) { $c++ }
    }
    if ($c -gt $colThr) { if ($left -lt 0) { $left = $x }; $right = $x }
  }
  # Top/bottom borders: vertical-gradient edges across the panel's column span.
  $rowThr = ($right - $left + 1) * 0.33
  $top = -1; $bottom = -1
  for ($y = $dxp; $y -lt $h; $y++) {
    $c = 0
    for ($x = $left; $x -le $right; $x++) {
      $o = $y * $stride + $x * 4; $o2 = $o - $dxp * $stride
      $l1 = ($bytes[$o] + $bytes[$o + 1] + $bytes[$o + 2]) / 3
      $l2 = ($bytes[$o2] + $bytes[$o2 + 1] + $bytes[$o2 + 2]) / 3
      if ([Math]::Abs($l1 - $l2) -gt $E) { $c++ }
    }
    if ($c -gt $rowThr) { if ($top -lt 0) { $top = $y }; $bottom = $y }
  }

  # Pad 1px inward to drop any residual edge, then clamp
  $cropX = [Math]::Max(0, $left + 1)
  $cropY = [Math]::Max(0, $top + 1)
  $cropR = [Math]::Min($w - 1, $right - 1)
  $cropB = [Math]::Min($h - 1, $bottom - 1)
  $cw = $cropR - $cropX + 1
  $ch = $cropB - $cropY + 1

  # Scale to fit 740 tall, never upscale (keeps UI crisp)
  $scale = [Math]::Min(1.0, 740.0 / $ch)
  $dw = [single]($cw * $scale)
  $dh = [single]($ch * $scale)
  $dx = [single]((1280 - $dw) / 2)
  $dy = [single]((800 - $dh) / 2)
  $radius = [single](14 * $scale)

  # Canvas: 24bpp (no alpha) for store compliance
  $canvas = New-Object System.Drawing.Bitmap 1280, 800, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'

  # Gradient backdrop
  $full = New-Object System.Drawing.Rectangle 0, 0, 1280, 800
  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush $full, ([System.Drawing.Color]::FromArgb(244, 245, 250)), ([System.Drawing.Color]::FromArgb(229, 232, 241)), 90.0
  $g.FillRectangle($grad, $full)
  $grad.Dispose()

  # Soft drop shadow (layered translucent rounded rects)
  for ($i = 16; $i -ge 1; $i--) {
    $inf = [single]$i
    $sp = New-RoundRect ($dx - $inf) ($dy - $inf + 10) ($dw + $inf * 2) ($dh + $inf * 2) ($radius + $inf)
    $sb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(5, 17, 24, 39))
    $g.FillPath($sb, $sp)
    $sb.Dispose(); $sp.Dispose()
  }

  # Panel, clipped to rounded corners
  $clip = New-RoundRect $dx $dy $dw $dh $radius
  $g.SetClip($clip)
  $destRect = New-Object System.Drawing.RectangleF $dx, $dy, $dw, $dh
  $srcRect = New-Object System.Drawing.RectangleF $cropX, $cropY, $cw, $ch
  $g.DrawImage($orig, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.ResetClip()
  $clip.Dispose()

  $outPath = Join-Path $outDir ("continuum-screenshot-{0}.png" -f $map[$n])
  $canvas.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

  Write-Output ("{0}.png -> {1}  (crop {2}x{3} at {4},{5}; scale {6:N2})" -f $n, (Split-Path $outPath -Leaf), $cw, $ch, $cropX, $cropY, $scale)

  $g.Dispose(); $canvas.Dispose(); $orig.Dispose(); $bmp32.Dispose()
}
Write-Output "ALL DONE"
