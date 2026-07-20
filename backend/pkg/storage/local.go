package storage

import (
	"fmt"
	"os"
	"path/filepath"
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

// GetURL constructs the static file URL.
func (p *LocalProvider) GetURL(key string) (string, error) {
	cleanKey := filepath.ToSlash(filepath.Clean(key))
	return fmt.Sprintf("%s/%s", p.baseURL, cleanKey), nil
}
