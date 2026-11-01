param([switch] $Background)
& (Join-Path $PSScriptRoot 'invoke-backend.ps1') -Tasks @('run') -Background:$Background
