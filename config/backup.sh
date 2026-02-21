#!/bin/bash

# MySQL Daily Backup Script (Cron-free version)
# This script handles MySQL backups with built-in scheduling and retention management

set -e

# Function to create backup
create_backup() {
    echo "$(date): Creating MySQL backup..."
    BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="/backups/${PROJECT_NAME}_backup_${BACKUP_DATE}.sql.gz"
    
    # Create the backup
    if mysqldump -h $DB_HOST -P $DB_PORT -u root --single-transaction --routines --triggers $DB_NAME | gzip > $BACKUP_FILE; then
        echo "$(date): Backup created successfully: $BACKUP_FILE"
        
        # Safe cleanup: only delete backups older than 7 days AND keep at least 7 most recent
        echo "$(date): Cleaning up old backups (keeping last 7 and nothing newer than 7 days)..."
        cd /backups
        
        # Count total backups
        backup_count=$(ls -1 ${PROJECT_NAME}_backup_*.sql.gz 2>/dev/null | wc -l)
        
        if [ $backup_count -gt 7 ]; then
            # Only proceed with cleanup if we have more than 7 backups
            echo "$(date): Found $backup_count backups, proceeding with cleanup..."
            
            # Get backups older than 7 days
            old_backups=$(find /backups -name "${PROJECT_NAME}_backup_*.sql.gz" -type f -mtime +7 2>/dev/null)
            
            if [ -n "$old_backups" ]; then
                # Count old backups
                old_count=$(echo "$old_backups" | wc -l)
                
                # Calculate how many we can safely delete (keep at least 7 total)
                can_delete=$((backup_count - 7))
                
                if [ $old_count -le $can_delete ]; then
                    # Safe to delete all old backups
                    echo "$(date): Deleting $old_count old backups (older than 7 days)..."
                    echo "$old_backups" | xargs rm -f
                else
                    # Only delete the oldest ones to maintain minimum count
                    echo "$(date): Can only safely delete $can_delete out of $old_count old backups..."
                    echo "$old_backups" | sort | head -n $can_delete | xargs rm -f
                fi
            else
                echo "$(date): No backups older than 7 days found"
            fi
        else
            echo "$(date): Only $backup_count backups found, skipping cleanup"
        fi
        
        echo "$(date): Backup cleanup completed"
        return 0
    else
        echo "$(date): Backup failed!"
        rm -f "$BACKUP_FILE" 2>/dev/null || true  # Clean up failed backup file
        return 1
    fi
}

# Function to check if backup needed today
check_and_backup() {
    BACKUP_MARKER="/backups/.backup_$(date +%Y%m%d)"
    
    # Check if backup already done today
    if [ ! -f "$BACKUP_MARKER" ]; then
        echo "$(date): No backup found for today, creating one..."
        if create_backup; then
            # Create marker file to indicate backup done today
            touch "$BACKUP_MARKER"
            
            # Clean up old marker files (keep only today's)
            find /backups -name '.backup_*' -type f ! -name ".backup_$(date +%Y%m%d)" -delete 2>/dev/null || true
        else
            echo "$(date): Failed to create backup"
        fi
    else
        echo "$(date): Backup already completed today"
    fi
}

# Function to calculate seconds until next 4 AM
seconds_until_4am() {
    current_hour=$(date +%H)
    current_min=$(date +%M)
    current_sec=$(date +%S)
    
    # Calculate seconds since midnight
    current_seconds=$((current_hour * 3600 + current_min * 60 + current_sec))
    
    # 4 AM is 4 * 3600 = 14400 seconds since midnight
    target_seconds=14400
    
    if [ $current_seconds -lt $target_seconds ]; then
        # 4 AM is today
        echo $((target_seconds - current_seconds))
    else
        # 4 AM is tomorrow (86400 seconds in a day)
        echo $((86400 + target_seconds - current_seconds))
    fi
}

# Main scheduling loop
schedule_backups() {
    echo "$(date): Starting backup scheduler..."
    
    while true; do
        # Check if we need a backup now (on startup or if missed)
        check_and_backup
        
        # Calculate time until next 4 AM
        sleep_seconds=$(seconds_until_4am)
        next_backup=$(date -d "+${sleep_seconds} seconds" '+%Y-%m-%d %H:%M:%S')
        
        echo "$(date): Next backup scheduled for: $next_backup"
        echo "$(date): Sleeping for $sleep_seconds seconds..."
        
        # Sleep until 4 AM, but check every hour in case of time changes
        while [ $sleep_seconds -gt 0 ]; do
            if [ $sleep_seconds -gt 3600 ]; then
                # Sleep for 1 hour and recalculate
                sleep 3600
                sleep_seconds=$(seconds_until_4am)
            else
                # Sleep until 4 AM
                sleep $sleep_seconds
                sleep_seconds=0
            fi
        done
        
        echo "$(date): Time for scheduled backup!"
    done
}

# Signal handler for graceful shutdown
cleanup() {
    echo "$(date): Received shutdown signal, creating final backup..."
    create_backup
    echo "$(date): Backup service shutting down"
    exit 0
}

# Main execution
main() {
    echo "$(date): MySQL Backup Service starting..."
    echo "$(date): Project: $PROJECT_NAME"
    echo "$(date): Database: $DB_NAME on $DB_HOST:$DB_PORT"
    echo "$(date): Backup location: /backups"
    
    # Set up signal handlers
    trap cleanup SIGTERM SIGINT
    
    # Create backups directory if it doesn't exist
    mkdir -p /backups
    
    # Start the scheduling loop
    schedule_backups
}

# Run main function
main "$@"