param([string]$Spec, [string]$Out)

# Generates frontend/docs/API_MAPPING.md from the backend OpenAPI contract.
# Consumer screens and phases come from the prefix rules below; nothing else is invented.
$j = Get-Content $Spec -Raw -Encoding UTF8 | ConvertFrom-Json

# First matching rule wins: method regex, path regex, consumer screen, frontend phase.
$rules = @(
  @('.*', '^/health/', 'BFF server only (readiness probe)', '1'),
  @('.*', '^/api/v1/webhooks/', 'Not called by frontend (Razorpay to public edge)', '-'),
  @('POST', '^/api/v1/auth/(login|refresh|logout|logout-all)$', 'Dedicated BFF auth handler (sets/clears cookies)', '3'),
  @('.*', '^/api/v1/auth/', '(auth) pages, session', '3'),
  @('.*', '^/api/v1/users/me/reviews', '/account (reviews)', '7'),
  @('.*', '^/api/v1/users/me', '/account/profile', '7'),
  @('.*', '^/api/v1/admin/(users|roles|permissions)', '/admin/users, /admin/roles', '9'),
  @('.*', '^/api/v1/admin/(regions|districts|destination-categories)', '/admin/geography', '9'),
  @('.*', '^/api/v1/admin/destinations', '/admin/destinations', '9'),
  @('.*', '^/api/v1/admin/experiences', '/admin/experiences', '9'),
  @('.*', '^/api/v1/admin/(properties|amenities)', '/admin/properties', '9'),
  @('.*', '^/api/v1/admin/(guides|languages)', '/admin/guides', '9'),
  @('.*', '^/api/v1/admin/packages', '/admin/packages', '9'),
  @('.*', '^/api/v1/admin/partners', '/admin/partners', '9'),
  @('.*', '^/api/v1/admin/bookings', '/admin/bookings', '9'),
  @('.*', '^/api/v1/admin/payments', '/admin/payments', '9'),
  @('.*', '^/api/v1/admin/refunds', '/admin/refunds', '9'),
  @('.*', '^/api/v1/admin/reviews', '/admin/reviews', '9'),
  @('.*', '^/api/v1/admin/cms', '/admin/cms', '9'),
  @('.*', '^/api/v1/admin/notification-templates', '/admin/notifications', '9'),
  @('.*', '^/api/v1/admin/(dashboard|reports)', '/admin, /admin/reports', '9'),
  @('.*', '^/api/v1/admin/settings', '/admin/settings', '9'),
  @('.*', '^/api/v1/admin/audit-logs', '/admin/audit-logs', '9'),
  @('.*', '^/api/v1/partners/apply', '/partner (application)', '8'),
  @('.*', '^/api/v1/partners/me/(dashboard|reports)', '/partner, /partner/reports', '8'),
  @('.*', '^/api/v1/partners/me/(properties|rooms)', '/partner/properties, /partner/rooms', '8'),
  @('.*', '^/api/v1/partners/me/guides', '/partner/guides', '8'),
  @('.*', '^/api/v1/partners/me/experiences', '/partner/experiences', '8'),
  @('.*', '^/api/v1/partners/me/packages', '/partner/packages', '8'),
  @('.*', '^/api/v1/partners/me/bookings', '/partner/bookings', '8'),
  @('.*', '^/api/v1/partners/me/users', '/partner/team', '8'),
  @('.*', '^/api/v1/partners/me/documents', '/partner/verification', '8'),
  @('.*', '^/api/v1/partners/me$', '/partner/organization', '8'),
  @('.*', '^/api/v1/content/', 'CMS renderer: /, /pages/[slug], header/footer, announcements', '4'),
  @('.*', '^/api/v1/media/', 'Shared upload component (account, partner, admin)', '7-9'),
  @('.*', '^/api/v1/(regions|districts)', '/districts, /districts/[slug], filters', '4'),
  @('.*', '^/api/v1/destination-categories', '/explore, /destinations filters', '4'),
  @('.*', '^/api/v1/destinations/\{slug\}/(experiences|properties|guides)', '/destinations/[slug] (related supply)', '5'),
  @('.*', '^/api/v1/destinations/\{slug\}/reviews', '/destinations/[slug] (reviews)', '4'),
  @('.*', '^/api/v1/destinations', '/destinations, /destinations/[slug], home', '4'),
  @('.*', '^/api/v1/search', '/search, global search box', '4'),
  @('.*', '^/api/v1/(properties|amenities)', '/stays, /stays/[slug]', '5'),
  @('.*', '^/api/v1/(guides|languages)', '/guides, /guides/[id]', '5'),
  @('.*', '^/api/v1/experiences', '/experiences, /experiences/[slug]', '5'),
  @('.*', '^/api/v1/packages', '/packages, /packages/[slug]', '5'),
  @('.*', '^/api/v1/bookings/quote', 'Booking widget on supply detail pages', '6'),
  @('.*', '^/api/v1/bookings/\{id\}/payment-order', '/checkout/[bookingId]', '6'),
  @('POST', '^/api/v1/bookings$', 'Booking widget -> /checkout/[bookingId]', '6'),
  @('.*', '^/api/v1/bookings', '/account/bookings, /account/bookings/[id], /checkout', '6-7'),
  @('.*', '^/api/v1/payments/verify', '/checkout -> /payments/result', '6'),
  @('.*', '^/api/v1/(payments|refunds)', '/account/bookings/[id] (payments, refunds)', '6-7'),
  @('.*', '^/api/v1/trips', '/account/trips', '7'),
  @('.*', '^/api/v1/favorites', '/account/favorites, save buttons', '7'),
  @('.*', '^/api/v1/reviews', 'Review list/forms on detail pages, /account', '5-7'),
  @('.*', '^/api/v1/notifications', '/account/notifications, header badge', '7')
)

function Get-Consumer($method, $path) {
  foreach ($r in $rules) {
    if ($method -match "^$($r[0])$" -and $path -match $r[1]) { return @($r[2], $r[3]) }
  }
  return @('UNMAPPED', '?')
}

$rows = @()
foreach ($p in $j.paths.PSObject.Properties) {
  foreach ($m in $p.Value.PSObject.Properties) {
    if ($m.Name -notin 'get', 'post', 'put', 'patch', 'delete') { continue }
    $o = $m.Value
    $method = $m.Name.ToUpper()
    $path = $p.Name
    $schemes = @($o.security | ForEach-Object { $_.PSObject.Properties.Name })
    if ($path -like '/api/v1/webhooks/*') { $auth = 'WEBHOOK' }
    elseif ($path -like '/health/*') { $auth = $(if ($schemes -contains 'ServiceToken') { 'S' } else { 'none' }) }
    elseif ($schemes -contains 'BearerAuth') {
      if ($path -like '/api/v1/admin/*') { $auth = 'ADMIN' }
      elseif ($path -like '/api/v1/partners/me*') { $auth = 'PARTNER' }
      else { $auth = 'U' }
    }
    else { $auth = 'P' }
    $perm = ''
    if ($o.description -match 'Requires permission\(s\): (.+?)\.(\s|$)') { $perm = $matches[1] }
    elseif ($o.description -match 'Requires one of: (.+?)\.(\s|$)') { $perm = 'any of ' + $matches[1] }
    $headers = @($o.parameters | Where-Object { $_.in -eq 'header' -and $_.name -notlike 'x-razorpay*' } | ForEach-Object {
      $n = (Get-Culture).TextInfo.ToTitleCase($_.name); if ($_.required) { "$n (required)" } else { $n } })
    $c = Get-Consumer $method $path
    $rows += [pscustomobject]@{ Tag = ($o.tags -join ', '); Method = $method; Path = $path; Auth = $auth; Perm = $perm; Headers = ($headers -join ', '); Summary = $o.summary; Consumer = $c[0]; Phase = $c[1] }
  }
}

$sb = New-Object System.Text.StringBuilder
$null = $sb.AppendLine('# API Mapping: backend contract to frontend consumers')
$null = $sb.AppendLine('')
$null = $sb.AppendLine("**Generated** from ``docs/api/openapi.json`` (OpenAPI $($j.openapi), API $($j.info.version), **$($rows.Count) operations**) on $(Get-Date -Format 'yyyy-MM-dd').")
$null = $sb.AppendLine('Do not edit the tables by hand: change the consumer rules in the generator and regenerate (see DECISIONS W24).')
$null = $sb.AppendLine('If the backend contract changes, regenerate this file and the BFF allowlist together.')
$null = $sb.AppendLine('')
$null = $sb.AppendLine('**Status:** Method, Path, Auth, Permission(s), Headers and Summary are **Confirmed** (read from the contract).')
$null = $sb.AppendLine('Frontend consumer and Phase are **Proposed** (frontend plan, see SITEMAP.md). Backend gaps: DECISIONS.md section 3.')
$null = $sb.AppendLine('')
$null = $sb.AppendLine('**Auth:** `P` = service token only (public data via BFF); `U` = service token + user JWT; `PARTNER` = U + approved')
$null = $sb.AppendLine('partner membership (backend `partnerGuard`); `ADMIN` = U + admin permission; `S` = service token, server-only;')
$null = $sb.AppendLine('`WEBHOOK` = provider signature, never called by the frontend. **Phase** = frontend phase that first consumes it')
$null = $sb.AppendLine('(see IMPLEMENTATION_STATUS.md). Paths are shown with OpenAPI `{param}` syntax.')
$null = $sb.AppendLine('')
$null = $sb.AppendLine('**Browser access rule:** the browser calls only `/api/*` on the Next.js origin. The BFF forwards an operation only')
$null = $sb.AppendLine('if it is in this contract (allowlist, W5); `WEBHOOK` and `/health/*` rows are never forwarded, and the four')
$null = $sb.AppendLine('session routes (`login`, `refresh`, `logout`, `logout-all`) are handled only by dedicated BFF handlers because')
$null = $sb.AppendLine('`login`/`refresh` return tokens in the response body (W3).')
$null = $sb.AppendLine('')

$summary = $rows | Group-Object Phase | Sort-Object Name | ForEach-Object { "| $($_.Name) | $($_.Count) |" }
$null = $sb.AppendLine('## Operations per frontend phase')
$null = $sb.AppendLine('')
$null = $sb.AppendLine('| Phase | Operations |')
$null = $sb.AppendLine('|-------|-----------:|')
$summary | ForEach-Object { $null = $sb.AppendLine($_) }
$null = $sb.AppendLine('')

foreach ($g in ($rows | Group-Object Tag)) {
  $null = $sb.AppendLine("## $($g.Name) ($($g.Count))")
  $null = $sb.AppendLine('')
  $null = $sb.AppendLine('| Method | Path | Auth | Permission(s) | Headers | Summary | Frontend consumer | Phase |')
  $null = $sb.AppendLine('|--------|------|------|---------------|---------|---------|-------------------|-------|')
  foreach ($r in $g.Group) {
    $perm = $(if ($r.Perm) { ($r.Perm -split ',\s*' | ForEach-Object { if ($_ -like 'any of *') { 'any of `' + $_.Substring(7) + '`' } else { '`' + $_ + '`' } }) -join ', ' } else { '' })
    $null = $sb.AppendLine("| $($r.Method) | ``$($r.Path)`` | $($r.Auth) | $perm | $($r.Headers) | $($r.Summary) | $($r.Consumer) | $($r.Phase) |")
  }
  $null = $sb.AppendLine('')
}

$unmapped = @($rows | Where-Object { $_.Consumer -eq 'UNMAPPED' })
[System.IO.File]::WriteAllText($Out, $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
"operations=$($rows.Count) unmapped=$($unmapped.Count)"
$unmapped | ForEach-Object { "UNMAPPED: $($_.Method) $($_.Path)" }
$rows | Group-Object Auth | ForEach-Object { "auth $($_.Name)=$($_.Count)" }
