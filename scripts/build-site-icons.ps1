param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$iconRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
$svgPath = Join-Path $iconRoot 'assets/site-icon.svg'
$distSvgPath = Join-Path $iconRoot 'dist/assets/site-icon.svg'
if ((Get-FileHash -LiteralPath $svgPath).Hash -ne (Get-FileHash -LiteralPath $distSvgPath).Hash) {
  throw 'Source and dist SVG icons must match before building.'
}
[xml]$iconSvg = Get-Content -LiteralPath $svgPath -Raw
if ($iconSvg.svg.GetAttribute('viewBox') -ne '0 0 64 64') { throw 'Expected a 64x64 SVG viewBox.' }
$backgroundShape = $iconSvg.svg.SelectSingleNode("*[local-name()='rect']")
$backgroundColor = [System.Drawing.ColorTranslator]::FromHtml($backgroundShape.GetAttribute('fill'))

function New-VectorPath([string]$Data) {
  $vectorPath = [System.Drawing.Drawing2D.GraphicsPath]::new([System.Drawing.Drawing2D.FillMode]::Winding)
  $tokens = [regex]::Matches($Data, '[A-Za-z]|-?\d+(?:\.\d+)?')
  $index = 0
  [single]$currentX = 0
  [single]$currentY = 0
  while ($index -lt $tokens.Count) {
    $command = $tokens[$index].Value
    $index++
    switch ($command) {
      'M' {
        $vectorPath.StartFigure()
        $currentX = [single]::Parse($tokens[$index].Value, [cultureinfo]::InvariantCulture)
        $currentY = [single]::Parse($tokens[$index + 1].Value, [cultureinfo]::InvariantCulture)
        $index += 2
      }
      'L' {
        $nextX = [single]::Parse($tokens[$index].Value, [cultureinfo]::InvariantCulture)
        $nextY = [single]::Parse($tokens[$index + 1].Value, [cultureinfo]::InvariantCulture)
        $vectorPath.AddLine($currentX, $currentY, $nextX, $nextY)
        $currentX = $nextX
        $currentY = $nextY
        $index += 2
      }
      'C' {
        [single[]]$points = for ($coordinate = 0; $coordinate -lt 6; $coordinate++) {
          [single]::Parse($tokens[$index + $coordinate].Value, [cultureinfo]::InvariantCulture)
        }
        $vectorPath.AddBezier($currentX, $currentY, $points[0], $points[1], $points[2], $points[3], $points[4], $points[5])
        $currentX = $points[4]
        $currentY = $points[5]
        $index += 6
      }
      'Z' { $vectorPath.CloseFigure() }
      default { throw "Unsupported SVG path command: $command" }
    }
  }
  return $vectorPath
}

function New-IconPng([int]$Size, [bool]$Opaque = $false) {
  $large = [System.Drawing.Bitmap]::new($Size * 4, $Size * 4)
  $canvas = [System.Drawing.Graphics]::FromImage($large)
  $canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $canvas.ScaleTransform([single]($Size * 4 / 64), [single]($Size * 4 / 64))
  if ($Opaque) { $canvas.Clear($backgroundColor) }
  try {
    foreach ($shape in $iconSvg.svg.ChildNodes) {
      if ($shape.NodeType -ne [System.Xml.XmlNodeType]::Element -or $shape.LocalName -in @('title', 'desc')) { continue }
      # This deliberately small renderer supports the flat shapes in our source icon.
      if ($shape.LocalName -notin @('rect', 'path', 'circle')) { throw "Unsupported SVG element: $($shape.LocalName)" }
      $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($shape.GetAttribute('fill')))
      try {
        switch ($shape.LocalName) {
          'rect' {
            [single]$width = $shape.GetAttribute('width')
            [single]$height = $shape.GetAttribute('height')
            [single]$diameter = 2 * [single]$shape.GetAttribute('rx')
            $rounded = [System.Drawing.Drawing2D.GraphicsPath]::new()
            try {
              $rounded.AddArc(0, 0, $diameter, $diameter, 180, 90)
              $rounded.AddArc($width - $diameter, 0, $diameter, $diameter, 270, 90)
              $rounded.AddArc($width - $diameter, $height - $diameter, $diameter, $diameter, 0, 90)
              $rounded.AddArc(0, $height - $diameter, $diameter, $diameter, 90, 90)
              $rounded.CloseFigure()
              $canvas.FillPath($brush, $rounded)
            } finally { $rounded.Dispose() }
          }
          'path' {
            $vectorPath = New-VectorPath $shape.GetAttribute('d')
            try { $canvas.FillPath($brush, $vectorPath) } finally { $vectorPath.Dispose() }
          }
          'circle' {
            [single]$radius = $shape.GetAttribute('r')
            [single]$x = [single]$shape.GetAttribute('cx') - $radius
            [single]$y = [single]$shape.GetAttribute('cy') - $radius
            $canvas.FillEllipse($brush, $x, $y, $radius * 2, $radius * 2)
          }
        }
      } finally { $brush.Dispose() }
    }
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $downsample = [System.Drawing.Graphics]::FromImage($bitmap)
    $stream = [System.IO.MemoryStream]::new()
    try {
      $downsample.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $downsample.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $downsample.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $downsample.DrawImage($large, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size))
      $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
      return ,$stream.ToArray()
    } finally {
      $stream.Dispose()
      $downsample.Dispose()
      $bitmap.Dispose()
    }
  } finally {
    $canvas.Dispose()
    $large.Dispose()
  }
}

[byte[]]$png16 = New-IconPng 16
[byte[]]$png32 = New-IconPng 32
[byte[]]$png180 = New-IconPng 180 $true
[byte[]]$png192 = New-IconPng 192 $true

$icoStream = [System.IO.MemoryStream]::new()
$icoWriter = [System.IO.BinaryWriter]::new($icoStream)
try {
  $icoWriter.Write([uint16]0)
  $icoWriter.Write([uint16]1)
  $icoWriter.Write([uint16]2)
  $offset = 6 + 16 * 2
  foreach ($entry in @(@{ Size = 16; Bytes = $png16 }, @{ Size = 32; Bytes = $png32 })) {
    $icoWriter.Write([byte]$entry.Size)
    $icoWriter.Write([byte]$entry.Size)
    $icoWriter.Write([byte]0)
    $icoWriter.Write([byte]0)
    $icoWriter.Write([uint16]1)
    $icoWriter.Write([uint16]32)
    $icoWriter.Write([uint32]$entry.Bytes.Length)
    $icoWriter.Write([uint32]$offset)
    $offset += $entry.Bytes.Length
  }
  $icoWriter.Write($png16)
  $icoWriter.Write($png32)
  $icoWriter.Flush()
  [byte[]]$ico = $icoStream.ToArray()
} finally {
  $icoWriter.Dispose()
  $icoStream.Dispose()
}

foreach ($directory in @($iconRoot, (Join-Path $iconRoot 'dist'))) {
  [System.IO.File]::WriteAllBytes((Join-Path $directory 'favicon.ico'), $ico)
  [System.IO.File]::WriteAllBytes((Join-Path $directory 'assets/site-icon-32.png'), $png32)
  [System.IO.File]::WriteAllBytes((Join-Path $directory 'assets/apple-touch-icon.png'), $png180)
  [System.IO.File]::WriteAllBytes((Join-Path $directory 'assets/site-icon-192.png'), $png192)
}
Write-Output 'Built source and dist icons: SVG-based ICO (16/32), PNG 32, Apple 180 and PNG 192.'
