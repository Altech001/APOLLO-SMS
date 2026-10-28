package storage

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// LocalProvider implements StorageProvider for the local filesystem.
type LocalProvider struct {
	baseDir string
	baseURL string
}

// NewLocalProvider instantiates a LocalProvider.
func NewLocalProvider(baseDir, baseURL string) *LocalProvider {
	return &LocalProvider{
		baseDir: baseDir,
		baseURL: baseURL,
	}
}

// Upload writes a file to the local directory.
func (p *LocalProvider) Upload(key string, content []byte, contentType string) (string, error) {
	cleanKey := filepath.Clean(key)
	fullPath := filepath.Join(p.baseDir, cleanKey)

	// Ensure the parent directory exists
	if err := os.MkdirAll(filepath.Dir(fullPath), os.ModePerm); err != nil {
		return "", fmt.Errorf("failed to create upload directory: %w", err)
	}

	// Write file content
	if err := os.WriteFile(fullPath, content, 0644); err != nil {
		return "", fmt.Errorf("failed to write file to disk: %w", err)
	}

	return p.GetURL(key)
}

// Delete removes a file from the local directory.
func (p *LocalProvider) Delete(key string) error {
	cleanKey := filepath.Clean(key)
	fullPath := filepath.Join(p.baseDir, cleanKey)
	return os.Remove(fullPath)
}

// DeletePrefix removes every stored file whose relative key starts with prefix.
func (p *LocalProvider) DeletePrefix(prefix string) error {
	cleanPrefix := filepath.ToSlash(filepath.Clean(strings.TrimSpace(prefix)))
	if cleanPrefix == "." || cleanPrefix == "" || strings.HasPrefix(cleanPrefix, "../") {
		return fmt.Errorf("invalid storage prefix")
	}
	if _, err := os.Stat(p.baseDir); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	var matches []string
	if err := filepath.WalkDir(p.baseDir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(p.baseDir, path)
		if err != nil {
			return err
		}
		if strings.HasPrefix(filepath.ToSlash(relative), cleanPrefix) {
			matches = append(matches, path)
		}
		return nil
	}); err != nil {
		return err
	}
	for _, path := range matches {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

// GetURL constructs the static file URL.
func (p *LocalProvider) GetURL(key string) (string, error) {
	cleanKey := filepath.ToSlash(filepath.Clean(key))
	return fmt.Sprintf("%s/%s", p.baseURL, cleanKey), nil
}
