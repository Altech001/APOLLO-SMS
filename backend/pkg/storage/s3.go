package storage

import (
	"bytes"
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Provider implements StorageProvider for S3-compatible cloud APIs (e.g. AWS S3, Cloudflare R2).
type S3Provider struct {
	client        *s3.Client
	presignClient *s3.PresignClient
	bucketName    string
	publicBaseURL string
}

// NewS3Provider creates a new S3Provider configured with dynamic custom endpoints and static credentials.
func NewS3Provider(endpoint, accessKey, secretKey, bucketName, publicBaseURL string) (*S3Provider, error) {
	ctx := context.TODO()
	endpoint = strings.TrimRight(strings.TrimSpace(endpoint), "/")
	accessKey = strings.TrimSpace(accessKey)
	secretKey = strings.TrimSpace(secretKey)
	bucketName = strings.TrimSpace(bucketName)
	publicBaseURL = strings.TrimRight(strings.TrimSpace(publicBaseURL), "/")

	if endpoint == "" {
		return nil, fmt.Errorf("S3/R2 endpoint is required")
	}
	parsedEndpoint, err := url.Parse(endpoint)
	if err != nil || parsedEndpoint.Scheme == "" || parsedEndpoint.Host == "" {
		return nil, fmt.Errorf("S3/R2 endpoint must be a valid URL")
	}
	if accessKey == "" || secretKey == "" {
		return nil, fmt.Errorf("S3/R2 access key and secret key are required")
	}
	if bucketName == "" {
		return nil, fmt.Errorf("S3/R2 bucket name is required")
	}

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion("auto"),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load S3 SDK configuration: %w", err)
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})
	presignClient := s3.NewPresignClient(client)

	return &S3Provider{
		client:        client,
		presignClient: presignClient,
		bucketName:    bucketName,
		publicBaseURL: publicBaseURL,
	}, nil
}

// Upload transfers file bytes to the cloud object storage bucket.
func (p *S3Provider) Upload(key string, content []byte, contentType string) (string, error) {
	ctx := context.TODO()
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	_, err := p.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(p.bucketName),
		Key:         aws.String(key),
		Body:        bytes.NewReader(content),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload object: %w", err)
	}

	return p.GetURL(key)
}

// Delete removes an object from the cloud storage bucket.
func (p *S3Provider) Delete(key string) error {
	ctx := context.TODO()
	_, err := p.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(p.bucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed to delete object: %w", err)
	}
	return nil
}

// GetURL returns a direct public URL if configured, or a presigned URL expiring in 1 hour.
func (p *S3Provider) GetURL(key string) (string, error) {
	if p.publicBaseURL != "" {
		return fmt.Sprintf("%s/%s", p.publicBaseURL, key), nil
	}

	ctx := context.TODO()
	req, err := p.presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(p.bucketName),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(time.Hour))
	if err != nil {
		return "", fmt.Errorf("failed to presign URL: %w", err)
	}

	return req.URL, nil
}
