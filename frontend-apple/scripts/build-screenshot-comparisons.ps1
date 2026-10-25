$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$screenshotRoot = Join-Path $PSScriptRoot '..\docs\screenshots'
$beforeRoot = Join-Path $screenshotRoot 'before-872e570'
$outputRoot = Join-Path $screenshotRoot 'compare-aurora'
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

$columnWidth = 720
$headerHeight = 54
$gap = 22
$padding = 18

foreach ($beforeFile in Get-ChildItem -LiteralPath $beforeRoot -Filter '*.png' | Sort-Object Name) {
  $currentFile = Join-Path $screenshotRoot $beforeFile.Name
  if (-not (Test-Path -LiteralPath $currentFile)) {
    continue
  }

  $before = [System.Drawing.Image]::FromFile($beforeFile.FullName)
  $current = [System.Drawing.Image]::FromFile($currentFile)
  try {
    $beforeHeight = [int][Math]::Round($before.Height * ($columnWidth / $before.Width))
    $currentHeight = [int][Math]::Round($current.Height * ($columnWidth / $current.Width))
    $canvasHeight = $headerHeight + [Math]::Max($beforeHeight, $currentHeight) + $padding * 2
    $canvasWidth = $padding * 2 + $columnWidth * 2 + $gap
    $canvas = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(244, 248, 246))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

      $titleFont = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
      $metaFont = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Regular)
      $inkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(32, 51, 66))
      $mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(105, 124, 133))
      try {
        $graphics.DrawString('Before 872e570', $titleFont, $inkBrush, $padding, 12)
        $graphics.DrawString('Current Aurora Glass', $titleFont, $inkBrush, ($padding + $columnWidth + $gap), 12)
        $graphics.DrawString($beforeFile.BaseName, $metaFont, $mutedBrush, $padding, 34)
        $graphics.DrawString($beforeFile.BaseName, $metaFont, $mutedBrush, ($padding + $columnWidth + $gap), 34)

        $beforeRect = New-Object System.Drawing.Rectangle($padding, ($headerHeight + $padding), $columnWidth, $beforeHeight)
        $currentRect = New-Object System.Drawing.Rectangle(($padding + $columnWidth + $gap), ($headerHeight + $padding), $columnWidth, $currentHeight)
        $graphics.DrawImage($before, $beforeRect)
        $graphics.DrawImage($current, $currentRect)

        $outputPath = Join-Path $outputRoot $beforeFile.Name
        $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
      }
      finally {
        $titleFont.Dispose()
        $metaFont.Dispose()
        $inkBrush.Dispose()
        $mutedBrush.Dispose()
      }
    }
    finally {
      $graphics.Dispose()
      $canvas.Dispose()
    }
  }
  finally {
    $before.Dispose()
    $current.Dispose()
  }
}

Write-Output "Generated comparisons in $outputRoot"
