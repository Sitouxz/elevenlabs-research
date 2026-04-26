$sharedBg = 'https://www.figma.com/api/mcp/asset/aa7a1e83-0252-4918-87a3-1e58fdcba520'
$topicBg  = 'https://www.figma.com/api/mcp/asset/b262c770-e3cb-42c9-b10c-801c65ce4173'

$sharedFiles = @(
    'src\screens\AskQuestionsScreen.tsx',
    'src\screens\DecisionScreen.tsx',
    'src\screens\NarationScreen.tsx',
    'src\screens\ScenarioTitleScreen.tsx',
    'src\screens\ScoreScreen.tsx',
    'src\screens\SummaryScreen.tsx',
    'src\screens\TopicSelectScreen.tsx'
)

foreach ($f in $sharedFiles) {
    $content = Get-Content $f -Raw
    $patched = $content -replace [regex]::Escape($sharedBg), '/assets/menu-city-bg.png'
    Set-Content $f $patched -NoNewline
    Write-Host "Patched: $f"
}

$tdContent = Get-Content 'src\screens\TopicDetailScreen.tsx' -Raw
$tdPatched = $tdContent -replace [regex]::Escape($topicBg), '/assets/topic-detail-city-bg.png'
Set-Content 'src\screens\TopicDetailScreen.tsx' $tdPatched -NoNewline
Write-Host "Patched: src\screens\TopicDetailScreen.tsx"

Write-Host "All done!"
