<?php
/**
 * Tribe Search API — Typesense-powered search endpoint
 *
 * Provides full-text search across the entire Tribe database or within
 * specific collections, with privacy-aware filtering, pagination,
 * faceting, grouping, geo-search, and multi-search capabilities.
 *
 * All responses are JSON. Endpoint: /search.php
 */

namespace Tribe;

require_once __DIR__ . '/vendor/autoload.php';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

header('Content-Type: application/json; charset=utf-8');

$api = new \Tribe\API();
$typesense = new \Tribe\Typesense();

// ─── CORS (delegate to API's handler via construction, but ensure JSON on all exits)
// API constructor already calls handleCors() which exits on OPTIONS.

// ─── Authentication & Privacy Resolution ─────────────────────────────────────

$hasValidApiKey = $api->validateApiKeyPublic();

// Determine privacy mode:
// 1. If TYPESENSE_SHOW_PUBLIC_OBJECTS_ONLY is explicitly "false" AND the caller
//    holds a valid API key, show all objects regardless of content_privacy.
// 2. Otherwise, restrict to content_privacy = "public".
$envShowPublicOnly = ($_ENV['TYPESENSE_SHOW_PUBLIC_OBJECTS_ONLY'] ?? 'true');
$envShowPublicOnly = strtolower(trim($envShowPublicOnly)) !== 'false'; // true by default

$showPublicOnly = true; // safe default
if (!$envShowPublicOnly && $hasValidApiKey) {
    $showPublicOnly = false;
} elseif (!$hasValidApiKey) {
    // Invalid/missing API key always means public-only, irrespective of env var
    $showPublicOnly = true;
}

// ─── Request Parsing ─────────────────────────────────────────────────────────

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method !== 'GET' && $method !== 'POST') {
    respondError(405, 'Method Not Allowed', 'Search supports GET and POST only.');
}

// POST allows JSON body for complex queries (multi-search, long filter strings)
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
} else {
    $input = [];
}

// Merge GET params with POST body; GET takes precedence for simple params
$params = array_merge($input, $_GET);

// ─── Route Detection ─────────────────────────────────────────────────────────
// Supported actions:
//   ?action=search          (default) — standard search
//   ?action=multi_search    — search multiple collections in one call
//   ?action=autocomplete    — lightweight prefix search for typeahead
//   ?action=facet           — facet-only query (no documents returned)
//   ?action=list_collections — list available Typesense collections

$action = strtolower(trim($params['action'] ?? 'search'));

switch ($action) {
    case 'search':
        handleSearch($typesense, $params, $showPublicOnly);
        break;

    case 'multi_search':
        handleMultiSearch($typesense, $params, $input, $showPublicOnly);
        break;

    case 'autocomplete':
        handleAutocomplete($typesense, $params, $showPublicOnly);
        break;

    case 'facet':
        handleFacet($typesense, $params, $showPublicOnly);
        break;

    case 'list_collections':
        handleListCollections($typesense);
        break;

    default:
        respondError(400, 'Bad Request', "Unknown action '{$action}'. Supported: search, multi_search, autocomplete, facet, list_collections.");
}

// ═════════════════════════════════════════════════════════════════════════════
// Action Handlers
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Standard search — searches a single collection or all collections.
 */
function handleSearch(Typesense $ts, array $params, bool $showPublicOnly): void
{
    $q          = trim($params['q'] ?? '*');
    $type       = $params['type'] ?? $params['collection'] ?? null;
    $queryBy    = $params['query_by'] ?? null;
    $filterBy   = $params['filter_by'] ?? null;
    $sortBy     = $params['sort_by'] ?? null;
    $facetBy    = $params['facet_by'] ?? null;
    $groupBy    = $params['group_by'] ?? null;
    $groupLimit = intval($params['group_limit'] ?? 3);
    $page       = max(1, intval($params['page'] ?? 1));
    $perPage    = intval($params['per_page'] ?? $params['limit'] ?? 10);
    $prefix     = $params['prefix'] ?? null;
    $infix      = $params['infix'] ?? null;
    $highlightFields      = $params['highlight_fields'] ?? null;
    $highlightFullFields  = $params['highlight_full_fields'] ?? null;
    $highlightAffixNumTokens = $params['highlight_affix_num_tokens'] ?? null;
    $includeFields        = $params['include_fields'] ?? null;
    $excludeFields        = $params['exclude_fields'] ?? null;
    $pinnedHits           = $params['pinned_hits'] ?? null;
    $hiddenHits           = $params['hidden_hits'] ?? null;
    $enableOverrides      = $params['enable_overrides'] ?? null;
    $preSegmentedQuery    = $params['pre_segmented_query'] ?? null;
    $exhaustiveSearch     = $params['exhaustive_search'] ?? null;
    $dropTokensThreshold  = $params['drop_tokens_threshold'] ?? null;
    $typoTokensThreshold  = $params['typo_tokens_threshold'] ?? null;
    $numTypos             = $params['num_typos'] ?? null;

    // Handle limit=-1 → return all results in a single page (Typesense max 250)
    if ($perPage === -1) {
        $perPage = 250;
        $page = 1;
    } else {
        $perPage = max(1, min($perPage, 250));
    }

    // Build privacy filter
    $privacyFilter = buildPrivacyFilter($showPublicOnly);

    // Merge user filter with privacy filter
    $effectiveFilter = mergeFilters($filterBy, $privacyFilter);

    // If no type specified, do a multi-collection search across all
    if (empty($type)) {
        $results = $ts->searchAllCollections($q, [
            'query_by'              => $queryBy,
            'filter_by'             => $effectiveFilter,
            'sort_by'               => $sortBy,
            'facet_by'              => $facetBy,
            'group_by'              => $groupBy,
            'group_limit'           => $groupLimit,
            'page'                  => $page,
            'per_page'              => $perPage,
            'prefix'                => $prefix,
            'infix'                 => $infix,
            'highlight_fields'      => $highlightFields,
            'highlight_full_fields' => $highlightFullFields,
            'highlight_affix_num_tokens' => $highlightAffixNumTokens,
            'include_fields'        => $includeFields,
            'exclude_fields'        => $excludeFields,
            'pinned_hits'           => $pinnedHits,
            'hidden_hits'           => $hiddenHits,
            'enable_overrides'      => $enableOverrides,
            'pre_segmented_query'   => $preSegmentedQuery,
            'exhaustive_search'     => $exhaustiveSearch,
            'drop_tokens_threshold' => $dropTokensThreshold,
            'typo_tokens_threshold' => $typoTokensThreshold,
            'num_typos'             => $numTypos,
        ]);
        respond($results);
    }

    // Single-collection search
    $searchParams = [
        'query_by'              => $queryBy,
        'filter_by'             => $effectiveFilter,
        'sort_by'               => $sortBy,
        'facet_by'              => $facetBy,
        'group_by'              => $groupBy,
        'group_limit'           => $groupLimit,
        'page'                  => $page,
        'per_page'              => $perPage,
        'prefix'                => $prefix,
        'infix'                 => $infix,
        'highlight_fields'      => $highlightFields,
        'highlight_full_fields' => $highlightFullFields,
        'highlight_affix_num_tokens' => $highlightAffixNumTokens,
        'include_fields'        => $includeFields,
        'exclude_fields'        => $excludeFields,
        'pinned_hits'           => $pinnedHits,
        'hidden_hits'           => $hiddenHits,
        'enable_overrides'      => $enableOverrides,
        'pre_segmented_query'   => $preSegmentedQuery,
        'exhaustive_search'     => $exhaustiveSearch,
        'drop_tokens_threshold' => $dropTokensThreshold,
        'typo_tokens_threshold' => $typoTokensThreshold,
        'num_typos'             => $numTypos,
    ];

    $results = $ts->search($type, $q, $searchParams);
    respond($results);
}

/**
 * Multi-search — execute multiple search queries in a single roundtrip.
 * Expects POST body: { "searches": [ { "collection": "...", "q": "...", ... }, ... ] }
 */
function handleMultiSearch(Typesense $ts, array $params, array $input, bool $showPublicOnly): void
{
    $searches = $input['searches'] ?? $params['searches'] ?? null;

    if (empty($searches) || !is_array($searches)) {
        respondError(400, 'Bad Request', 'multi_search requires a "searches" array in POST body with at least one search object.');
    }

    $privacyFilter = buildPrivacyFilter($showPublicOnly);

    // Inject privacy filter into each search
    foreach ($searches as &$search) {
        $existingFilter = $search['filter_by'] ?? null;
        $search['filter_by'] = mergeFilters($existingFilter, $privacyFilter);

        // Default per_page to 10 if not set
        if (!isset($search['per_page'])) {
            $search['per_page'] = 10;
        }
        if (intval($search['per_page']) === -1) {
            $search['per_page'] = 250;
            $search['page'] = 1;
        }
    }
    unset($search);

    $results = $ts->multiSearch($searches, $params['common_params'] ?? []);
    respond($results);
}

/**
 * Autocomplete — optimized prefix search for typeahead suggestions.
 * Uses prefix=true, low per_page, and limited fields by default.
 */
function handleAutocomplete(Typesense $ts, array $params, bool $showPublicOnly): void
{
    $q       = trim($params['q'] ?? '');
    $type    = $params['type'] ?? $params['collection'] ?? null;
    $queryBy = $params['query_by'] ?? null;
    $perPage = intval($params['per_page'] ?? $params['limit'] ?? 5);
    $filterBy = $params['filter_by'] ?? null;
    $includeFields = $params['include_fields'] ?? 'id,type,slug,title,name';

    if ($q === '') {
        respondError(400, 'Bad Request', 'Autocomplete requires a non-empty "q" parameter.');
    }

    if ($perPage === -1) {
        $perPage = 250;
    } else {
        $perPage = max(1, min($perPage, 50));
    }

    $privacyFilter = buildPrivacyFilter($showPublicOnly);
    $effectiveFilter = mergeFilters($filterBy, $privacyFilter);

    $searchParams = [
        'query_by'       => $queryBy,
        'filter_by'      => $effectiveFilter,
        'per_page'       => $perPage,
        'page'           => 1,
        'prefix'         => 'true',
        'include_fields' => $includeFields,
        'highlight_full_fields' => $queryBy,
    ];

    if (empty($type)) {
        $results = $ts->searchAllCollections($q, $searchParams);
    } else {
        $results = $ts->search($type, $q, $searchParams);
    }

    respond($results);
}

/**
 * Facet-only query — returns facet counts without documents.
 */
function handleFacet(Typesense $ts, array $params, bool $showPublicOnly): void
{
    $q        = trim($params['q'] ?? '*');
    $type     = $params['type'] ?? $params['collection'] ?? null;
    $facetBy  = $params['facet_by'] ?? null;
    $filterBy = $params['filter_by'] ?? null;
    $queryBy  = $params['query_by'] ?? null;
    $maxFacetValues = $params['max_facet_values'] ?? null;

    if (empty($facetBy)) {
        respondError(400, 'Bad Request', 'Facet action requires "facet_by" parameter.');
    }
    if (empty($type)) {
        respondError(400, 'Bad Request', 'Facet action requires a "type" (collection) parameter.');
    }

    $privacyFilter = buildPrivacyFilter($showPublicOnly);
    $effectiveFilter = mergeFilters($filterBy, $privacyFilter);

    $searchParams = [
        'query_by'         => $queryBy,
        'filter_by'        => $effectiveFilter,
        'facet_by'         => $facetBy,
        'max_facet_values' => $maxFacetValues,
        'per_page'         => 0,  // No documents, facets only
        'page'             => 1,
    ];

    $results = $ts->search($type, $q, $searchParams);
    respond($results);
}

/**
 * List all Typesense collections visible to this project.
 */
function handleListCollections(Typesense $ts): void
{
    $collections = $ts->listCollections();
    respond([
        'success'     => true,
        'collections' => $collections,
    ]);
}

// ═════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Build the Typesense filter_by clause for content_privacy enforcement.
 */
function buildPrivacyFilter(bool $showPublicOnly): ?string
{
    if ($showPublicOnly) {
        return 'content_privacy:=public';
    }
    return null;
}

/**
 * Merge two filter_by strings with AND logic. Either or both may be null.
 */
function mergeFilters(?string $userFilter, ?string $privacyFilter): ?string
{
    $parts = array_filter([
        $userFilter ? trim($userFilter) : null,
        $privacyFilter ? trim($privacyFilter) : null,
    ]);

    return !empty($parts) ? implode(' && ', $parts) : null;
}

/**
 * Send a successful JSON response.
 */
function respond($data): void
{
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit(0);
}

/**
 * Send a JSON error response.
 */
function respondError(int $httpCode, string $title, string $detail): void
{
    http_response_code($httpCode);
    echo json_encode([
        'success' => false,
        'errors'  => [[
            'status' => (string) $httpCode,
            'title'  => $title,
            'detail' => $detail,
        ]],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit(0);
}