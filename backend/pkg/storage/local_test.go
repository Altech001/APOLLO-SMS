package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLocalProviderDeletePrefix(t *testing.T) {
	root := t.TempDir()
	provider := NewLocalProvider(root, "http://example.test/uploads")
	for _, key := range []string{"profile_images/1_first.png", "profile_images/1_second.png", "profile_images/10_keep.png"} {
		if _, err := provider.Upload(key, []byte("image"), "image/png"); err != nil {
			t.Fatalf("upload %s: %v", key, err)
		}
	}
	if err := provider.DeletePrefix("profile_images/1_"); err != nil {
		t.Fatalf("DeletePrefix: %v", err)
	}
	for _, key := range []string{"profile_images/1_first.png", "profile_images/1_second.png"} {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(key))); !os.IsNotExist(err) {
			t.Fatalf("expected %s to be deleted, stat error: %v", key, err)
		}
	}
	if _, err := os.Stat(filepath.Join(root, "profile_images", "10_keep.png")); err != nil {
		t.Fatalf("unrelated user file was removed: %v", err)
	}
}

func TestLocalProviderDeletePrefixRejectsBroadPrefix(t *testing.T) {
	provider := NewLocalProvider(t.TempDir(), "http://example.test/uploads")
	if err := provider.DeletePrefix(""); err == nil {
		t.Fatal("expected an empty prefix to be rejected")
	}
}
