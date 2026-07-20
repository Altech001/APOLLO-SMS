package storage

import (
	"fmt"
)

// StorageProvider defines the interface for file storage operations.
type StorageProvider interface {
	Upload(key string, content []byte, contentType string) (string, error)
	Delete(key string) error
	GetURL(key string) (string, error)
}

// NewProvider factory instantiates a storage provider based on configuration.
func NewProvider(providerType, localDir, localBaseURL, endpoint, accessKey, secretKey, bucketName, publicBaseURL string) (StorageProvider, error) {
	switch providerType {
	case "s3", "r2":
		return NewS3Provider(endpoint, accessKey, secretKey, bucketName, publicBaseURL)
	case "local":
		return NewLocalProvider(localDir, localBaseURL), nil
	default:
		return nil, fmt.Errorf("unknown storage provider: %s", providerType)
	}
}
