# PowerShell Script to Clean Up Deprecated Files
# Run this script to remove CalculationsPart2View.vue

Write-Host "🗑️  Cleaning up deprecated files..." -ForegroundColor Cyan
Write-Host ""

$fileToDelete = "app-frontend\src\views\modules\cadastral-standard\CalculationsPart2View.vue"
$fullPath = Join-Path $PSScriptRoot $fileToDelete

if (Test-Path $fullPath) {
    Write-Host "Found: $fileToDelete" -ForegroundColor Yellow
    Write-Host "Size: $((Get-Item $fullPath).Length) bytes" -ForegroundColor Gray
    Write-Host ""
    
    $confirmation = Read-Host "Delete this file? (y/n)"
    
    if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
        try {
            Remove-Item $fullPath -Force
            Write-Host "✅ Successfully deleted: $fileToDelete" -ForegroundColor Green
            Write-Host ""
            Write-Host "📝 File was deprecated and replaced by MapLibreAreaView.vue" -ForegroundColor Gray
        }
        catch {
            Write-Host "❌ Error deleting file: $_" -ForegroundColor Red
        }
    }
    else {
        Write-Host "❌ Deletion cancelled" -ForegroundColor Yellow
    }
}
else {
    Write-Host "✅ File already deleted or not found: $fileToDelete" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Cyan
