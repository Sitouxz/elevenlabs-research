# Download all Figma MCP assets locally
# Run from project root: powershell -ExecutionPolicy Bypass -File scripts/download-assets.ps1

# Fresh URLs fetched via Figma MCP (valid ~7 days from Apr 22 2026)
$assets = @(
    # Splash screen (node 1:12)
    @{ url = "https://www.figma.com/api/mcp/asset/80b290a0-b354-44dd-a630-755d628aef30"; name = "splash-city-bg" },
    @{ url = "https://www.figma.com/api/mcp/asset/72882d3e-c09e-4420-9753-593334b64d31"; name = "splash-lumi" },
    @{ url = "https://www.figma.com/api/mcp/asset/f6e49e8b-08fc-49e7-bdb2-8745e1fef101"; name = "splash-leaf-tl" },
    # Main menu / shared city bg (node 1:62)
    @{ url = "https://www.figma.com/api/mcp/asset/30f51123-b96c-454b-b01f-395f735427c8"; name = "menu-city-bg" },
    @{ url = "https://www.figma.com/api/mcp/asset/4b3dac81-582e-4d8e-9cb1-389919b8ef9c"; name = "menu-lumi" },
    # Topic detail city bg (node 1:104 — different bg)
    @{ url = "https://www.figma.com/api/mcp/asset/d16aab6a-aeb8-4274-a329-44911df01a7a"; name = "topic-detail-city-bg" },
    # Solar topic bg (node 1:147)
    @{ url = "https://www.figma.com/api/mcp/asset/fcff3f6a-9d79-4e57-956e-766f947c700e"; name = "solar-bg" },
    @{ url = "https://www.figma.com/api/mcp/asset/77c38193-7136-4bb4-8d0c-91c44e899771"; name = "solar-lumi" },
    # EV topic bg (node 1:166)
    @{ url = "https://www.figma.com/api/mcp/asset/6046f312-82bf-4494-ae6d-d8dbe0e0ca80"; name = "ev-bg" },
    @{ url = "https://www.figma.com/api/mcp/asset/86fe7fff-7c71-40d8-a85c-86a7348d2e4b"; name = "ev-lumi" },
    # Battery topic bg (node 1:186)
    @{ url = "https://www.figma.com/api/mcp/asset/8f37ec25-23f3-469d-9c1f-b246b8329661"; name = "battery-bg" },
    @{ url = "https://www.figma.com/api/mcp/asset/06a8ccd4-3f14-4a39-a58d-6cdf77e64232"; name = "battery-lumi" },
    # AI topic bg (node 1:206)
    @{ url = "https://www.figma.com/api/mcp/asset/458a8ab2-8a1b-415d-b745-437250d905dd"; name = "ai-bg" },
    @{ url = "https://www.figma.com/api/mcp/asset/5c9e97df-5def-42eb-b3ea-292e611d2d89"; name = "ai-lumi" },
    # End scenario (node 1:1844)
    @{ url = "https://www.figma.com/api/mcp/asset/45c0cd05-634a-4565-9b56-adbc1292e517"; name = "end-city-bg" },
    @{ url = "https://www.figma.com/api/mcp/asset/d21f2d55-c534-4411-98de-0d042adee94c"; name = "end-lumi" },
    @{ url = "https://www.figma.com/api/mcp/asset/31e1ad28-27a9-4064-9661-a36f5024e559"; name = "end-vector4" },
    # Shared decorative assets
    @{ url = "https://www.figma.com/api/mcp/asset/7a51287d-3393-4f70-bb46-c5238a740b71"; name = "decor-pattern" }
)

$outputDir = Join-Path $PSScriptRoot "..\public\assets"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

foreach ($asset in $assets) {
    $url = $asset.url
    Write-Host "Downloading $($asset.name) ..."

    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 30

        # Detect extension from Content-Type
        $ct = $response.Headers["Content-Type"]
        $ext = "png"
        if ($ct -match "jpeg") { $ext = "jpg" }
        elseif ($ct -match "svg") { $ext = "svg" }
        elseif ($ct -match "webp") { $ext = "webp" }
        elseif ($ct -match "png") { $ext = "png" }

        $outPath = Join-Path $outputDir "$($asset.name).$ext"
        [System.IO.File]::WriteAllBytes($outPath, $response.Content)
        Write-Host "  Saved: $outPath ($($response.Content.Length) bytes)" -ForegroundColor Green
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done! Assets saved to public/assets/" -ForegroundColor Cyan
