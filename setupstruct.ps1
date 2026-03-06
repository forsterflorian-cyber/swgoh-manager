$files = @(
    "app\api\auth\[...nextauth]\route.ts",
    "app\api\guild\[guildId]\sync\route.ts",
    "app\api\tb\[instanceId]\gap\route.ts",
    "app\api\tb\[instanceId]\assign\route.ts",
    "app\api\tb\[instanceId]\auto-assign\route.ts",
    "app\api\public\guild\[slug]\route.ts",
    "app\api\dashboard\route.ts",
    "app\gilde\[slug]\page.tsx",
    "app\dashboard\page.tsx",
    "app\tb\[instanceId]\phase\[phase]\page.tsx",
    "app\login\page.tsx",
    "components\tb\ZoneCard.tsx",
    "components\tb\UnitSlotRow.tsx",
    "components\tb\PlayerDropdown.tsx",
    "components\tb\PhaseNavigation.tsx",
    "components\ui\Button.tsx",
    "components\ui\Badge.tsx",
    "components\layout\Navbar.tsx",
    "components\layout\SessionProvider.tsx",
    "lib\services\gap-analysis.ts",
    "lib\services\roster-sync.ts",
    "lib\services\permissions.ts",
    "lib\services\guild-import.ts",
    "lib\types\tb.ts",
    "lib\utils\cn.ts",
    "lib\auth.ts",
    "sql\001_extended_schema.sql",
    "sql\002_seed_rote.sql",
    "scripts\migrate.ts",
    "scripts\seed-rote-requirements.ts",
    "scripts\fetch-unit-list.ts"
)

foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        New-Item -ItemType File -Force -Path $file | Out-Null
        Write-Host "  Created: $file" -ForegroundColor Green
    } else {
        Write-Host "  Exists:  $file" -ForegroundColor Yellow
    }
}

Write-Host "`nDone! All directories and files created." -ForegroundColor Cyan