package database

import (
	"embed"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"

	"gorm.io/gorm"
)

// Versioned SQL migrations live in migrations/NNN_description.sql and are embedded in the binary.
// Each file runs once, in order, inside a transaction, and is recorded in schema_migrations.
// They run before AutoMigrate so renames happen before GORM could add duplicate columns.
// 001_initial.sql is a commented reference file kept as the baseline and is never executed.
//
//go:embed migrations/*.sql
var migrationFiles embed.FS

var migrationName = regexp.MustCompile(`^(\d{3})_[a-z0-9_]+\.sql$`)

const baselineMigrationVersion = "001"

// RunSQLMigrations applies every pending versioned SQL migration.
func RunSQLMigrations(db *gorm.DB) error {
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version    VARCHAR(16) PRIMARY KEY,
		name       VARCHAR(255) NOT NULL,
		applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`).Error; err != nil {
		return fmt.Errorf("failed to create schema_migrations: %w", err)
	}

	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if migrationName.MatchString(entry.Name()) {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)

	var applied []string
	if err := db.Raw("SELECT version FROM schema_migrations").Scan(&applied).Error; err != nil {
		return err
	}
	done := make(map[string]bool, len(applied))
	for _, v := range applied {
		done[v] = true
	}

	for _, name := range names {
		version := migrationName.FindStringSubmatch(name)[1]
		if version == baselineMigrationVersion || done[version] {
			continue
		}
		sql, err := migrationFiles.ReadFile("migrations/" + name)
		if err != nil {
			return err
		}
		err = db.Transaction(func(tx *gorm.DB) error {
			if strings.TrimSpace(string(sql)) != "" {
				if err := tx.Exec(string(sql)).Error; err != nil {
					return err
				}
			}
			return tx.Exec("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", version, name).Error
		})
		if err != nil {
			return fmt.Errorf("migration %s failed: %w", name, err)
		}
		log.Printf("✅ Applied migration %s", name)
	}
	return nil
}
