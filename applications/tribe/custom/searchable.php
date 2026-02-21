<?php
/**
 * Typesense Search Migration Script
 * 
 * This script migrates existing data from MySQL to Typesense search engine.
 * Run this script after setting up Typesense to index all existing content.
 * 
 * Usage: php custom/searchable.php [options]
 * Options:
 *   --type=<type>     Migrate only specific type (optional)
 *   --batch-size=<n>  Process N records at a time (default: 100)
 *   --dry-run         Show what would be migrated without actually doing it
 *   --verbose         Show detailed progress information
 *   --force           Force re-indexing even if documents already exist
 */

require __DIR__ . '/../_init.php';

// Parse command line arguments
$options = parseArgs($argv);

// Initialize classes
$config = new \Tribe\Config();

try {
    $typesense = new \Tribe\Typesense();
} catch (Exception $e) {
    log_message("❌ Failed to initialize Typesense client: " . $e->getMessage(), 'red');
    log_message("💡 Make sure you have installed the Typesense PHP client: composer require typesense/typesense-php", 'yellow');
    exit(1);
}

// Initialize Core after Typesense to avoid constructor issues
try {
    $core = new \Tribe\Core();
} catch (Exception $e) {
    log_message("❌ Failed to initialize Core class: " . $e->getMessage(), 'red');
    log_message("💡 This might be due to Typesense connection issues in Core constructor", 'yellow');
    exit(1);
}

// Configuration
$batchSize = (int)($options['batch-size'] ?? 100);
$specificType = $options['type'] ?? null;
$dryRun = isset($options['dry-run']);
$verbose = isset($options['verbose']);
$force = isset($options['force']);

// Colors for console output
$colors = [
    'green' => "\033[32m",
    'red' => "\033[31m",
    'yellow' => "\033[33m",
    'blue' => "\033[34m",
    'reset' => "\033[0m"
];

function log_message($message, $color = 'reset', $newline = true) {
    global $colors;
    echo $colors[$color] . $message . $colors['reset'] . ($newline ? PHP_EOL : '');
}

function parseArgs($argv) {
    $options = [];
    foreach ($argv as $arg) {
        if (strpos($arg, '--') === 0) {
            if (strpos($arg, '=') !== false) {
                list($key, $value) = explode('=', substr($arg, 2), 2);
                $options[$key] = $value;
            } else {
                $options[substr($arg, 2)] = true;
            }
        }
    }
    return $options;
}

function showProgress($current, $total, $type = '') {
    $percent = ($total > 0) ? round(($current / $total) * 100, 1) : 0;
    $bar = str_repeat('=', (int)($percent / 2));
    $spaces = str_repeat(' ', 50 - strlen($bar));
    echo "\r[{$bar}{$spaces}] {$percent}% ({$current}/{$total}) {$type}";
    if ($current >= $total) echo PHP_EOL;
}

// Check Typesense connection
log_message("🔍 Checking Typesense connection...", 'blue');

// First check if we can reach the host and port
$host = $_ENV['PROJECT_NAME'].'_typesense';
$port = $_ENV['TYPESENSE_INTERNAL_PORT'] ?? '8108';
$protocol = $_ENV['TYPESENSE_PROTOCOL'] ?? 'http';

log_message("🌐 Connecting to: {$protocol}://{$host}:{$port}", 'blue');

// Test basic connectivity
$connection = @fsockopen($host, $port, $errno, $errstr, 5);
if (!$connection) {
    log_message("❌ Cannot connect to Typesense server at {$host}:{$port}", 'red');
    log_message("💡 Error: {$errstr} (Code: {$errno})", 'red');
    log_message("💡 Please make sure Typesense is running:", 'yellow');
    log_message("   docker run -d --name typesense -p {$port}:8108 typesense/typesense:26.0 --data-dir /data --api-key=your-key --enable-cors", 'yellow');
    log_message("💡 Or check if the host/port configuration is correct in your .env file", 'yellow');
    exit(1);
} else {
    fclose($connection);
    log_message("✅ Basic network connection successful", 'green');
}

// Now test Typesense health endpoint
try {
    if (!$typesense->isHealthy()) {
        log_message("❌ Typesense health check failed", 'red');
        log_message("💡 Server is reachable but may be starting up or misconfigured", 'yellow');
        exit(1);
    }
    log_message("✅ Typesense health check passed", 'green');
} catch (Exception $e) {
    log_message("❌ Typesense health check error: " . $e->getMessage(), 'red');
    log_message("💡 Check your TYPESENSE_API_KEY configuration", 'yellow');
    log_message("💡 Current API key: " . (($_ENV['TYPESENSE_API_KEY'] ?? 'NOT_SET') === 'NOT_SET' ? 'NOT_SET' : '***HIDDEN***'), 'yellow');
    exit(1);
}

// Get available types
$types = $config->getTypes();

$typesToMigrate = [];

if ($specificType) {
    if (!isset($types[$specificType])) {
        log_message("❌ Type '{$specificType}' not found. Available types: " . implode(', ', array_keys($types)), 'red');
        exit(1);
    }
    $typesToMigrate = [$specificType => $types[$specificType]];
    log_message("🎯 Migrating specific type: {$specificType}", 'yellow');
} else {
    // Filter out system types that shouldn't be searched
    foreach ($types as $typeName => $typeConfig) {
        if (!in_array($typeName, ['webapp', 'apikey_record', 'deleted_record'])) {
            $typesToMigrate[$typeName] = $typeConfig;
        }
    }
    log_message("📦 Migrating all content types: " . implode(', ', array_keys($typesToMigrate)), 'yellow');
}

// Statistics tracking
$stats = [
    'total_processed' => 0,
    'total_indexed' => 0,
    'total_errors' => 0,
    'types_processed' => [],
    'start_time' => microtime(true)
];

// Process each type
foreach ($typesToMigrate as $typeName => $typeConfig) {
    log_message("\n🚀 Processing type: {$typeName}", 'blue');
    
    // Create or update collection schema
    if (!$dryRun) {
        log_message("📋 Creating/updating Typesense collection schema...", 'blue');
        try {
            $schemaResult = $typesense->createOrUpdateCollection($typeName);
            if (!$schemaResult) {
                log_message("⚠️  Warning: Failed to create/update collection schema for {$typeName}", 'yellow');
            } else {
                log_message("✅ Collection schema ready", 'green');
            }
        } catch (Exception $e) {
            log_message("❌ Schema creation failed: " . $e->getMessage(), 'red');
            continue; // Skip this type if schema creation fails
        }
    }
    
    // Get total count for this type
    $totalCount = $core->getTypeObjectsCount($typeName);
    
    if ($totalCount === 0) {
        log_message("ℹ️  No objects found for type {$typeName}, skipping...", 'yellow');
        continue;
    }
    
    log_message("📊 Found {$totalCount} objects to process", 'blue');
    
    $processed = 0;
    $indexed = 0;
    $errors = 0;
    $offset = 0;
    
    // Process in batches
    while ($offset < $totalCount) {
        $limit = min($batchSize, $totalCount - $offset);
        
        // Get batch of objects
        $ids = $core->getIDs(
            ['type' => $typeName],
            "{$offset}, {$limit}",
            'id',
            'ASC',
            false // Don't filter by privacy for migration
        );
        
        if (!$ids) {
            break;
        }
        
        $objects = $core->getObjects($ids);
        $batchObjects = [];
        
        foreach ($objects as $object) {
            if (!$object || !isset($object['id'])) {
                continue;
            }
            
            $processed++;
            $stats['total_processed']++;
            
            // Skip if object is marked as deleted
            if (($object['type'] ?? '') === 'deleted_record') {
                continue;
            }
            
            $batchObjects[] = $object;
            
            if ($verbose) {
                log_message("  Processing ID: {$object['id']}, Slug: " . ($object['slug'] ?? 'N/A'), 'blue');
            }
        }
        
        // Index batch if not dry run
        if (!$dryRun && !empty($batchObjects)) {
            try {
                $results = $typesense->bulkIndex($batchObjects, count($batchObjects));
                
                // Improved result processing for official client
                foreach ($results as $typeKey => $typeResults) {
                    if (isset($typeResults['error'])) {
                        // Handle bulk operation errors
                        $errors += count($batchObjects);
                        $stats['total_errors'] += count($batchObjects);
                        if ($verbose) {
                            log_message("  ❌ Bulk operation error: " . $typeResults['error'], 'red');
                        }
                    } else if (is_array($typeResults)) {
                        // Process individual document results
                        foreach ($typeResults as $result) {
                            if (is_array($result)) {
                                // Handle individual document responses
                                if (isset($result['success']) && $result['success']) {
                                    $indexed++;
                                    $stats['total_indexed']++;
                                } else if (isset($result['error'])) {
                                    $errors++;
                                    $stats['total_errors']++;
                                    if ($verbose) {
                                        log_message("  ❌ Index error: " . $result['error'], 'red');
                                    }
                                } else {
                                    // Assume success if no error field (official client behavior)
                                    $indexed++;
                                    $stats['total_indexed']++;
                                }
                            } else {
                                // Single success response
                                $indexed++;
                                $stats['total_indexed']++;
                            }
                        }
                    } else {
                        // Assume success for non-array responses
                        $indexed += count($batchObjects);
                        $stats['total_indexed'] += count($batchObjects);
                    }
                }
            } catch (Exception $e) {
                $errors += count($batchObjects);
                $stats['total_errors'] += count($batchObjects);
                log_message("❌ Batch indexing failed: " . $e->getMessage(), 'red');
                if ($verbose) {
                    log_message("  📝 Stack trace: " . $e->getTraceAsString(), 'red');
                }
            }
        } else if ($dryRun) {
            $indexed += count($batchObjects);
        }
        
        $offset += $limit;
        
        // Show progress
        if (!$verbose) {
            showProgress($processed, $totalCount, $typeName);
        }
        
        // Add small delay to prevent overwhelming Typesense
        if (!$dryRun && count($batchObjects) > 50) {
            usleep(100000); // 100ms delay for large batches
        }
    }
    
    // Type summary
    $typeStats = [
        'processed' => $processed,
        'indexed' => $indexed,
        'errors' => $errors
    ];
    
    $stats['types_processed'][$typeName] = $typeStats;
    
    if (!$verbose) {
        echo PHP_EOL; // New line after progress bar
    }
    
    log_message("✅ Type {$typeName} completed:", 'green');
    log_message("   📊 Processed: {$processed}", 'blue');
    log_message("   ✅ Indexed: {$indexed}", 'green');
    if ($errors > 0) {
        log_message("   ❌ Errors: {$errors}", 'red');
    }
}

// Final summary
$duration = round(microtime(true) - $stats['start_time'], 2);

log_message("\n🎉 Migration completed!", 'green');
log_message("⏱️  Duration: {$duration} seconds", 'blue');
log_message("📊 Total processed: {$stats['total_processed']}", 'blue');
log_message("✅ Total indexed: {$stats['total_indexed']}", 'green');

if ($stats['total_errors'] > 0) {
    log_message("❌ Total errors: {$stats['total_errors']}", 'red');
}

// Show per-type breakdown
if (count($stats['types_processed']) > 1) {
    log_message("\n📈 Per-type breakdown:", 'blue');
    foreach ($stats['types_processed'] as $type => $typeStats) {
        log_message("   {$type}: {$typeStats['indexed']}/{$typeStats['processed']} indexed" . 
                   ($typeStats['errors'] > 0 ? " ({$typeStats['errors']} errors)" : ""), 'blue');
    }
}

if ($dryRun) {
    log_message("\n💡 This was a dry run. No actual indexing was performed.", 'yellow');
    log_message("💡 Remove --dry-run to perform the actual migration.", 'yellow');
}

// Performance recommendations
if ($duration > 0 && $stats['total_indexed'] > 0) {
    $rate = round($stats['total_indexed'] / $duration, 2);
    log_message("\n⚡ Indexing rate: {$rate} documents/second", 'blue');
    
    if ($rate < 10) {
        log_message("💡 Consider increasing batch size or checking Typesense performance", 'yellow');
    } else if ($rate > 100) {
        log_message("🚀 Excellent indexing performance!", 'green');
    }
}

// Process dead letter queue if there were errors and the method exists
if (!$dryRun && $stats['total_errors'] > 0 && method_exists($core, 'processSearchSyncQueue')) {
    log_message("\n🔄 Processing failed sync queue...", 'blue');
    try {
        $core->processSearchSyncQueue(50);
        log_message("✅ Dead letter queue processed", 'green');
    } catch (Exception $e) {
        log_message("⚠️  Warning: Could not process sync queue: " . $e->getMessage(), 'yellow');
    }
}

log_message("\n🔍 You can now test search functionality:", 'blue');
log_message("   GET /api/v1.1/search?q=your+search+query", 'blue');
if ($specificType) {
    log_message("   GET /api/v1.1/search?q=your+query&type={$specificType}", 'blue');
}

// Show next steps
log_message("\n📚 Next steps:", 'blue');
log_message("   1. Test search functionality with the API endpoints above", 'blue');
log_message("   2. Set up automatic indexing for new/updated content", 'blue');
log_message("   3. Consider adding search functionality to your frontend", 'blue');

exit($stats['total_errors'] > 0 ? 1 : 0);
?>